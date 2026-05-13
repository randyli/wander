import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extensionDir = path.join(rootDir, 'dist')

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find(candidate => existsSync(candidate))
}

function startFixtureServer() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html>
      <html>
        <head><title>Wander E2E Fixture</title></head>
        <body>
          <main id="fixture">
            <h1>Wander E2E Fixture</h1>
            <button id="message-button">Send message target</button>
          </main>
        </body>
      </html>`)
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${address.port}/` })
    })
  })
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`)
  return response.json()
}

async function waitFor(fn, message, timeout = 15000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`)
}

class CdpSession {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.url)
    this.ws.addEventListener('message', event => {
      const payload = JSON.parse(event.data)
      if (!payload.id) return
      const callbacks = this.pending.get(payload.id)
      if (!callbacks) return
      this.pending.delete(payload.id)
      if (payload.error) callbacks.reject(new Error(payload.error.message))
      else callbacks.resolve(payload.result)
    })
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text)
    }
    return result.result.value
  }

  close() {
    this.ws?.close()
  }
}

async function main() {
  assert.ok(existsSync(extensionDir), 'dist/ must exist; run npm run build before e2e')
  const chromePath = findChrome()
  assert.ok(chromePath, 'Set CHROME_PATH or install Chrome/Chromium to run extension e2e tests')

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'wander-e2e-'))
  const { server, url: fixtureUrl } = await startFixtureServer()
  const port = 9222 + Math.floor(Math.random() * 1000)
  const chrome = spawn(chromePath, [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--headless=new',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const serviceWorker = await waitFor(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
    return targets.find(target => target.type === 'service_worker' && target.url.startsWith('chrome-extension://'))
  }, 'extension service worker did not load')

  const extensionId = new URL(serviceWorker.url).hostname
  const cdp = new CdpSession(serviceWorker.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Runtime.enable')

  try {
    const manifest = await cdp.evaluate('chrome.runtime.getManifest()')
    assert.equal(manifest.name, 'Wander', 'loads the built extension manifest')

    const tab = await cdp.evaluate(`new Promise(resolve => chrome.tabs.create({ url: ${JSON.stringify(fixtureUrl)} }, resolve))`)
    assert.ok(tab.id, 'creates a browser tab for message tests')

    await waitFor(async () => cdp.evaluate(`new Promise(resolve => chrome.tabs.get(${tab.id}, tab => resolve(tab.status === 'complete')))`), 'fixture tab did not finish loading')

    const sidePanelResult = await cdp.evaluate(`(async () => {
      try {
        await chrome.sidePanel.open({ tabId: ${tab.id} })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: String(error?.message ?? error) }
      }
    })()`)
    assert.equal(typeof sidePanelResult.ok, 'boolean', 'exercises side panel open API path')

    const sidePanelTab = await cdp.evaluate(`new Promise(resolve => chrome.tabs.create({ url: 'chrome-extension://${extensionId}/src/sidepanel/sidepanel.html' }, resolve))`)
    assert.ok(sidePanelTab.id, 'opens side panel document as an extension page')

    const toolResult = await cdp.evaluate(`new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(${tab.id}, {
        type: 'TOOL_CALL',
        requestId: 'e2e-dom-get-text',
        payload: { tool: 'dom.getText', params: { selector: '#fixture', maxLength: 200 } }
      }, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve(response)
      })
    })`)
    assert.equal(toolResult.type, 'TOOL_RESULT', 'receives a content script tool response')
    assert.equal(toolResult.payload.ok, true, 'content script tool call succeeds')
    assert.match(toolResult.payload.result, /Wander E2E Fixture/, 'content script reads fixture text')
  } finally {
    cdp.close()
    server.close()
    chrome.kill('SIGTERM')
    await rm(userDataDir, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

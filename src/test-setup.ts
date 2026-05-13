import { vi } from 'vitest'

function createChromeEvent<T extends (...args: any[]) => unknown>() {
  return {
    addListener: vi.fn<(listener: T) => void>(),
    removeListener: vi.fn<(listener: T) => void>(),
    hasListener: vi.fn<(listener: T) => boolean>(() => false),
  }
}

const manifestMock: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'Wander Test',
  version: '0.1.0',
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
    },
  ],
}

const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    getManifest: vi.fn(() => manifestMock),
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path.replace(/^\//, '')}`),
    onMessage: createChromeEvent<(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void>(),
    onInstalled: createChromeEvent<(details: chrome.runtime.InstalledDetails) => void>(),
    onStartup: createChromeEvent<() => void>(),
    id: 'test-extension-id',
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    get: vi.fn((_tabId: number, callback?: (tab: chrome.tabs.Tab) => void) => {
      callback?.({ id: 1, status: 'complete', url: 'https://example.com', windowId: 1 } as chrome.tabs.Tab)
    }),
    create: vi.fn(),
    update: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    captureVisibleTab: vi.fn(),
    onUpdated: createChromeEvent<(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void>(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  history: {
    search: vi.fn(),
  },
  bookmarks: {
    getTree: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      onChanged: createChromeEvent<(changes: Record<string, chrome.storage.StorageChange>) => void>(),
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: createChromeEvent<(alarm: chrome.alarms.Alarm) => void>(),
  },
  sidePanel: {
    open: vi.fn(),
    setPanelBehavior: vi.fn(),
  },
}

vi.stubGlobal('chrome', chromeMock)

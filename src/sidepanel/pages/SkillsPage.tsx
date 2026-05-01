import { useState, useEffect } from 'react'
import { MessageType } from '@shared/messages'
import type { SkillDef } from '@shared/types'
import FileDropZone from '../components/FileDropZone'

function send(type: MessageType, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDef[]>([])

  async function load() {
    const r = await send(MessageType.LIST_SKILLS)
    setSkills(r.payload as SkillDef[])
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>Skills</h2>
      <FileDropZone
        onFile={async (content) => { await send(MessageType.INSTALL_SKILL, { markdown: content }); load() }}
        label="Drop .md skill files here to install"
      />
      <div style={{ marginTop: 16 }}>
        {skills.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>No skills installed.</p>}
        {skills.map(skill => (
          <div key={skill.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{skill.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{skill.description}</div>
            </div>
            <button onClick={async () => { await send(MessageType.DELETE_SKILL, { name: skill.name }); load() }} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}

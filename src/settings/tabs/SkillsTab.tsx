import { useState, useEffect, useRef, useCallback } from 'react'
import type { SkillDef } from '@shared/types'

interface SkillsTabProps {
  isDarkMode: boolean
}

function send(type: string, payload?: unknown): Promise<{ payload: unknown }> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type, requestId: crypto.randomUUID(), payload }, r =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
    )
  )
}

export default function SkillsTab({ isDarkMode }: SkillsTabProps) {
  const [skills, setSkills] = useState<SkillDef[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await send('LIST_SKILLS')
    setSkills(r.payload as SkillDef[])
  }, [])

  useEffect(() => { load() }, [load])

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).filter(f => f.name.endsWith('.md')).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        send('INSTALL_SKILL', { markdown: reader.result as string }).then(() => load())
      }
      reader.readAsText(file)
    })
  }

  const cardBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold">Skills</h2>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`mb-6 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDarkMode
            ? 'border-gray-700 text-gray-400 hover:border-indigo-500 hover:text-indigo-400'
            : 'border-gray-300 text-gray-500 hover:border-indigo-500 hover:text-indigo-600'
        }`}
      >
        <p className="text-sm font-medium">Drop .md skill files here to install</p>
        <p className="mt-1 text-xs opacity-60">or click to browse</p>
        <input ref={inputRef} type="file" accept=".md" multiple hidden onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Skill list */}
      {skills.length === 0 && (
        <p className="py-4 text-sm text-gray-400">No skills installed.</p>
      )}
      <div className="space-y-3">
        {skills.map(skill => (
          <div key={skill.name} className={`flex items-center justify-between rounded-xl border ${cardBg} p-4 shadow-sm`}>
            <div>
              <div className="font-medium">{skill.name}</div>
              <div className="text-sm opacity-60">{skill.description}</div>
            </div>
            <button
              onClick={async () => { await send('DELETE_SKILL', { name: skill.name }); load() }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

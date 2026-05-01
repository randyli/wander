import { useRef } from 'react'

interface Props { onFile: (content: string, filename: string) => void; label: string }

export default function FileDropZone({ onFile, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).filter(f => f.name.endsWith('.md')).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => onFile(reader.result as string, file.name)
      reader.readAsText(file)
    })
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', color: '#6b7280', fontSize: 13 }}
    >
      {label}
      <input ref={inputRef} type="file" accept=".md" multiple hidden onChange={e => handleFiles(e.target.files)} />
    </div>
  )
}

'use client'

import { useRef } from 'react'

// Native file inputs render an unstyled, barely-visible "Choose file" control.
// This wraps a hidden <input> with a real button-looking label + the chosen filename,
// so the admin upload pages have a clear, clickable button.
export function FilePicker({
  accept,
  file,
  onPick,
  disabled,
}: {
  accept?: string
  file: File | null
  onPick: (file: File | null) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        style={{
          background: '#fff', color: '#374151', border: '1px solid #d1d5db',
          borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 14,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        Choose file
      </button>
      <span style={{ color: file ? '#111' : '#9ca3af', fontSize: 13 }}>
        {file ? file.name : 'No file chosen'}
      </span>
    </div>
  )
}

import { fileName } from '../lib/files'

// Shows a VS Code icon. The icon styles come from the @vscode/codicons package,
// whose CSS is imported once in main.tsx.
export function Codicon({ name, className = '', title }: { name: string; className?: string; title?: string }) {
  return <i className={`codicon codicon-${name} ${className}`} title={title} aria-hidden={title ? undefined : true} />
}

const BY_EXTENSION: Record<string, { icon: string; color: string }> = {
  py: { icon: 'symbol-method', color: '#4b8bbe' },
  md: { icon: 'markdown', color: '#519aba' },
  json: { icon: 'json', color: '#cbcb41' },
  txt: { icon: 'file-text', color: '#a0a0a0' },
  toml: { icon: 'settings', color: '#a0a0a0' },
  cfg: { icon: 'settings', color: '#a0a0a0' },
  ini: { icon: 'settings', color: '#a0a0a0' },
  sql: { icon: 'database', color: '#f55385' },
  db: { icon: 'database', color: '#f55385' },
}

export function FileIcon({ path }: { path: string }) {
  const name = fileName(path)
  const meta = BY_EXTENSION[name.includes('.') ? name.split('.').pop()!.toLowerCase() : '']
  return (
    <span
      className={`file-icon codicon codicon-${meta?.icon ?? 'file'}`}
      style={{ color: meta?.color ?? '#c5c5c5' }}
      aria-hidden
    />
  )
}

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <span className={`file-icon codicon codicon-${open ? 'folder-opened' : 'folder'}`} style={{ color: '#dcb67a' }} aria-hidden />
  )
}

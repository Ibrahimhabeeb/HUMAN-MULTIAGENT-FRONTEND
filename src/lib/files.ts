// Small helpers for working with file paths.

/** "app/auth.py" -> "auth.py" */
export function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

/** "app/auth.py" -> "app", "README.md" -> "" */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name
}

/** True for the folder itself and everything in it. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}

/** The Monaco language id and a display name, worked out from the extension. */
export function languageOf(path: string): { id: string; label: string } {
  if (path.endsWith('.py')) return { id: 'python', label: 'Python' }
  if (path.endsWith('.md')) return { id: 'markdown', label: 'Markdown' }
  if (path.endsWith('.json')) return { id: 'json', label: 'JSON' }
  if (path.endsWith('.js')) return { id: 'javascript', label: 'JavaScript' }
  if (path.endsWith('.ts')) return { id: 'typescript', label: 'TypeScript' }
  return { id: 'plaintext', label: 'Plain Text' }
}

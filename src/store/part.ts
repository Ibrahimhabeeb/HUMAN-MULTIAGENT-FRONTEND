import { editor } from 'monaco-editor'
import type { Mode } from '../api/types'
import { useAgents } from './agents'
import { useNotes } from './notes'
import { useSecurity } from './security'
import { useTests } from './tests'
import { useUi } from './ui'
import { useWorkspace } from './workspace'

// Clears everything from a part. Monaco keeps one text model per file path, and both tasks have
// files like README.md, so the models must go too or part 2 would show part 1's text.
export function resetPart() {
  useWorkspace.getState().reset()
  useAgents.getState().reset()
  useSecurity.getState().reset()
  useNotes.getState().reset()
  useTests.getState().reset()
  useUi.setState({ sidebarView: 'explorer', rightTab: 'chat' })
  editor.getModels().forEach((model) => model.dispose())
}

export async function loadPart(mode: Mode) {
  resetPart()
  await Promise.all([
    useWorkspace.getState().load(),
    useAgents.getState().load(mode),
    mode === 'team' ? useSecurity.getState().load() : useNotes.getState().load(),
  ])

  const { files } = useWorkspace.getState()
  useWorkspace.setState({ expanded: Object.keys(files).filter((path) => files[path].type === 'folder') })
  if (files['README.md']) useWorkspace.getState().open('README.md')
}

// Called before anything that ends or leaves the part, so no typing is lost.
export async function saveEverything() {
  await Promise.all([useWorkspace.getState().saveAll(), useNotes.getState().save()])
}

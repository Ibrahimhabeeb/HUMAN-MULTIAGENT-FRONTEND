import { createRoot } from 'react-dom/client'
import { editor } from 'monaco-editor'
import '../../src/monaco/setup'
import '../../src/styles/workbench.css'
import '../../src/styles/study.css'
import { EditorArea } from '../../src/components/EditorArea'
import { loadPart } from '../../src/store/part'
import { useWorkspace } from '../../src/store/workspace'

Object.assign(window, { taskLanding: { start: loadPart, editor, workspace: useWorkspace } })
createRoot(document.getElementById('root')!).render(<div style={{ height: '100vh' }}><EditorArea /></div>)

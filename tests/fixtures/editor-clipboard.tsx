import { createRoot } from 'react-dom/client'
import { editor } from 'monaco-editor'
import '../../src/monaco/setup'
import '../../src/styles/workbench.css'
import '../../src/styles/study.css'
import { EditorArea } from '../../src/components/EditorArea'
import { useWorkspace } from '../../src/store/workspace'

const source = [
  '# Keep this header',
  'import bcrypt',
  '',
  'def register_user(conn, username, password):',
  '    old_value = password',
  '    conn.execute("INSERT INTO users VALUES (?)", (old_value,))',
  '    conn.commit()',
  '',
  'def login(conn, username, password):',
  '    return False, "Invalid credentials"',
  '',
  '# Keep this footer',
].join('\n')

useWorkspace.setState({
  files: { 'app/auth.py': { type: 'file', content: source } },
  selectedPath: 'app/auth.py', openPaths: ['app/auth.py'], dirty: [],
})
Object.assign(window, { pasteCheck: { editor, workspace: useWorkspace, source } })
createRoot(document.getElementById('root')!).render(<div style={{ height: '100vh' }}><EditorArea /></div>)

import { createRoot } from 'react-dom/client'
import { editor } from 'monaco-editor'
import '../../src/monaco/setup'
import '../../src/styles/workbench.css'
import '../../src/styles/study.css'
import { EditorArea } from '../../src/components/EditorArea'
import { BottomPanel } from '../../src/components/BottomPanel'
import { CodeBlock } from '../../src/components/CodeBlock'
import { Markdown } from '../../src/components/Markdown'

Object.assign(window, { editorCheck: editor })
createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 420px)', height: '100vh', gap: 1 }}>
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 240px', minWidth: 0 }}>
      <EditorArea />
      <BottomPanel mode="team" />
    </div>
    <div style={{ padding: 16, overflow: 'auto', minWidth: 0 }}>
      <CodeBlock path="app/auth.py" location="login(), replace lines 12-14" code={'def login():\n    return "safe"\n'} />
      <Markdown text={'```python\ntime_limit = datetime.utcnow() - timedelta(minutes=15)\nconn.execute("DELETE FROM login_attempts WHERE attempt_time < ?", (time_limit,))\nconn.commit()\n```'} />
    </div>
  </div>,
)

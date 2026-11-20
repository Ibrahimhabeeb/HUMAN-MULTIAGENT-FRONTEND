import { createRoot } from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
import '../../src/styles/workbench.css'
import { EditedFileCard } from '../../src/components/EditedFileCard'

const approval = {
  id: 5,
  actor: 'reviewer' as const,
  action_type: 'write_fix' as const,
  status: 'written' as const,
  requested_at: '2026-10-11T10:00:00Z',
  decided_at: null,
  final_proposal: null,
  proposal: {
    vulnerability: 'V1',
    file: 'app/authentication/long_reviewed_file.py',
    find: 'unsafe_query()',
    replace: 'safe_query()',
    why: 'Use parameters.',
  },
  result: {
    item_id: 'M1', line: 12, offset: 40, after_hash: 'fixture-hash', added_lines: 2, removed_lines: 2,
    diff: [
      { kind: 'context', text: 'def login(username):' },
      { kind: 'remove', text: '    query = f"SELECT * FROM users WHERE name = {username}"' },
      { kind: 'remove', text: '    return conn.execute(query).fetchone()' },
      { kind: 'add', text: '    query = "SELECT * FROM users WHERE name = ?"' },
      { kind: 'add', text: '    return conn.execute(query, (username,)).fetchone()' },
    ],
  },
}

createRoot(document.getElementById('root')!).render(
  <div className="chat-scroll" style={{ width: '100%', maxWidth: 520, height: '100%', margin: 'auto' }}>
    <EditedFileCard approval={approval} />
  </div>,
)

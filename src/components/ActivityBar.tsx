import type { Mode } from '../api/types'
import { useAgents } from '../store/agents'
import { useUi, type SidebarView } from '../store/ui'
import { Codicon } from './Icons'

// The strip of big icons down the far left. The first two switch the sidebar
// view (the security state in team mode, the notes box in single mode);
// the third shows/hides the Agent Room.
export function ActivityBar({ mode }: { mode: Mode }) {
  // Read what we need from the store. Each line re-draws this component only
  // when that particular value changes.
  const sidebarView = useUi((s) => s.sidebarView)
  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const chatVisible = useUi((s) => s.chatVisible)
  const showSidebarView = useUi((s) => s.showSidebarView)
  const toggleChat = useUi((s) => s.toggleChat)
  const waiting = useAgents((s) => s.approvals.filter((a) => a.status === 'pending').length)

  // One button per sidebar view. "active" (the white bar) only when it's showing.
  function viewButton(view: SidebarView, icon: string, title: string) {
    const active = sidebarVisible && sidebarView === view
    return (
      <button className={active ? 'activity-item active' : 'activity-item'} title={title} onClick={() => showSidebarView(view)}>
        <Codicon name={icon} />
      </button>
    )
  }

  return (
    <nav className="activity-bar">
      {viewButton('explorer', 'files', 'Explorer (Ctrl+Shift+E)')}
      {mode === 'team'
        ? viewButton('security', 'shield', 'Shared Security State (Ctrl+Shift+Y)')
        : viewButton('notes', 'note', 'Notes (Ctrl+Shift+Y)')}
      <button
        className={chatVisible ? 'activity-item active-soft' : 'activity-item'}
        title={mode === 'team' ? 'Agent Room (Ctrl+Shift+A)' : 'Assistant (Ctrl+Shift+A)'}
        onClick={() => toggleChat()}
      >
        <Codicon name="comment-discussion" />
        {waiting > 0 && <span className="activity-badge">{waiting}</span>}
      </button>
    </nav>
  )
}

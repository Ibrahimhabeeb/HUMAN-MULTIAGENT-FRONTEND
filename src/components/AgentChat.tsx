import type { Mode } from '../api/types'
import { useAgents } from '../store/agents'
import { useUi } from '../store/ui'
import { ApprovalsView } from './Approvals'
import { ChatView } from './ChatView'
import { Codicon } from './Icons'

// The conversation (including pending decisions), suggested risks, and decision history.
export function AgentChat({ mode, showChatPrompt = false }: { mode: Mode; showChatPrompt?: boolean }) {
  const tab = useUi((s) => s.rightTab)
  const showRightTab = useUi((s) => s.showRightTab)
  const toggleChat = useUi((s) => s.toggleChat)
  const waiting = useAgents((s) => s.approvals.filter((a) => a.status === 'pending').length)

  return (
    <div className={showChatPrompt ? 'agent-chat chat-invitation' : 'agent-chat'}>
      <div className="sidebar-title">
        <span>{mode === 'team' ? 'Agent Room' : 'Assistant'}</span>
        <div className="pane-actions visible">
          <button className="icon-btn" title="Close" onClick={() => toggleChat(false)}>
            <Codicon name="close" />
          </button>
        </div>
      </div>

      <div className="right-tabs">
        <button className={tab === 'chat' ? 'panel-tab active' : 'panel-tab'} onClick={() => showRightTab('chat')}>
          Chat {waiting > 0 && <span className="badge">{waiting}</span>}
        </button>
        <button className={tab === 'approvals' ? 'panel-tab active' : 'panel-tab'} onClick={() => showRightTab('approvals')}>
          Approvals
        </button>
      </div>

      {tab === 'chat' ? <ChatView mode={mode} showChatPrompt={showChatPrompt} /> : <ApprovalsView />}
    </div>
  )
}

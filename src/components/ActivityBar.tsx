import { Codicon } from './Icons'

// The strip of big icons down the far left.
export function ActivityBar() {
  return (
    <nav className="activity-bar">
      <button className="activity-item active" title="Explorer">
        <Codicon name="files" />
      </button>
      <button className="activity-item" title="Shared Security State">
        <Codicon name="shield" />
      </button>
      <button className="activity-item" title="Agent Room">
        <Codicon name="comment-discussion" />
      </button>
    </nav>
  )
}

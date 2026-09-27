import { Codicon } from './Icons'

// The blue bar along the bottom.
export function StatusBar() {
  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-item remote">
          <Codicon name="shield" /> Secure Coding Room
        </span>
        <span className="status-item">
          <Codicon name="error" /> 0 <Codicon name="warning" /> 0
        </span>
      </div>
      <div className="status-right">
        <span className="status-item">Python</span>
        <span className="status-item">UTF-8</span>
      </div>
    </footer>
  )
}

import { Codicon } from './Icons'

// The grey bar across the top: menus, project name, Run button.
export function TitleBar() {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <nav className="menubar">
          <button className="menubar-item">File</button>
          <button className="menubar-item">Edit</button>
          <button className="menubar-item">View</button>
          <button className="menubar-item">Run</button>
          <button className="menubar-item">Terminal</button>
          <button className="menubar-item">Help</button>
        </nav>
      </div>

      <div className="titlebar-center">
        <div className="command-center">secure-login-task — Secure Coding Room</div>
      </div>

      <div className="titlebar-right">
        <button className="run-btn">
          <Codicon name="play" /> Run
        </button>
      </div>
    </header>
  )
}

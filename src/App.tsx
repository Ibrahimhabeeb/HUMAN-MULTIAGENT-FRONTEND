function Codicon({ name }: { name: string }) {
  return <i className={`codicon codicon-${name}`} />
}

function TitleBar() {
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

// The strip of big icons down the far left.
function ActivityBar() {
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

// The blue bar along the bottom.
function StatusBar() {
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

export default function App() {
  return (
    <div className="workbench">
      <TitleBar />

      {/* Everything between the title bar and the status bar, side by side */}
      <div className="workbench-main">
        <ActivityBar />

        {/* Sidebar: fixed width for now (drag-to-resize comes later) */}
        <div className="sidebar" style={{ width: 270 }}>
          <div className="sidebar-view">
            <div className="sidebar-title">
              <span>Explorer</span>
            </div>
          </div>
        </div>

        {/* Editor area: flex: 1 makes it take all the space that's left */}
        <div className="editor-area" style={{ flex: 1 }}>
          <div className="watermark">Open a file to start editing</div>
        </div>

        {/* Chat column on the right */}
        <div className="chat-panel" style={{ width: 390 }}>
          <div className="agent-chat">
            <div className="sidebar-title">
              <span>Agent Room</span>
            </div>
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  )
}

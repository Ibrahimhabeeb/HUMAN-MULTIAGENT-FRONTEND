import type { ProjectFile } from '../data/sampleFiles'
import { Codicon } from './Icons'

// What the Explorer needs from App:
// - files:        the list of files to show
// - selectedPath: which file is selected, so it can be highlighted
// - onSelect:     a function to call when a file is clicked
//
// The Explorer doesn't own this data: App does. The Explorer just shows it
// and tells App when something is clicked.
interface ExplorerProps {
  files: ProjectFile[]
  selectedPath: string | null
  onSelect: (path: string) => void
}

export function Explorer({ files, selectedPath, onSelect }: ExplorerProps) {
  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>Explorer</span>
      </div>

      <div className="pane-header">
        <Codicon name="chevron-down" />
        <span className="pane-header-title">secure-login-task</span>
      </div>

      <div className="tree">
        {/* .map() turns each file object into a row */}
        {files.map((file) => (
          <div
            key={file.path}
            className={file.path === selectedPath ? 'tree-row selected' : 'tree-row'}
            style={{ paddingLeft: 12 }}
            onClick={() => onSelect(file.path)}
          >
            <Codicon name="file" />
            <span className="tree-label">{file.path}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

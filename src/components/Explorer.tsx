import { useMemo, useRef, useState, type ReactNode } from 'react'
import { fileName, joinPath, parentOf } from '../lib/files'
import { buildTree, type TreeNode } from '../lib/tree'
import { ask } from '../store/dialog'
import { useUi } from '../store/ui'
import { useWorkspace } from '../store/workspace'
import { Codicon, FileIcon, FolderIcon } from './Icons'

// A name being typed: a new file or folder inside `folder`, or a new name for `path`.
type Draft = { kind: 'file' | 'folder'; folder: string } | { kind: 'rename'; path: string }

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const finished = useRef(false)

  function finish(name: string | null) {
    if (finished.current) return
    finished.current = true
    onDone(name)
  }

  return (
    <input
      className="inline-input"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(value)}
    />
  )
}

export function Explorer({ title }: { title: string }) {
  const files = useWorkspace((s) => s.files)
  const expanded = useWorkspace((s) => s.expanded)
  const selectedPath = useWorkspace((s) => s.selectedPath)
  const dirty = useWorkspace((s) => s.dirty)
  const [focus, setFocus] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const tree = useMemo(() => buildTree(files), [files])
  const workspace = useWorkspace.getState

  function startCreate(kind: 'file' | 'folder') {
    const folder = !focus ? '' : files[focus]?.type === 'folder' ? focus : parentOf(focus)
    if (folder) workspace().expand(folder)
    setDraft({ kind, folder })
  }

  async function finishDraft(name: string | null) {
    const current = draft
    setDraft(null)
    const clean = name?.trim()
    if (!current || !clean) return
    if (current.kind === 'rename') {
      const to = joinPath(parentOf(current.path), clean)
      if (to !== current.path) await workspace().rename(current.path, to)
      return
    }
    const path = joinPath(current.folder, clean)
    if (files[path]) {
      useUi.getState().toast(`${path} already exists`, 'error')
      return
    }
    if (current.kind === 'file') await workspace().createFile(path)
    else await workspace().createFolder(path)
    setFocus(path)
  }

  async function remove(path: string) {
    const folder = files[path]?.type === 'folder'
    const ok = await ask(
      `Delete ${fileName(path)}?`,
      folder ? 'The folder and everything in it will be deleted.' : 'The file will be deleted.',
      'Delete',
      true,
    )
    if (ok) await workspace().remove(path)
  }

  function draftRow(folder: string, depth: number): ReactNode {
    if (!draft || draft.kind === 'rename' || draft.folder !== folder) return null
    return (
      <div className="tree-row editing" style={{ paddingLeft: 8 + depth * 12 }}>
        <span className="tree-twistie" />
        {draft.kind === 'folder' ? <FolderIcon open={false} /> : <Codicon name="file" className="file-icon" />}
        <NameInput initial="" onDone={finishDraft} />
      </div>
    )
  }

  function rows(nodes: TreeNode[], depth: number): ReactNode[] {
    return nodes.map((node) => {
      const open = expanded.includes(node.path)
      const renaming = draft?.kind === 'rename' && draft.path === node.path
      const classes = ['tree-row', node.path === selectedPath && !node.folder ? 'selected' : '', renaming ? 'editing' : '']
      return (
        <div key={node.path}>
          <div
            className={classes.join(' ')}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={node.path}
            onClick={() => {
              setFocus(node.path)
              if (node.folder) workspace().toggleFolder(node.path)
              else workspace().open(node.path)
            }}
          >
            {node.folder ? <Codicon name={open ? 'chevron-down' : 'chevron-right'} className="tree-twistie" /> : <span className="tree-twistie" />}
            {node.folder ? <FolderIcon open={open} /> : <FileIcon path={node.path} />}
            {renaming ? (
              <NameInput initial={node.name} onDone={finishDraft} />
            ) : (
              <>
                <span className={dirty.includes(node.path) ? 'tree-label dirty' : 'tree-label'}>{node.name}</span>
                <span className="row-actions">
                  <button
                    className="icon-btn small"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDraft({ kind: 'rename', path: node.path })
                    }}
                  >
                    <Codicon name="edit" />
                  </button>
                  <button
                    className="icon-btn small"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(node.path)
                    }}
                  >
                    <Codicon name="trash" />
                  </button>
                </span>
              </>
            )}
          </div>
          {node.folder && open && (
            <>
              {draftRow(node.path, depth + 1)}
              {rows(node.children, depth + 1)}
            </>
          )}
        </div>
      )
    })
  }

  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>Explorer</span>
        <div className="pane-actions visible">
          <button className="icon-btn" title="New File" onClick={() => startCreate('file')}>
            <Codicon name="new-file" />
          </button>
          <button className="icon-btn" title="New Folder" onClick={() => startCreate('folder')}>
            <Codicon name="new-folder" />
          </button>
          <button className="icon-btn" title="Refresh" onClick={() => void workspace().load()}>
            <Codicon name="refresh" />
          </button>
          <button className="icon-btn" title="Collapse Folders" onClick={() => useWorkspace.setState({ expanded: [] })}>
            <Codicon name="collapse-all" />
          </button>
        </div>
      </div>

      <div className="pane-header" onClick={() => setFocus(null)}>
        <Codicon name="chevron-down" />
        <span className="pane-header-title">{title}</span>
      </div>

      <div className="tree" onClick={(e) => e.target === e.currentTarget && setFocus(null)}>
        {draftRow('', 0)}
        {rows(tree, 0)}
      </div>
    </div>
  )
}

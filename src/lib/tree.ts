import type { FileMap } from '../api/types'
import { fileName, parentOf } from './files'

export interface TreeNode {
  path: string
  name: string
  folder: boolean
  children: TreeNode[]
}

// Turns the backend's flat map ("app", "app/auth.py", ...) into nested folders, folders first.
export function buildTree(files: FileMap): TreeNode[] {
  const root: TreeNode = { path: '', name: '', folder: true, children: [] }
  const nodes = new Map<string, TreeNode>([['', root]])

  function folder(path: string): TreeNode {
    const existing = nodes.get(path)
    if (existing) return existing
    const node: TreeNode = { path, name: fileName(path), folder: true, children: [] }
    nodes.set(path, node)
    folder(parentOf(path)).children.push(node)
    return node
  }

  for (const [path, node] of Object.entries(files)) {
    if (node.type === 'folder') folder(path)
    else folder(parentOf(path)).children.push({ path, name: fileName(path), folder: false, children: [] })
  }

  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => (a.folder === b.folder ? a.name.localeCompare(b.name) : a.folder ? -1 : 1))
    node.children.forEach(sort)
  }
  sort(root)
  return root.children
}

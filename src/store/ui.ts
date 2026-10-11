import { create } from 'zustand'

// A "store" is state that lives OUTSIDE any component. Any component can read it
// with useUi(...) and change it by calling its functions, with no props passed
// down through App. When a value changes, only components that read it redraw.
//
// This one holds the layout: which panels are showing and which view/tab is active.

export type SidebarView = 'explorer' | 'security' | 'notes'
export type BottomTab = 'tests' | 'output' | 'problems'
export type RightTab = 'chat' | 'approvals'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

interface UiState {
  // ---- values ----
  sidebarView: SidebarView
  sidebarVisible: boolean
  panelVisible: boolean
  chatVisible: boolean
  bottomTab: BottomTab
  rightTab: RightTab
  toasts: Toast[]

  // ---- functions that change them ----
  showSidebarView: (view: SidebarView) => void
  toggleSidebar: (open?: boolean) => void
  togglePanel: (open?: boolean) => void
  toggleChat: (open?: boolean) => void
  setBottomTab: (tab: BottomTab) => void
  showRightTab: (tab: RightTab) => void
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

// create() builds the store. `set` updates values, `get` reads the current ones.
export const useUi = create<UiState>((set, get) => ({
  // Starting values
  sidebarView: 'explorer',
  sidebarVisible: true,
  panelVisible: true,
  chatVisible: true,
  bottomTab: 'tests',
  rightTab: 'chat',
  toasts: [],

  // Clicking an activity-bar icon: show that view. Clicking the view that's
  // already showing hides the sidebar instead, like VS Code.
  showSidebarView: (view) => {
    const { sidebarView, sidebarVisible } = get()
    if (sidebarVisible && sidebarView === view) set({ sidebarVisible: false })
    else set({ sidebarView: view, sidebarVisible: true })
  },

  // `open?` is optional: pass true/false to force a state, or nothing to flip it.
  toggleSidebar: (open) => set({ sidebarVisible: open ?? !get().sidebarVisible }),
  togglePanel: (open) => set({ panelVisible: open ?? !get().panelVisible }),
  toggleChat: (open) => set({ chatVisible: open ?? !get().chatVisible }),

  // Picking a bottom tab also makes sure the panel is visible.
  setBottomTab: (tab) => set({ bottomTab: tab, panelVisible: true }),
  showRightTab: (tab) => set({ rightTab: tab, chatVisible: true }),

  toast: (text, kind = 'info') => {
    const id = nextToastId++
    set({ toasts: [...get().toasts, { id, text, kind }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 5000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export function showError(error: unknown) {
  useUi.getState().toast(error instanceof Error ? error.message : String(error), 'error')
}

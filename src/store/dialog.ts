import { create } from 'zustand'

interface DialogRequest {
  title: string
  message: string
  confirm: string
  danger: boolean
  resolve: (ok: boolean) => void
}

export const useDialog = create<{ request: DialogRequest | null }>(() => ({ request: null }))

// Shows the confirmation dialog and waits for the answer: `if (await ask(...)) { ... }`
export function ask(title: string, message: string, confirm: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.setState({ request: { title, message, confirm, danger, resolve } })
  })
}

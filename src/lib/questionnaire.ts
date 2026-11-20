import type { Mode, Question } from '../api/types'

const MODE_NAMES: Record<Mode, string> = {
  team: 'agent team',
  single: 'single assistant',
}

export function questionText(question: Question, mode?: Mode): string {
  return mode ? question.text.replaceAll('{mode}', MODE_NAMES[mode]) : question.text
}

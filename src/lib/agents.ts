import type { ActionType, Message, Mode, Specialist, Thread } from '../api/types'

export const MODE_NAMES: Record<Mode, string> = { team: 'Agent team', single: 'Single assistant' }
export const THREAD: Record<Mode, Thread> = { team: 'team', single: 'assistant' }

export const AGENTS: Record<string, { name: string; icon: string; color: string }> = {
  facilitator: { name: 'Facilitator', icon: 'organization', color: '#c586c0' },
  planner: { name: 'Planner', icon: 'checklist', color: '#4fc1ff' },
  threat_modeller: { name: 'Threat Modeller', icon: 'shield', color: '#f48771' },
  reviewer: { name: 'Code Reviewer', icon: 'eye', color: '#dcdcaa' },
  verifier: { name: 'Test/Verifier', icon: 'beaker', color: '#89d185' },
  assistant: { name: 'Assistant', icon: 'sparkle', color: '#75beff' },
}

export const SPECIALISTS: Specialist[] = ['planner', 'threat_modeller', 'reviewer', 'verifier']

export const ACTION_LABELS: Record<ActionType, string> = {
  propose_assumption: 'New assumption',
  propose_risk: 'Suggested risk',
  propose_vulnerability: 'New vulnerability',
  mark_resolved: 'Mark fix as implemented',
  propose_test: 'New test file',
  suggest_fix: 'Suggested fix',
  write_fix: 'Fix written',
}

/** The agents on the latest developer message's route that haven't answered it yet, in order. */
export function stillToAnswer(messages: Message[]): Specialist[] {
  const asked = messages.findLast((m) => m.role === 'human')
  if (!asked) return []
  const answered = new Set(messages.filter((m) => m.data.reply_to === asked.id).map((m) => m.data.agent))
  return (asked.data.route ?? []).filter((agent) => !answered.has(agent))
}

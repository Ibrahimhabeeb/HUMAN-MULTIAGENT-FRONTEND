// The same neutral message starts a review in both modes.
export const REVIEW_MESSAGE = 'Please review this code:'

export const NO_VULNERABILITIES_NOTICE =
  'The Test/Verifier writes tests against approved vulnerabilities. There are none yet, so it had nothing to test.'

export function followUpPending(message: import('../api/types').Message): boolean {
  return message.data.kind === 'vulnerability_follow_up' && ['queued', 'running'].includes(message.data.status ?? '')
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { mapOffset, textEdits } from '../src/lib/textEdits.ts'

function apply(source, edits) {
  return [...edits].reverse().reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}

test('separate updates leave an unchanged selected section outside the edited ranges', () => {
  const before = 'header\nselected code\nfooter'
  const after = 'updated header\nselected code\nupdated footer'
  const start = before.indexOf('selected code')
  const end = start + 'selected code'.length
  const edits = textEdits(before, after)
  assert.equal(apply(before, edits), after)
  assert.ok(edits.length >= 2)
  assert.ok(edits.every(edit => edit.end <= start || edit.start >= end))
  assert.equal(after.slice(mapOffset(start, edits, true), mapOffset(end, edits, false)), 'selected code')
})

test('text edits preserve Unicode, blank lines, insertion and deletion exactly', () => {
  for (const [before, after] of [
    ['', 'new code'], ['old code', ''], ['same', 'same'],
    ['🐍 = "hello"\n\nreturn old', '🐍 = "world"\n\nreturn new'],
    ['prefix\nline\nsuffix', 'prefix\nnew\nline\nextra\nsuffix'],
    ['one\ntwo\nthree', 'one\nthree'],
  ]) assert.equal(apply(before, textEdits(before, after)), after)
})

test('insertions at selection boundaries do not become part of the highlighted code', () => {
  const edits = [{ start: 2, end: 2, text: 'before' }, { start: 6, end: 6, text: 'after' }]
  assert.equal(mapOffset(2, edits, true), 8)
  assert.equal(mapOffset(6, edits, false), 12)
})

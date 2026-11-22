import assert from 'node:assert/strict'
import test from 'node:test'
import { taskEntry } from '../src/lib/taskEntry.ts'

const file = content => ({ type: 'file', content })

test('starts in the marked implementation instead of helper files or tests', () => {
  assert.deepEqual(taskEntry({
    'README.md': file('Start by implementing register_user in app/auth.py.'),
    'tests/test_example.py': file('def test_example():\n    # Write your code here.'),
    'app/db.py': file('def get_connection():\n    return None'),
    'app/auth.py': file('def register_user(conn, username, password):\n    # Write your code here.\n    raise NotImplementedError\n\ndef login(conn, username, password):\n    # Write your code here.'),
  }), { path: 'app/auth.py', row: 1 })
})

test('locates multiline function signatures after imports and supports Windows line endings', () => {
  assert.deepEqual(taskEntry({
    'app/account.py': file('from app.models import Account\r\n\r\ndef update_email(\r\n    account: Account, email: str,\r\n):\r\n    # Write your code here.'),
    'app/models.py': file('class Account:\r\n    pass'),
  }), { path: 'app/account.py', row: 3 })
})

test('does not invent an entry file when no task function is marked', () => {
  assert.equal(taskEntry({ 'README.md': file('Instructions'), 'app': { type: 'folder' } }), null)
})

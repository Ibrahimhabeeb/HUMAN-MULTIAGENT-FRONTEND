import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

async function template(root, prefix = '', files = {}) {
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    if (['__pycache__', '.pytest_cache'].includes(entry.name)) continue
    const path = prefix + entry.name
    if (entry.isDirectory()) {
      files[path] = { type: 'folder' }
      await template(root, path + '/', files)
    } else files[path] = { type: 'file', content: await readFile(join(root, path), 'utf8') }
  }
  return files
}

const expected = { A: 'app/auth.py', B: 'app/storage.py', C: 'app/comments.py', D: 'app/preferences.py', E: 'app/account.py', F: 'app/documents.py', G: 'app/audit.py' }
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-task-landing', plugins: [react(), {
  name: 'task-landing-fixture',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url !== '/_task-landing') return next()
      response.setHeader('Content-Type', 'text/html')
      response.end(await vite.transformIndexHtml(request.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/tests/fixtures/task-landing.tsx"></script></body></html>'))
    })
  },
}], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } })

let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  let files = {}
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('secure-coding-room.session', 'x'.repeat(43)))
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/workspace/files')) return route.fulfill({ json: files })
    if (path.endsWith('/chat')) return route.fulfill({ json: { team: [], assistant: [] } })
    if (path.endsWith('/approvals')) return route.fulfill({ json: [] })
    if (path.endsWith('/workspace/notes')) return route.fulfill({ json: { text: '' } })
    if (path.endsWith('/workspace/state')) return route.fulfill({ json: { assumptions: [], risks: [], vulnerabilities: [], mitigations: [], tests: [] } })
    if (path.endsWith('/workspace/lint')) return route.fulfill({ json: { path: route.request().postDataJSON().path, diagnostics: [] } })
    errors.push(`Unexpected API request: ${path}`)
    return route.abort()
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/_task-landing`)
  await expect.poll(() => page.evaluate(() => Boolean(window.taskLanding))).toBe(true)
  for (const mode of ['team', 'single']) {
    for (const [task, path] of Object.entries(expected)) {
      files = await template(`../backend/starter/task_${task}`)
      await page.evaluate(mode => window.taskLanding.start(mode), mode)
      await expect(page.locator('.tab.active')).toHaveText(path.split('/').at(-1))
      await expect.poll(() => page.evaluate(() => window.taskLanding.editor.getEditors()[0]?.getModel()?.uri.toString())).toMatch(new RegExp(path.replaceAll('.', '\\.') + '$'))
      const row = files[path].content.split(/\r?\n/).findIndex(line => /^def\s/.test(line)) + 1
      await expect.poll(() => page.evaluate(() => window.taskLanding.editor.getEditors()[0].getPosition().lineNumber)).toBe(row)
      assert.deepEqual(await page.evaluate(() => window.taskLanding.workspace.getState().openPaths), ['README.md', path])
      console.log(`${mode}, task ${task}: opened ${path} at line ${row}`)
    }
  }
  await page.locator('.tab').filter({ hasText: 'README.md' }).click()
  await page.evaluate(() => window.taskLanding.workspace.getState().load())
  await expect(page.locator('.tab.active')).toHaveText('README.md')
  assert.deepEqual(errors, [])
  console.log('All seven tasks land on their implementation function in both modes; refresh preserves a later file choice.')
} finally {
  await browser?.close()
  await server.close()
}

import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false, cacheDir: 'node_modules/.vite-editor-clipboard', plugins: [react(), {
    name: 'editor-clipboard-fixture',
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url !== '/_editor-clipboard') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end(await vite.transformIndexHtml(request.url,
          '<html><body style="margin:0"><div id="root"></div><script type="module" src="/tests/fixtures/editor-clipboard.tsx"></script></body></html>'))
      })
    },
  }], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
})

let browser
let releaseRead
try {
  await server.listen()
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }), headless: true })
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('secure-coding-room.session', 'x'.repeat(43)))
  let stored = null
  let pendingRead = null
  const writes = []
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'PUT' && path.endsWith('/workspace/files/app/auth.py')) {
      stored = request.postDataJSON().content
      writes.push(stored)
      return route.fulfill({ json: { type: 'file', content: stored } })
    }
    if (path.endsWith('/workspace/files')) {
      const content = stored
      if (pendingRead) {
        const pending = pendingRead
        pendingRead = null
        pending.started = true
        await pending.released
      }
      return route.fulfill({ json: { 'app/auth.py': { type: 'file', content } } })
    }
    return route.fulfill({ json: { diagnostics: [], items: [] } })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/_editor-clipboard`)
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 })
  await expect.poll(() => page.evaluate(() => window.pasteCheck?.editor.getEditors().length)).toBe(1)
  const source = await page.evaluate(() => window.pasteCheck.source)
  stored = source

  async function reset() {
    await page.evaluate(source => {
      const editor = window.pasteCheck.editor.getEditors()[0]
      editor.setValue(source)
      editor.setPosition({ lineNumber: 1, column: 1 })
      editor.focus()
    }, source)
    await page.evaluate(() => window.pasteCheck.workspace.getState().saveAll())
    stored = source
  }

  async function select(start, end, backwards = false) {
    const points = await page.evaluate(({ start, end }) => {
      const editor = window.pasteCheck.editor.getEditors()[0]
      const rect = editor.getDomNode().getBoundingClientRect()
      return [start, end].map(position => {
        const point = editor.getScrolledVisiblePosition(position)
        return { x: rect.left + point.left, y: rect.top + point.top + point.height / 2 }
      })
    }, { start, end })
    if (backwards) points.reverse()
    await page.mouse.move(points[0].x, points[0].y)
    await page.mouse.down()
    await page.mouse.move(points[1].x, points[1].y, { steps: 10 })
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => {
      const editor = window.pasteCheck.editor.getEditors()[0]
      return editor.getModel().getValueInRange(editor.getSelection())
    })).not.toBe('')
  }

  async function paste(text) {
    const before = await page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())
    const expected = await page.evaluate(text => {
      const editor = window.pasteCheck.editor.getEditors()[0]
      const model = editor.getModel()
      const range = editor.getSelection()
      return model.getValue().slice(0, model.getOffsetAt(range.getStartPosition())) + text
        + model.getValue().slice(model.getOffsetAt(range.getEndPosition()))
    }, text)
    await page.evaluate(text => navigator.clipboard.writeText(text), text)
    await page.keyboard.press('Control+V')
    await expect.poll(() => page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())).toBe(expected)
    assert.ok(expected.includes('# Keep this header') && expected.includes('# Keep this footer'))
    await page.keyboard.press('Control+Z')
    await expect.poll(() => page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())).toBe(before)
  }

  await reset()
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 })
  await paste('new_value')
  console.log('Forward mouse selection: passed')

  await reset()
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 }, true)
  await paste('new_value')
  console.log('Backward mouse selection: passed')

  await reset()
  await select({ lineNumber: 5, column: 1 }, { lineNumber: 8, column: 1 })
  await paste('    new_value = password\n    conn.execute("SELECT ?", (new_value,))\n    conn.commit()\n')
  console.log('Multiline mouse selection: passed')

  await reset()
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 })
  await page.keyboard.press('Control+C')
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'old_value')
  await select({ lineNumber: 10, column: 20 }, { lineNumber: 10, column: 39 })
  await paste('old_value')
  console.log('Editor copy and selected paste: passed')

  await reset()
  await page.evaluate(() => window.pasteCheck.workspace.getState().saveAll())
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 })
  stored = source.replace('# Keep this header', '# Keep this header updated').replace('# Keep this footer', '# Keep this footer updated')
  await page.evaluate(() => window.pasteCheck.workspace.getState().load())
  const refreshedSelection = await page.evaluate(() => {
    const editor = window.pasteCheck.editor.getEditors()[0]
    return { selection: editor.getSelection(), text: editor.getModel().getValueInRange(editor.getSelection()) }
  })
  assert.equal(refreshedSelection.text, 'old_value', JSON.stringify(refreshedSelection))
  await paste('new_value')
  console.log('Selection survives independent server edits above and below it: passed')

  await reset()
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 }, true)
  stored = source.replace('# Keep this header', '# Keep this header\n# Added line above').replace('# Keep this footer', '# Added line below\n# Keep this footer')
  await page.evaluate(() => window.pasteCheck.workspace.getState().load())
  assert.equal(await page.evaluate(() => {
    const editor = window.pasteCheck.editor.getEditors()[0]
    const selection = editor.getSelection()
    return editor.getModel().getValueInRange(selection) === 'old_value'
      && selection.selectionStartColumn > selection.positionColumn
  }), true)
  await paste('new_value')
  console.log('Backward selection follows lines inserted above it: passed')

  await reset()
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 })
  stored = source.replace('old_value = password', 'new_value = password')
  await page.evaluate(() => window.pasteCheck.workspace.getState().load())
  assert.equal(await page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getSelection().isEmpty()), true)
  await paste('x')
  console.log('A changed selection collapses instead of expanding over unrelated code: passed')

  await reset()
  const delayed = { started: false, released: new Promise(resolve => { releaseRead = resolve }) }
  pendingRead = delayed
  const loading = page.evaluate(() => window.pasteCheck.workspace.getState().load())
  await expect.poll(() => delayed.started).toBe(true)
  await select({ lineNumber: 5, column: 5 }, { lineNumber: 5, column: 14 })
  await page.evaluate(() => navigator.clipboard.writeText('new_value'))
  await page.keyboard.press('Control+V')
  const pasted = source.replace('old_value = password', 'new_value = password')
  await expect.poll(() => page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())).toBe(pasted)
  await page.evaluate(() => window.pasteCheck.workspace.getState().saveAll())
  assert.deepEqual(await page.evaluate(() => window.pasteCheck.workspace.getState().dirty), [])
  releaseRead()
  await loading
  assert.equal(await page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue()), pasted)
  assert.equal(await page.evaluate(() => window.pasteCheck.workspace.getState().files['app/auth.py'].content), pasted)
  console.log('A stale refresh cannot overwrite pasted text after autosave completes: passed')

  await reset()
  await page.keyboard.press('Control+A')
  const replacement = '# Deliberately replace the whole file\n'
  await page.evaluate(text => navigator.clipboard.writeText(text), replacement)
  await page.keyboard.press('Control+V')
  await expect.poll(() => page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())).toBe(replacement)
  await page.keyboard.press('Control+Z')
  await expect.poll(() => page.evaluate(() => window.pasteCheck.editor.getEditors()[0].getValue())).toBe(source)
  console.log('Intentional Select All and paste still works, with Undo: passed')
  await page.evaluate(() => window.pasteCheck.workspace.getState().saveAll())
  assert.ok(writes.length > 0)
  assert.deepEqual(errors, [])
  console.log('Clipboard selection checks passed with the real workspace store and native keyboard paste.')
} finally {
  releaseRead?.()
  await browser?.close()
  await server.close()
}

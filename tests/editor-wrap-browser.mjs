import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const source = [
  'def update_email(',
  '    account: dict[str, str], session: dict[str, str], email: str, request_token: str | None, extra_context: dict[str, str],',
  ') -> dict[str, str]:',
  '    # TODO: reject a missing or incorrect request token before updating the email and recording the attempted change.',
  '    raise NotImplementedError',
].join('\n')

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-editor-wrap',
  plugins: [react(), {
    name: 'editor-wrap-fixture',
    enforce: 'pre',
    resolveId(id) {
      if (/(?:store\/|^\.\/)(workspace|tests)$/.test(id)) return `\0wrap-store:${id.split('/').at(-1)}`
    },
    load(id) {
      if (id === '\0wrap-store:workspace') return `
        import { create } from 'zustand';
        export const useWorkspace = create((set) => ({
          files: { 'app/account.py': { type: 'file', content: ${JSON.stringify(source)} } },
          openPaths: ['app/account.py'], selectedPath: 'app/account.py', dirty: [],
          open: () => {}, close: () => {}, saveAll: async () => {},
          edit: (path, content) => set((s) => ({ files: { ...s.files, [path]: { type: 'file', content } } })),
        }));`
      if (id === '\0wrap-store:tests') return `import { create } from 'zustand'; export const useTests = create(() => ({ result: null, running: false, run: () => {} }));`
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url !== '/_editor-wrap-check') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end(await vite.transformIndexHtml(request.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/tests/fixtures/code-area.tsx"></script></body></html>'))
      })
    },
  }],
  server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
})

let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('secure-coding-room.session', 'x'.repeat(43)))
  const completionCalls = []
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (route.request().url().endsWith('/workspace/completions')) {
      const request = route.request().postDataJSON()
      completionCalls.push(request)
      return route.fulfill({ json: { items: request.content.endsWith('value.')
        ? [{ name: 'upper', type: 'function', description: 'str.upper' }]
        : [] } })
    }
    return route.fulfill({ json: { diagnostics: [] } })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/_editor-wrap-check`)
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 })

  async function checkWrap() {
    const result = await page.evaluate(() => {
      const instance = window.editorCheck.getEditors()[0]
      const options = window.editorCheck.EditorOption
      return {
        mode: instance.getOption(options.wordWrap),
        column: instance.getOption(options.wordWrapColumn),
        visualLines: document.querySelectorAll('.monaco-editor .view-line').length,
        sourceLines: instance.getModel().getLineCount(),
        scrollWidth: instance.getScrollWidth(),
        editorWidth: instance.getLayoutInfo().width,
      }
    })
    assert.equal(result.mode, 'bounded')
    assert.equal(result.column, 88)
    assert.ok(result.visualLines > result.sourceLines, JSON.stringify(result))
    assert.ok(result.scrollWidth <= result.editorWidth + 2, JSON.stringify(result))
  }

  await expect.poll(() => page.locator('.monaco-editor .view-line').count()).toBeGreaterThan(5)
  await checkWrap()
  await mkdir('node_modules/.tmp', { recursive: true })
  await page.screenshot({ path: 'node_modules/.tmp/editor-wrap-desktop.png' })

  await page.evaluate(() => {
    const layout = document.querySelector('#root > div')
    layout.style.gridTemplateColumns = 'minmax(0, 1fr)'
    layout.children[1].style.display = 'none'
  })
  await page.setViewportSize({ width: 600, height: 760 })
  await expect.poll(() => page.locator('.monaco-editor').evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(601)
  await checkWrap()
  await page.screenshot({ path: 'node_modules/.tmp/editor-wrap-narrow.png' })

  await page.evaluate(() => {
    const instance = window.editorCheck.getEditors()[0]
    instance.setValue('value: str = "hello"\nvalue')
    instance.setPosition({ lineNumber: 2, column: 6 })
    instance.focus()
  })
  await page.keyboard.type('.')
  await expect(page.locator('.suggest-widget')).toBeVisible()
  await expect(page.locator('.suggest-widget')).toContainText('upper')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toBeVisible()
  await expect(page.locator('.suggest-widget .label-name')).toBeVisible()
  assert.ok(completionCalls.some((call) => call.path === 'app/account.py' && call.content.endsWith('value.')))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: 'node_modules/.tmp/editor-completions-visible.png' })
  await page.locator('.suggest-widget .monaco-list-row').first().click()
  await expect.poll(() => page.evaluate(() => window.editorCheck.getEditors()[0].getValue())).toBe('value: str = "hello"\nvalue.upper')

  await page.evaluate(() => {
    const instance = window.editorCheck.getEditors()[0]
    instance.setValue('previous_value = 1\npr')
    instance.setPosition({ lineNumber: 2, column: 3 })
    instance.focus()
  })
  await page.keyboard.type('e')
  await expect(page.locator('.suggest-widget')).toContainText('previous_value')
  assert.deepEqual(errors, [])
  console.log('Editor wrap and Python completion checks passed at desktop and narrow widths.')
} finally {
  await browser?.close()
  await server.close()
}

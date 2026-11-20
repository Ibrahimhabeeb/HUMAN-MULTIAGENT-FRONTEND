import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const output = process.env.EDIT_CARD_OUTPUT_DIR ?? 'node_modules/.tmp'
const server = await createServer({ configFile: false, cacheDir: process.env.EDIT_CARD_CACHE_DIR ?? 'node_modules/.vite-edit-card', plugins: [react(), {
  name: 'edit-card-browser-fixtures', enforce: 'pre',
  resolveId(source) {
    const name = source.split('/').at(-1)
    if (['agents', 'workspace', 'diagnostics', 'dialog'].includes(name) && /(?:store\/|^\.\.)/.test(source)) return `\0edit-card-store:${name}`
  },
  load(id) {
    if (id === '\0edit-card-store:agents') return `import { create } from 'zustand';
      export const useAgents = create(() => ({ undoing: false, messages: [], undoFix: async (id) => { window.undoCalls = (window.undoCalls || 0) + 1; return null } }));`
    if (id === '\0edit-card-store:workspace') return 'export const useWorkspace = { getState: () => ({ open: () => {} }) };'
    if (id === '\0edit-card-store:diagnostics') return 'export const useDiagnostics = { getState: () => ({ navigate: () => {} }) };'
    if (id === '\0edit-card-store:dialog') return 'export const ask = async () => true;'
  },
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/_edited-file-card') return next()
      res.setHeader('Content-Type', 'text/html')
      res.end(await vite.transformIndexHtml(req.url, '<html><head><title>Edited file card</title></head><body><div id="root"></div><script type="module" src="/tests/fixtures/edited-file-card.tsx"></script></body></html>'))
    })
  },
}], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } })

let browser
try {
  await mkdir(output, { recursive: true })
  await server.listen()
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const address = server.httpServer.address()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/_edited-file-card`)
  const card = page.getByRole('region', { name: 'Code Reviewer edit to app/authentication/long_reviewed_file.py' })
  await expect(card).toBeVisible()
  await expect(card.getByText('+2')).toBeVisible()
  await expect(card.getByText('-2')).toBeVisible()
  await expect(card.locator('.file-edit-line')).toHaveCount(0)
  await card.getByRole('button', { name: 'View changes' }).click()
  await expect(card.locator('.file-edit-line')).toHaveCount(5)
  await expect(card.locator('.file-edit-line.add')).toHaveCount(2)
  await expect(card.locator('.file-edit-line.remove')).toHaveCount(2)
  await page.screenshot({ path: join(output, 'edited-file-card-desktop.png') })

  await page.setViewportSize({ width: 340, height: 720 })
  await expect(card.getByRole('button', { name: 'Hide changes' })).toBeVisible()
  assert.ok(await card.evaluate((element) => element.getBoundingClientRect().right <= innerWidth))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: join(output, 'edited-file-card-narrow.png') })
  await card.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => page.evaluate(() => window.undoCalls)).toBe(1)
  assert.deepEqual(errors, [])
  console.log('Edited-file card browser checks passed.')
} finally {
  await browser?.close()
  await server.close()
}

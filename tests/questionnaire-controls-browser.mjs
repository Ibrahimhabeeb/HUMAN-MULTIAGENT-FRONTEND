import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const form = JSON.parse(await readFile('../backend/content/questionnaire.json', 'utf8'))
form.modes = [{ mode: 'team', label: 'Agent team (authentication task)' }, { mode: 'single', label: 'Single assistant (file download task)' }]
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-questionnaire-controls', plugins: [react(), {
  name: 'questionnaire-controls', enforce: 'pre',
  resolveId(source) { if (source === 'virtual:questionnaire-form') return '\0questionnaire-form' },
  load(id) { if (id === '\0questionnaire-form') return `export default ${JSON.stringify(form)}` },
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.url.startsWith('/_questionnaire-controls')) return next()
      response.setHeader('Content-Type', 'text/html')
      response.end(await vite.transformIndexHtml(request.url, '<html><body style="margin:0"><div id="root"></div><script type="module" src="/tests/fixtures/questionnaire-controls.tsx"></script></body></html>'))
    })
  },
}], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } })

let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  const errors = [], decisions = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('secure-coding-room.session', 'x'.repeat(43)))
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request()
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/approvals/91/decide') {
      const { decision } = request.postDataJSON()
      decisions.push(decision)
      return route.fulfill({ json: { id: 91, actor: 'assistant', action_type: 'suggest_fix',
        proposal: {}, final_proposal: null, status: decision === 'approve' ? 'approved' : 'rejected',
        requested_at: '2026-11-22T10:00:00Z', decided_at: '2026-11-22T10:01:00Z', result: null } })
    }
    errors.push(`Unexpected API request: ${request.method()} ${new URL(request.url()).pathname}`)
    return route.abort()
  })
  const url = `http://127.0.0.1:${server.httpServer.address().port}/_questionnaire-controls`
  await page.goto(url)
  const modes = page.locator('.mode-answer')
  await expect(modes).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Extremely confident', exact: true })).toHaveCount(0)
  assert.equal(await modes.nth(0).locator('.choice-buttons button').count(), 4)
  const left = await modes.nth(0).boundingBox(), right = await modes.nth(1).boundingBox()
  assert.ok(Math.abs(left.y - right.y) < 2 && right.x >= left.x + left.width)
  await modes.nth(0).getByRole('button', { name: 'Very confident', exact: true }).click()
  await modes.nth(1).getByRole('button', { name: 'Slightly confident', exact: true }).click()
  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(page.locator('.questionnaire-progress')).toContainText('Question 2 of 21')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(modes.nth(0).getByRole('button', { name: 'Very confident', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(modes.nth(1).getByRole('button', { name: 'Slightly confident', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mkdir('node_modules/.tmp', { recursive: true })
  await page.screenshot({ path: 'node_modules/.tmp/questionnaire-paired.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await modes.nth(1).boundingBox(), first = await modes.nth(0).boundingBox()
  assert.ok(mobile.y > first.y)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: 'node_modules/.tmp/questionnaire-mobile.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1280, height: 960 })
  for (let index = 0; index < 10; index++) await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(modes).toHaveCount(1)
  for (let index = 10; index < 20; index++) await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await expect(page.locator('textarea')).toBeVisible()
  await page.locator('textarea').fill('The task comparison was clear.')
  await expect(page.getByRole('button', { name: 'Submit answers', exact: true })).toBeVisible()
  console.log('Paired layout, four confidence options, independent answers, navigation and mobile layout passed.')

  for (const [label, decision] of [['Yes, use this fix', 'approve'], ['No, skip it', 'reject']]) {
    await page.goto(url + '?fix')
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.status-pill')).toHaveText(decision === 'approve' ? 'approved' : 'rejected')
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    assert.equal(decisions.at(-1), decision)
  }
  assert.deepEqual(decisions, ['approve', 'reject'])
  assert.deepEqual(errors, [])
  console.log('Clickable single-assistant Yes/No decisions reached the existing approval API.')
  if (process.env.QUESTIONNAIRE_PDF_SOURCE && process.env.QUESTIONNAIRE_PDF_OUTPUT) {
    await page.goto(pathToFileURL(resolve(process.env.QUESTIONNAIRE_PDF_SOURCE)).href)
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: process.env.QUESTIONNAIRE_PDF_OUTPUT, preferCSSPageSize: true, printBackground: true })
    console.log('Updated ethics questionnaire PDF rendered from its HTML source.')
  }
} finally {
  await browser?.close()
  await server.close()
}

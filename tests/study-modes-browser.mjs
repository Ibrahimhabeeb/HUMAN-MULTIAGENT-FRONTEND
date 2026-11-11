import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const temporary = await mkdtemp(join(tmpdir(), 'secure-room-mode-check-'))
const backend = resolve('../backend')
const python = process.env.STUDY_TEST_PYTHON || join(backend, '.venv', 'Scripts', 'python.exe')
let service, server, browser, page
let log = ''
try {
  // A separate database and workspaces: never point browser checks at the active study server.
  service = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '0'], {
    cwd: backend,
    windowsHide: true,
    env: {
      ...process.env,
      DATABASE_URL: `sqlite:///${join(temporary, 'study.db').replaceAll('\\', '/')}`,
      WORKSPACES_DIR: join(temporary, 'workspaces'),
      SNAPSHOTS_DIR: join(temporary, 'snapshots'),
      LLM_API_KEY: 'unused-browser-test-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const apiUrl = await new Promise((yes, no) => {
    const timeout = setTimeout(() => no(new Error(`Test backend did not start: ${log}`)), 30000)
    const capture = (chunk) => {
      log = (log + chunk).slice(-6000)
      const address = /Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1]
      if (address) { clearTimeout(timeout); yes(address) }
    }
    service.stdout.on('data', capture)
    service.stderr.on('data', capture)
    service.once('error', (error) => { clearTimeout(timeout); no(error) })
    service.once('exit', () => { clearTimeout(timeout); no(new Error(`Test backend exited: ${log}`)) })
  })
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-study-browser', plugins: [react()],
    worker: { format: 'es' },
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, fs: { allow: [resolve('.'), await realpath('node_modules')] },
      proxy: { '/api': { target: apiUrl, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } } },
  })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route((url) => url.pathname.startsWith('/api/chat'), async (route) => {
    if (route.request().method() === 'POST') {
      errors.push('Browser flow attempted an AI request')
      await route.abort()
    } else await route.continue()
  })
  await mkdir('node_modules/.tmp', { recursive: true })

  async function requestFor(tab, method, path, options = {}) {
    const token = await tab.evaluate(() => sessionStorage.getItem('secure-coding-room.session'))
    return tab.request[method](path, { ...options, headers: { ...options.headers, 'X-Session-Token': token } })
  }
  const sessionRequest = (method, path, options) => requestFor(page, method, path, options)

  async function checkTabSessions() {
    await page.goto(origin)
    await expect(page.getByRole('button', { name: 'New pilot participant', exact: true })).toBeVisible()
    const other = await page.context().newPage()
    try {
      await other.goto(origin)
      await expect(other.getByRole('button', { name: 'New pilot participant', exact: true })).toBeVisible()
      const token = await page.evaluate(() => sessionStorage.getItem('secure-coding-room.session'))
      const otherToken = await other.evaluate(() => sessionStorage.getItem('secure-coding-room.session'))
      assert.notEqual(token, otherToken)
      assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, cookie: document.cookie })), { local: 0, cookie: '' })
      await page.getByLabel('Task', { exact: true }).selectOption('A')
      await other.getByLabel('Task', { exact: true }).selectOption('B')
      await other.getByRole('button', { name: 'Single', exact: true }).click()
      for (const tab of [page, other]) {
        await tab.getByRole('button', { name: 'New pilot participant', exact: true }).click()
        await tab.getByRole('button', { name: 'Continue', exact: true }).click()
        await tab.getByRole('checkbox').first().waitFor()
        for (const checkbox of await tab.getByRole('checkbox').all()) await checkbox.check()
        await tab.getByRole('button', { name: 'I agree', exact: true }).click()
        await expect(tab.locator('.command-center')).toContainText('Part 1 of 2')
      }
      const first = await (await requestFor(page, 'get', origin + '/api/study/state')).json()
      const second = await (await requestFor(other, 'get', origin + '/api/study/state')).json()
      assert.notEqual(first.participant, second.participant)
      assert.equal(first.mode, 'team')
      assert.equal(second.mode, 'single')
      await requestFor(page, 'put', origin + '/api/workspace/files/private.txt', { data: { content: 'only first participant' } })
      assert.equal((await requestFor(other, 'get', origin + '/api/workspace/files/private.txt')).status(), 404)
      await page.reload()
      await expect(page.locator('.command-center')).toContainText('authentication task')
      assert.equal(await page.evaluate(() => sessionStorage.getItem('secure-coding-room.session')), token)
      assert.equal((await (await requestFor(page, 'get', origin + '/api/study/state')).json()).participant, first.participant)
      await other.screenshot({ path: 'node_modules/.tmp/session-second-tab.png' })
      await page.screenshot({ path: 'node_modules/.tmp/session-first-tab.png' })
      for (const tab of [page, other]) {
        await tab.getByRole('button', { name: 'Restart for new participant (researcher)', exact: true }).click()
        await tab.getByRole('dialog').getByRole('button', { name: 'Restart', exact: true }).click()
        await expect(tab.getByRole('button', { name: 'New pilot participant', exact: true })).toBeVisible()
        if (tab === page) {
          assert.equal((await (await requestFor(other, 'get', origin + '/api/study/state')).json()).participant, second.participant)
          assert.equal((await page.request.get(origin + '/api/workspace/files', { headers: { 'X-Session-Token': token } })).status(), 401)
          assert.notEqual(await page.evaluate(() => sessionStorage.getItem('secure-coding-room.session')), token)
        }
      }
    } finally {
      await other.close()
    }
  }

  async function state() {
    const response = await sessionRequest('get', `${origin}/api/study/state`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  async function finishPart() {
    await page.locator('.titlebar').getByRole('button', { name: 'Finish part', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Finish part', exact: true }).click()
  }
  async function checkScreenLayout(name) {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 })
      assert.ok(await page.locator('.study-main').evaluate((main) => main.scrollWidth <= main.clientWidth), `${name} content overflows at ${width}px`)
      assert.ok(await page.locator('.study-page').evaluate((screen) => screen.scrollWidth <= screen.clientWidth), `${name} screen overflows at ${width}px`)
      assert.equal(await page.locator('.study-page').evaluate((screen) => getComputedStyle(screen).colorScheme), 'light')
      await page.screenshot({ path: `node_modules/.tmp/${name}-${width}.png` })
    }
    await page.setViewportSize({ width: 1440, height: 960 })
  }
  async function checkTaskPicker(taskId) {
    const task = page.getByRole('combobox', { name: 'Task', exact: true })
    if (await page.evaluate(() => CSS.supports('appearance', 'base-select'))) {
      await expect(task).toHaveCSS('appearance', 'base-select')
      await task.press('Space')
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await expect(task).toHaveValue('G')
      await expect(page.locator('.task-picker-icon.task-g .codicon-list-unordered')).toBeVisible()
      await task.press('Space')
      await page.keyboard.press('Home')
      await page.keyboard.press('Escape')
      await expect(task).toHaveValue('G')
      await task.press('Space')
      await page.keyboard.press('Home')
      await page.keyboard.press('Enter')
      await expect(task).toHaveValue('A')
      await task.selectOption(taskId)
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await task.click()
        await expect(page.getByRole('option')).toHaveCount(7)
        for (const [label, cwe] of [
          ['authentication task', 'CWE-89'], ['file download task', 'CWE-22'],
          ['comment rendering task', 'CWE-79'], ['preferences import task', 'CWE-502'],
          ['account email update task', 'CWE-352'], ['document access task', 'CWE-639'],
          ['account recovery audit task', 'CWE-532'],
        ]) await expect(page.getByRole('option', { name: `${label} (${cwe})`, exact: true })).toBeVisible()
        await expect(page.getByRole('option', { selected: true })).toHaveCSS('background-color', 'rgb(228, 241, 237)')
        for (const option of await page.getByRole('option').all()) {
          const bounds = await option.boundingBox()
          assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `Task option overflows at ${width}px`)
          assert.ok(bounds.height >= 44, 'Task options need a comfortable click target')
        }
        await page.screenshot({ path: `node_modules/.tmp/task-${taskId}-picker-${width}.png` })
        await page.keyboard.press('Escape')
        await expect(task).toHaveValue(taskId)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
    }
    const fallback = await page.addStyleTag({ content: '.session-fields .task-select { appearance: none !important; display: block !important; }' })
    await task.selectOption(taskId === 'A' ? 'B' : 'A')
    await task.selectOption(taskId)
    await expect(task).toHaveValue(taskId)
    await fallback.evaluate((style) => style.remove())
  }
  async function checkComparison(taskId) {
    const response = await sessionRequest('get', `${origin}/api/study/questionnaire`)
    const form = await response.json()
    const questions = form.sections.flatMap((section) => section.questions)
    const pager = page.locator('.questionnaire-pager')
    await expect(pager).toContainText('Question 1 of 21')
    await expect(pager.locator('.question-card')).toHaveCount(1)
    await expect(pager).not.toContainText('Reliability and caution')
    await expect(pager).not.toContainText('/100')
    await expect(pager.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
    await checkScreenLayout(`task-${taskId}-questionnaire`)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 })
      await pager.screenshot({ path: `node_modules/.tmp/task-${taskId}-questionnaire-pager-${width}.png` })
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    const cards = pager.locator('.question-card')
    await cards.locator('.mode-answer').nth(0).getByRole('button', { name: 'Very confident', exact: true }).click()
    await cards.locator('.mode-answer').nth(1).getByRole('button', { name: 'Very confident', exact: true }).click()
    await pager.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(pager).toContainText('Question 2 of 21')
    await pager.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(cards.locator('.mode-answer').nth(0).getByRole('button', { name: 'Very confident', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(cards.locator('.mode-answer').nth(1).getByRole('button', { name: 'Very confident', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (let index = 0; index < 7; index++) await pager.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(pager).toContainText('Question 8 of 21')
    await cards.locator('.mode-answer').nth(0).getByRole('button', { name: 'A moderate amount', exact: true }).click()
    await cards.locator('.mode-answer').nth(1).getByRole('button', { name: 'A great deal', exact: true }).click()
    for (let index = 0; index < 3; index++) await pager.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(pager).toContainText('Question 11 of 21')
    await cards.getByRole('button', { name: 'Strongly agree', exact: true }).click()
    await pager.getByRole('button', { name: 'Next question', exact: true }).click()
    await cards.getByRole('button', { name: 'Not applicable', exact: true }).click()
    for (let index = 0; index < 9; index++) await pager.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(pager).toContainText('Question 21 of 21')
    await cards.locator('textarea').fill('The shared security state was useful.')
    await expect(pager.getByRole('button', { name: 'Submit answers', exact: true })).toBeVisible()
    return {
      answers: [
        { condition: 'team', item: questions[0].key, value: 'Very confident' },
        { condition: 'single', item: questions[0].key, value: 'Very confident' },
        { condition: 'team', item: questions[7].key, value: 'A moderate amount' },
        { condition: 'single', item: questions[7].key, value: 'A great deal' },
        { condition: 'team', item: questions[10].key, value: 'Strongly agree' },
        { condition: 'team', item: questions[11].key, value: 'Not applicable' },
        { condition: 'none', item: questions[20].key, value: 'The shared security state was useful.' },
      ],
      skipped: questions[1].key,
    }
  }

  await checkTabSessions()

  const taskRuns = [
    ['A', 'team', 'authentication task', 'app/auth.py'],
    ['B', 'single', 'file download task', 'app/storage.py'],
    ['C', 'team', 'comment rendering task', 'app/comments.py'],
    ['D', 'single', 'preferences import task', 'app/preferences.py'],
    ['E', 'team', 'account email update task', 'app/account.py'],
    ['F', 'single', 'document access task', 'app/documents.py'],
    ['G', 'team', 'account recovery audit task', 'app/audit.py'],
  ]
  const selectedTasks = new Set((process.env.STUDY_BROWSER_TASKS ?? '').split(',').filter(Boolean))
  for (const [taskId, firstMode, taskLabel, source] of taskRuns.filter(([taskId]) => selectedTasks.size === 0 || selectedTasks.has(taskId))) {
    const secondTaskId = { A: 'B', B: 'A', C: 'D', D: 'E', E: 'C', F: 'G', G: 'F' }[taskId]
    await page.goto(origin)
    await expect(page.getByRole('button', { name: 'New pilot participant', exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByLabel('Task', { exact: true }).selectOption(taskId)
    await checkTaskPicker(taskId)
    await checkScreenLayout(`task-${taskId}-start`)
    await page.getByRole('group', { name: 'Team or single mode' }).getByRole('button', { name: firstMode === 'team' ? 'Team' : 'Single', exact: true }).click()
    await page.getByRole('button', { name: 'New pilot participant', exact: true }).click()
    assert.equal((await state()).task.id, taskId)
    await expect(page.getByRole('heading', { name: 'Participant information sheet', exact: true })).toBeVisible()
    await expect(page.locator('.study-document')).toContainText('Ibrahim Habeeb-lahi Abiola')
    await expect(page.locator('.study-document')).toContainText('Prof. Solomon Oyelere')
    await expect(page.locator('.study-document')).not.toContainText(/DRAFT|CONFIRM|\[DATE/)
    await expect(page.getByRole('link', { name: 'hi261@exeter.ac.uk', exact: true })).toHaveAttribute('href', 'mailto:hi261@exeter.ac.uk')
    await checkScreenLayout(`task-${taskId}-information`)
    assert.equal((await state()).participant, null)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const consentResponse = await sessionRequest('get', `${origin}/api/study/content/consent`)
    const consent = await consentResponse.json()
    assert.equal(consent.version, 'v1.1')
    await expect(page.locator('.consent-list input')).toHaveCount(consent.statements.length)
    await expect(page.getByRole('button', { name: 'I agree', exact: true })).toBeDisabled()
    await checkScreenLayout(`task-${taskId}-consent`)
    for (const checkbox of await page.locator('.consent-list input').all()) await checkbox.check()
    const withdrawal = page.getByRole('checkbox', { name: /After submission, I can no longer withdraw/ })
    await withdrawal.uncheck()
    await expect(page.getByRole('button', { name: 'I agree', exact: true })).toBeDisabled()
    assert.equal((await state()).participant, null)
    await withdrawal.check()
    await expect(page.getByRole('progressbar', { name: 'Consent statements completed' })).toHaveAttribute('value', String(consent.statements.length))
    await page.getByRole('button', { name: 'I agree', exact: true }).click()
    await expect(page.locator('.command-center')).toContainText(taskLabel)
    await expect(page.locator('.app-shell.study-theme')).toHaveCount(0)
    await expect(page.locator('.monaco-editor').first()).toBeVisible()
    assert.equal(await page.locator('.monaco-editor').first().evaluate((editor) => getComputedStyle(editor).backgroundColor), 'rgb(30, 30, 30)')
    await expect.poll(() => sessionRequest('get', `${origin}/api/workspace/files/${source}`).then((response) => response.status())).toBe(200)
    const created = await sessionRequest('put', `${origin}/api/workspace/files/tests/test_first_mode.py`, { data: { content: 'def test_first_mode():\n    assert True\n' } })
    assert.equal(created.status(), 200)
    await page.locator('.titlebar').getByRole('button', { name: 'Run tests', exact: true }).click()
    await expect(page.locator('.test-summary')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.problem-text').filter({ hasText: 'test_first_mode' })).toBeVisible()
    await finishPart()
    await expect(page.getByRole('heading', { name: 'Part 1 is finished', exact: true })).toBeVisible()
    await checkScreenLayout(`task-${taskId}-mode-handoff`)
    const secondMode = firstMode === 'team' ? 'single' : 'team'
    const nextName = secondMode === 'team' ? 'Agent team' : 'Single assistant'
    await expect(page.locator('.lead')).toContainText(nextName)
    const handoff = await state()
    assert.equal(handoff.task, null)
    assert.deepEqual(handoff.parts, [])
    assert.equal(handoff.available_tasks.some((task) => task.id === taskId), false)
    const taskTwo = page.getByLabel('Part 2 task', { exact: true })
    await expect(taskTwo).not.toHaveValue(taskId)
    await taskTwo.selectOption(secondTaskId)
    await page.getByRole('button', { name: `Start Part 2 with ${nextName}`, exact: true }).click()
    await expect(page.locator('.command-center')).toContainText(`Part 2 of 2`)
    await expect(page.locator('.command-center')).toContainText((await state()).task.label)
    await expect(page.locator('.command-center')).toContainText(nextName)
    const second = await state()
    assert.deepEqual(second.parts.map((part) => part.task_id), [secondTaskId])
    assert.equal((await sessionRequest('get', `${origin}/api/workspace/files/tests/test_first_mode.py`)).status(), 404)
    await expect(page.locator('.test-summary')).toHaveCount(0)
    await page.locator('.titlebar').getByRole('button', { name: 'Run tests', exact: true }).click()
    await expect(page.locator('.test-summary')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.problem-text').filter({ hasText: 'test_first_mode' })).toHaveCount(0)
    await finishPart()
    await expect(page.getByRole('heading', { name: 'Questionnaire', exact: true })).toBeVisible()
    assert.equal((await state()).screen, 'questionnaire')
    await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeVisible()
    const comparisonAnswers = await checkComparison(taskId)
    await page.getByRole('button', { name: 'Submit answers', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('cannot change your answers or withdraw your study data')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal((await state()).screen, 'questionnaire')
    await page.getByRole('button', { name: 'Submit answers', exact: true }).click()
    const submission = page.waitForRequest((request) => request.url().endsWith('/api/study/questionnaire') && request.method() === 'POST')
    await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click()
    const submitted = (await submission).postDataJSON().answers
    for (const expected of comparisonAnswers.answers) assert.ok(submitted.some((answer) => JSON.stringify(answer) === JSON.stringify(expected)))
    assert.ok(submitted.every((answer) => answer.item !== comparisonAnswers.skipped))
    await expect(page.getByRole('heading', { name: 'Thank you for taking part', exact: true })).toBeVisible()
    await expect(page.locator('.study-main')).toContainText('study data cannot be withdrawn after submission')
    await expect(page.locator('.study-main')).not.toContainText('withdraw your data later')
    await checkScreenLayout(`task-${taskId}-thank-you`)
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(page.getByRole('button', { name: 'New pilot participant', exact: true })).toBeVisible()
  }
  assert.deepEqual(errors, [])
  console.log('Study browser checks passed: comparison navigation, retained/skipped ratings and submission; task picker styling, keyboard and fallback; light screens at four widths, consent gating, dark Monaco, both mode orders and isolated attempts.')
} catch (error) {
  if (page) {
    console.error(await page.locator('body').innerText().catch(() => 'Browser page unavailable'))
    await page.screenshot({ path: 'node_modules/.tmp/study-mode-failure.png' }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close()
  await server?.close()
  if (service && service.exitCode === null) {
    const exited = once(service, 'exit')
    service.kill()
    await exited
  }
  // Only remove the uniquely created test directory immediately under the OS temp directory.
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()))
  assert.ok(basename(temporary).startsWith('secure-room-mode-check-'))
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

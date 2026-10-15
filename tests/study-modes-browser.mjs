import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
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
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, proxy: { '/api': { target: apiUrl, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } } },
  })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route((url) => url.pathname.startsWith('/api/chat'), async (route) => {
    if (route.request().method() === 'POST') {
      errors.push('Browser flow attempted an AI request')
      await route.abort()
    } else await route.continue()
  })
  await mkdir('node_modules/.tmp', { recursive: true })

  async function state() {
    const response = await page.request.get(`${origin}/api/study/state`)
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
      await expect(task).toHaveValue('B')
      await expect(page.locator('.task-picker-icon.task-b')).toBeVisible()
      await task.press('Space')
      await page.keyboard.press('Home')
      await page.keyboard.press('Escape')
      await expect(task).toHaveValue('B')
      await task.press('Space')
      await page.keyboard.press('Home')
      await page.keyboard.press('Enter')
      await expect(task).toHaveValue('A')
      await task.selectOption(taskId)
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await task.click()
        await expect(page.getByRole('option', { name: 'authentication task', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: 'file download task', exact: true })).toBeVisible()
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
    const response = await page.request.get(`${origin}/api/study/questionnaire`)
    const form = await response.json()
    const section = form.sections.find((item) => item.title === 'Both ways of working')
    const comparison = page.locator('.questionnaire-comparison')
    const teamLabel = form.modes.find((mode) => mode.mode === 'team').label
    const singleLabel = form.modes.find((mode) => mode.mode === 'single').label
    const teamRating = comparison.getByRole('group', { name: teamLabel, exact: true })
    const singleRating = comparison.getByRole('group', { name: singleLabel, exact: true })
    await expect(comparison).toContainText(`Statement 1 of ${section.questions.length}`)
    await expect(comparison.getByRole('radio')).toHaveCount(14)
    await expect(comparison.locator('input:checked')).toHaveCount(0)
    await expect(comparison.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
    await expect(comparison.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
    await checkScreenLayout(`task-${taskId}-questionnaire`)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 })
      for (const scale of await comparison.locator('.comparison-scale').all()) {
        const positions = await scale.locator('label').evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().top))
        assert.equal(new Set(positions).size, 1, `Rating scale wraps at ${width}px`)
      }
      await comparison.screenshot({ path: `node_modules/.tmp/task-${taskId}-comparison-${width}.png` })
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await teamRating.getByText('6', { exact: true }).click()
    await singleRating.getByText('3', { exact: true }).click()
    await comparison.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(comparison.getByRole('heading', { level: 3 })).toHaveText(section.questions[1].text)
    await expect(comparison.locator('input:checked')).toHaveCount(0)
    await comparison.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(teamRating.getByRole('radio', { name: '6', exact: true })).toBeChecked()
    await expect(singleRating.getByRole('radio', { name: '3', exact: true })).toBeChecked()
    await comparison.getByRole('button', { name: `Clear rating for ${teamLabel}`, exact: true }).click()
    await expect(teamRating.locator('input:checked')).toHaveCount(0)
    await expect(singleRating.getByRole('radio', { name: '3', exact: true })).toBeChecked()
    await teamRating.getByText('5', { exact: true }).click()
    await comparison.getByRole('button', { name: 'Continue', exact: true }).click()
    await teamRating.getByText('4', { exact: true }).click()
    await singleRating.getByText('2', { exact: true }).click()
    await comparison.getByRole('button', { name: 'Skip', exact: true }).click()
    await comparison.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(comparison.locator('input:checked')).toHaveCount(0)
    for (let index = 1; index < section.questions.length - 1; index++) {
      await comparison.getByRole('button', { name: 'Continue', exact: true }).click()
    }
    await comparison.getByRole('button', { name: 'Review ratings', exact: true }).click()
    await expect(comparison.locator('.comparison-review li')).toHaveCount(section.questions.length)
    await expect(comparison.locator('.comparison-review li').first()).toContainText('5 / 7')
    await expect(comparison.locator('.comparison-review li').first()).toContainText('3 / 7')
    await expect(comparison.locator('.comparison-review li').nth(1).getByText('Skipped', { exact: true })).toHaveCount(2)
    await comparison.getByRole('button', { name: 'Change statement 1', exact: true }).click()
    await teamRating.getByRole('radio', { name: '5', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(teamRating.getByRole('radio', { name: '6', exact: true })).toBeChecked()
    for (let index = 0; index < section.questions.length - 1; index++) {
      await comparison.getByRole('button', { name: 'Continue', exact: true }).click()
    }
    await comparison.getByRole('button', { name: 'Review ratings', exact: true }).click()
    await checkScreenLayout(`task-${taskId}-comparison-review`)
    await comparison.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'The agent team', exact: true })).toBeFocused()
    const teamSection = page.locator('.questionnaire-section').filter({ has: page.getByRole('heading', { name: 'The agent team', exact: true }) })
    const teamQuestions = form.sections.find((item) => item.title === 'The agent team').questions
    await expect(teamSection.locator('tbody tr')).toHaveCount(teamQuestions.length)
    await teamSection.locator('tbody tr').first().getByRole('button', { name: '4', exact: true }).click()
    return {
      answers: [
        { condition: 'team', item: section.questions[0].key, value: 6 },
        { condition: 'single', item: section.questions[0].key, value: 3 },
        { condition: 'team', item: teamQuestions[0].key, value: 4 },
      ],
      skipped: section.questions[1].key,
    }
  }

  for (const [taskId, firstMode, taskLabel, source] of [
    ['A', 'team', 'authentication task', 'app/auth.py'],
    ['B', 'single', 'file download task', 'app/storage.py'],
  ]) {
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
    const consentResponse = await page.request.get(`${origin}/api/study/content/consent`)
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
    await expect.poll(() => page.request.get(`${origin}/api/workspace/files/${source}`).then((response) => response.status())).toBe(200)
    const created = await page.request.put(`${origin}/api/workspace/files/tests/test_first_mode.py`, { data: { content: 'def test_first_mode():\n    assert True\n' } })
    assert.equal(created.status(), 200)
    await page.locator('.titlebar').getByRole('button', { name: 'Run tests', exact: true }).click()
    await expect(page.locator('.test-summary')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.problem-text').filter({ hasText: 'test_first_mode' })).toBeVisible()
    await finishPart()
    await expect(page.getByRole('heading', { name: 'Part 1 is finished', exact: true })).toBeVisible()
    await expect(page.locator('.lead')).toContainText(taskLabel)
    await checkScreenLayout(`task-${taskId}-mode-handoff`)
    const secondMode = firstMode === 'team' ? 'single' : 'team'
    const nextName = secondMode === 'team' ? 'Agent team' : 'Single assistant'
    await page.getByRole('button', { name: `Continue with ${nextName}`, exact: true }).click()
    await expect(page.locator('.command-center')).toContainText(`Part 2 of 2`)
    await expect(page.locator('.command-center')).toContainText(taskLabel)
    await expect(page.locator('.command-center')).toContainText(nextName)
    const second = await state()
    assert.deepEqual(second.parts.map((part) => part.task_id), [taskId, taskId])
    assert.equal((await page.request.get(`${origin}/api/workspace/files/tests/test_first_mode.py`)).status(), 404)
    await expect(page.locator('.test-summary')).toHaveCount(0)
    await page.locator('.titlebar').getByRole('button', { name: 'Run tests', exact: true }).click()
    await expect(page.locator('.test-summary')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.problem-text').filter({ hasText: 'test_first_mode' })).toHaveCount(0)
    await finishPart()
    await expect(page.getByRole('heading', { name: 'Questionnaire', exact: true })).toBeVisible()
    assert.equal((await state()).screen, 'questionnaire')
    await expect(page.getByRole('button', { name: 'Submit answers', exact: true })).toBeVisible()
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

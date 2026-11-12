import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
const folder = '.tmp/runtime-query-layout-20261112'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const checks = [], errors = []
await mkdir(folder, { recursive: true })

async function geometry(page, selector, name) {
  const result = await page.locator(selector).evaluate(root => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width } }
    const fields = [...root.querySelectorAll('.runtime-parameter-field, .report-dimension-field, .instant-query-panel__period, .query-period')]
    const boxes = fields.map(rect)
    const problems = []
    fields.forEach((el, i) => {
      const control = el.querySelector('.el-date-editor, .el-select, .el-input-number, .el-input')
      if (!control) return
      const r = rect(control), b = boxes[i]
      if (r.x < b.x - 1 || r.right > b.right + 1) problems.push(`Control overflow: ${i}`)
      if (b.x < rect(root).x - 1 || b.right > rect(root).right + 1) problems.push(`Field overflow: ${i}`)
      boxes.slice(i + 1).forEach((other, j) => {
        if (Math.min(b.right, other.right) - Math.max(b.x, other.x) > 1 && Math.min(b.bottom, other.bottom) - Math.max(b.y, other.y) > 1) problems.push(`Overlap: ${i}/${i + j + 1}`)
      })
    })
    const action = root.querySelector('.instant-query-panel__actions, .query-actions')
    if (action && boxes.some(b => b.bottom > rect(action).y + 1)) problems.push('Action above fields')
    if (root.scrollWidth > root.clientWidth + 1) problems.push('Panel horizontal overflow')
    const declaredColumns = getComputedStyle(root.querySelector('.instant-query-panel__controls, .query-controls, .runtime-parameter-fields') || root).gridTemplateColumns.split(' ').length
    const columns = new Set(boxes.map(b => Math.round(b.x))).size
    if (columns !== declaredColumns) problems.push(`Column alignment: ${columns}/${declaredColumns}`)
    return { problems, count: fields.length, columns }
  })
  assert.deepEqual(result.problems, [], `${name}: ${JSON.stringify(result)}`)
  checks.push({ name, ...result })
}

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', error => errors.push(error.message))
  const credentials = JSON.parse(await readFile(process.env.IDMP_ADMIN_CREDENTIAL_FILE || 'D:/IDMP-Frontend-tat-dev/.tmp/forced-login-admin-20261024.json', 'utf8'))
  await page.goto(`${origin}/login?redirect=${encodeURIComponent('/analysis?indicator=102027642460333758')}`)
  await page.getByPlaceholder('请输入工号').fill(credentials.username)
  await page.locator('input[type=password]').fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/analysis?**', { timeout: 60000 })
  await page.locator('.instant-query-panel .runtime-parameter-field').first().waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.instant-query-panel .runtime-parameter-field').count(), 5)
  for (const width of [1920, 1440, 1024, 390, 360]) {
    await page.setViewportSize({ width, height: 1080 })
    await geometry(page, '.instant-query-panel', `真实指标-${width}`)
    await page.locator('.instant-query-panel').screenshot({ path: `${folder}/live-${width}.png` })
  }
  const parameters = [
    ['startDate', 'DATETIME', '开始日期'], ['endDate', 'DATETIME', '结束日期'],
    ['departCode', 'STRING', '科室'], ['patientNo', 'STRING', '住院标识'],
    ['patientName', 'STRING', '患者姓名'], ['minimumAge', 'INTEGER', '年龄下限'],
    ['maximumCost', 'DECIMAL', '费用上限'], ['emergency', 'BOOLEAN', '急诊患者'],
    ['admissionDate', 'DATE', '入院日期'], ['ward', 'STRING', '病区'],
    ['operationName', 'STRING', '住院期间接受的手术及操作名称筛选条件'], ['diagnosis', 'STRING', '诊断名称']
  ].map(([code, type, displayName]) => ({ code, type, displayName, parameterMode: 'TEMPORARY' }))

  // Mount the real field components with the analysis page's scoped styles.
  await page.evaluate(async declarations => {
    const { createApp, h, ref, withDirectives } = await import('/node_modules/.vite/deps/vue.js')
    const { default: ElementPlus, ElDatePicker, ElButton } = await import('/node_modules/.vite/deps/element-plus.js')
    const { default: Analysis } = await import('/src/idmp/views/IndicatorAnalysis.vue')
    const { default: Fields } = await import('/src/idmp/components/RuntimeParameterFields.vue')
    const { default: Dimensions } = await import('/src/idmp/features/analysis/ReportDimensionFilters.vue')
    const { queryEnterDirective } = await import('/src/idmp/utils/queryEnter.js')
    document.querySelector('#app').style.display = 'none'
    const host = document.createElement('main'); host.id = 'layout-fixture'
    host.style.cssText = 'padding:16px;box-sizing:border-box;max-width:100%'
    document.body.append(host)
    const values = ref({ minimumAge: 0, emergency: false }), period = ref([]), filters = ref({})
    const mode = ref('TEMPORAL'), metadata = ref(false)
    window.__layout = { values, mode, metadata, submissions: [] }
    createApp({
      __scopeId: Analysis.__scopeId,
      render: () => metadata.value ? h(Fields, { declarations, modelValue: values.value, 'onUpdate:modelValue': v => values.value = v }) :
        h('section', { class: 'surface-card instant-query-panel' }, [
          h('div', { class: 'instant-query-panel__header' }, [h('h2', '查询条件')]),
          withDirectives(h('div', { class: 'instant-query-panel__controls' }, [
            mode.value === 'TEMPORAL' ? h('div', { class: 'instant-query-panel__period' }, [h('label', '报告期'), h('div', { class: 'date-range-fields report-period-picker' }, [h(ElDatePicker, { modelValue: period.value, 'onUpdate:modelValue': v => period.value = v, type: 'daterange', startPlaceholder: '开始日期', endPlaceholder: '结束日期' })])]) : null,
            h(Dimensions, { fields: [{ code: '科室', label: '科室', role: 'DEPARTMENT' }, { code: '医生', label: '医生', role: 'DOCTOR' }], modelValue: filters.value, 'onUpdate:modelValue': v => filters.value = v }),
            h(Fields, { declarations, showMetadata: false, modelValue: values.value, 'onUpdate:modelValue': v => values.value = v }),
            h('div', { class: 'instant-query-panel__actions' }, [h(ElButton, { type: 'primary', 'data-query-submit': '', onClick: () => window.__layout.submissions.push({ ...values.value }) }, () => '查询')])
          ]), [[queryEnterDirective]])
        ])
    }).use(ElementPlus).mount(host)
  }, parameters)
  for (const mode of ['TEMPORAL', 'STATIC']) {
    await page.evaluate(mode => window.__layout.mode.value = mode, mode)
    for (const width of [1920, 1440, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1080 })
      await geometry(page, '#layout-fixture .instant-query-panel', `12参数-${mode}-${width}`)
      if (mode === 'TEMPORAL') await page.locator('#layout-fixture').screenshot({ path: `${folder}/stress-${width}.png` })
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  for (const width of [760, 480, 300]) {
    await page.locator('#layout-fixture').evaluate((host, width) => host.style.width = `${width}px`, width)
    await geometry(page, '#layout-fixture .instant-query-panel', `宽屏窄容器-${width}`)
  }
  const input = page.locator('#layout-fixture .runtime-parameter-field').nth(4).locator('input')
  await input.fill('布局验收')
  await input.press('Enter')
  await page.waitForFunction(() => window.__layout.submissions.length === 1)
  assert.deepEqual(await page.evaluate(() => window.__layout.submissions[0]), { minimumAge: 0, emergency: false, patientName: '布局验收' })
  checks.push({ name: '回车查询保留参数编码及0/false', passed: true })
  await page.evaluate(() => window.__layout.metadata.value = true)
  for (const width of [900, 480, 280]) {
    await page.locator('#layout-fixture').evaluate((host, width) => host.style.width = `${width}px`, width)
    await geometry(page, '#layout-fixture', `编辑器参数字段-${width}`)
  }

  await page.route('**/api/v1/compile-artifacts/layout-artifact', route => route.fulfill({ json: { code: '0', data: { parameterSchema: { parameters } } } }))
  await page.route('**/api/v1/factor-versions/layout-version/trial-period-recommendation', route => route.fulfill({ json: { code: '0', data: { availabilityStatus: 'AVAILABLE', recommendedPeriodStart: '2026-01-01T00:00:00', recommendedPeriodEnd: '2026-02-01T00:00:00' } } }))
  await page.evaluate(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js')
    const { default: ElementPlus } = await import('/node_modules/.vite/deps/element-plus.js')
    const { default: Factor } = await import('/src/idmp/components/FactorRuntimeQuery.vue')
    const { queryEnterDirective } = await import('/src/idmp/utils/queryEnter.js')
    document.querySelector('#layout-fixture').style.display = 'none'
    const host = document.createElement('main'); host.id = 'factor-fixture'; host.style.cssText = 'padding:16px;box-sizing:border-box;max-width:100%'; document.body.append(host)
    const mode = ref('TEMPORAL'); window.__factorLayoutMode = mode
    createApp({ render: () => h(Factor, { versionId: 'layout-version', artifactId: 'layout-artifact', calculationMode: mode.value }) }).use(ElementPlus).directive('query-enter', queryEnterDirective).mount(host)
  })
  await page.locator('#factor-fixture .runtime-parameter-field').first().waitFor()
  for (const mode of ['TEMPORAL', 'STATIC']) {
    await page.evaluate(mode => window.__factorLayoutMode.value = mode, mode)
    await page.locator('#factor-fixture .runtime-parameter-field').first().waitFor()
    for (const width of [1920, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1080 })
      await geometry(page, '#factor-fixture .runtime-query', `因子12参数-${mode}-${width}`)
    }
    await page.setViewportSize({ width: 1920, height: 1080 })
    for (const width of [760, 480, 300]) {
      await page.locator('#factor-fixture').evaluate((host, width) => host.style.width = `${width}px`, width)
      await geometry(page, '#factor-fixture .runtime-query', `因子窄容器-${mode}-${width}`)
    }
    await page.locator('#factor-fixture').evaluate(host => host.style.width = '')
  }
  assert.deepEqual(errors, [])
  console.log(`PASS: ${checks.length} real-page, mixed-parameter, narrow-container and behavior checks; no business data writes.`)
} finally {
  await writeFile(`${folder}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

assert.equal(process.env.IDMP_WARNING_LIVE_WRITE, '1', 'Set IDMP_WARNING_LIVE_WRITE=1 to create isolated live acceptance data')
const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/warning-real'
const iteration = process.env.IDMP_WARNING_LIVE_ITERATION || '1'
await mkdir(evidence, { recursive: true })
const parse = text => JSON.parse(text, (_key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) ? context.source : value)
const serialize = value => JSON.stringify(value, (key, item) => /Id$/.test(key) && typeof item === 'string' && /^\d+$/.test(item) ? JSON.rawJSON(item) : item)
let state
try { state = parse(await readFile(`${evidence}/state.json`, 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { tag: `WARN_REAL_${Date.now()}`, rules: {} } }
const saveState = () => writeFile(`${evidence}/state.json`, JSON.stringify(state, null, 2))
const save = (name, data) => writeFile(`${evidence}/${name}.json`, JSON.stringify(data, null, 2))
if ((state.iteration || '1') !== iteration) {
  state.history = [...(state.history || []), { iteration: state.iteration || '1', rules: state.rules, batchId: state.batchId }]
  state.rules = {}
}
state.iteration = iteration
await saveState()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function api(method, path, body, headers = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: serialize(body) }), signal: AbortSignal.timeout(45000) })
  const result = parse(await response.text())
  assert.ok(response.ok && ['OK', 'ACCEPTED', '0'].includes(result.code), `${method} ${path}: ${response.status} ${result.message}`)
  return result.data
}
async function calculate(key) {
  const task = await api('POST', '/calc/batches', { ownerType: 'INDICATOR', ownerVersionId: state.versionId,
    batchType: key === 'trial' ? 'TRIAL' : 'RECALC', periodType: 'MONTHLY', periodStart: '2026-04-01T00:00:00', periodEnd: '2026-05-01T00:00:00' },
  { 'X-Idempotency-Key': `${state.tag}_${key}_R${iteration}` })
  await save(`task-${key}`, task)
  const batchId = String(task.batchId || task.resourceId)
  assert.match(batchId, /^\d+$/)
  state.batchId = batchId; await saveState()
  for (let attempt = 0; attempt < 120; attempt++) {
    const batch = await api('GET', `/calc/batches/${batchId}`)
    if (['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'CANCELLED', 'ABANDONED'].includes(batch.status)) {
      await save(`batch-${key}`, batch)
      assert.equal(batch.status, 'SUCCEEDED', JSON.stringify(batch))
      assert.ok(batch.targets.length >= 3)
      console.log(`CALCULATED ${batchId}: ${batch.targets.length} targets`)
      return batch
    }
    await pause(1000)
  }
  throw new Error(`Calculation timed out: ${batchId}`)
}
async function targetResults(batch) {
  const result = []
  for (const target of batch.targets) {
    const node = target.nodes.find(node => node.nodeType === 'FORMULA')
    const page = await api('GET', `/calc/nodes/${node.nodeId}/results?pageNum=1&pageSize=100`)
    assert.equal(Number(page.results.total), page.results.records.length, 'Acceptance fixture must fit one page')
    result.push({ targetCode: target.targetCode, grain: target.grain, rows: page.results.records })
  }
  return result
}
const condition = { logic: 'OR', children: [
  { logic: 'AND', children: [{ operator: 'GT', threshold: '0.4' }, { logic: 'NOT', children: [{ operator: 'GTE', threshold: '1' }] }] },
  { operator: 'EQ', threshold: '0.25' }
] }
const matches = row => row.value !== null && ((Number(row.value) > 0.4 && Number(row.value) < 1) || Number(row.value) === 0.25)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], failures = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (response.url().includes('/api/v1/') && response.status() >= 400) failures.push({ url: response.url(), status: response.status() }) })
let specs = []
async function configureGroup(locator, node) {
  const header = locator.locator(':scope > .condition-header')
  if (node.logic !== 'AND') {
    await header.locator('.kind-select').click()
    await page.getByRole('option', { name: { OR: '或（任一满足）', NOT: '非（不满足）' }[node.logic], exact: true }).last().click()
  }
  for (const [index, child] of node.children.entries()) {
    const actions = locator.locator(':scope > .condition-children > .condition-actions')
    if (index || child.logic) {
      await actions.getByRole('button', { name: child.logic ? '添加条件组' : '添加条件', exact: true }).click()
      if (!index) await locator.locator(':scope > .condition-children > .warning-condition').first().getByRole('button', { name: '删除条件', exact: true }).click()
    }
    const childLocator = locator.locator(':scope > .condition-children > .warning-condition').nth(index)
    if (child.logic) await configureGroup(childLocator, child)
    else {
      await childLocator.locator(':scope > .condition-header > .el-select').click()
      await page.getByRole('option', { name: { GT: '大于（>）', GTE: '大于等于（≥）', LT: '小于（<）', LTE: '小于等于（≤）', EQ: '等于（=）', NE: '不等于（≠）' }[child.operator], exact: true }).last().click()
      await childLocator.locator('input[aria-label="阈值"]').fill(child.threshold)
    }
  }
}
async function createRule(spec) {
  await page.getByRole('button', { name: '创建预警规则', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '创建预警规则', exact: true })
  const item = label => dialog.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: label }) })
  await item('规则编码').locator('input').fill(`${state.tag}_R${iteration}_${spec.key}`)
  await item('规则名称').locator('input').fill(`${state.name} / R${iteration} ${spec.name}`)
  await item('生效开始日期').locator('input').fill('2026-04-01')
  await item('生效开始日期').locator('input').press('Tab')
  await item('生效结束日期').locator('input').fill('2026-04-30')
  await item('生效结束日期').locator('input').press('Tab')
  await item('已发布指标版本').locator('.el-select').click()
  await page.getByRole('option', { name: new RegExp(state.tag) }).click()
  await dialog.getByText({ MAIN: '主结果', ALL: '全部结果', GROUPED: '分组结果' }[spec.mode], { exact: true }).click()
  if (spec.mode === 'GROUPED') {
    await item('分组粒度').locator('.el-select').click()
    await page.getByRole('option', { name: spec.targetCode === 'BASE' ? /^组合粒度/ : /全院到出院科室 \/ 出院科室/ }).click()
    for (const member of spec.members || []) {
      const select = item('OUT_DEPT_CODE 成员').locator('.el-select')
      await select.click()
      await select.locator('input').fill(member)
      await page.getByRole('option', { name: new RegExp(`（${member}）$`) }).click()
      await page.keyboard.press('Escape')
    }
  }
  const root = dialog.locator('.warning-editor > .warning-condition')
  await root.waitFor()
  await configureGroup(root, spec.condition || condition)
  await item('接收用户').locator('.el-select').click()
  await page.getByRole('option', { name: /admin/ }).click()
  await page.keyboard.press('Escape')
  const response = page.waitForResponse(response => response.url().endsWith('/analysis/warning-rules') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: '创建草稿', exact: true }).click()
  const created = parse(await (await response).text())
  assert.equal(created.code, 'OK', JSON.stringify(created))
  state.rules[spec.key] = { id: created.data.id, versionId: created.data.version.id }; await saveState()
  dialog = page.getByRole('dialog', { name: '预警规则', exact: true })
  await dialog.getByRole('button', { name: '发布规则', exact: true }).click()
  await page.getByRole('dialog', { name: '发布预警规则', exact: true }).getByRole('button', { name: '发布规则', exact: true }).click()
  await dialog.getByRole('button', { name: '启用规则', exact: true }).click()
  await page.getByRole('dialog', { name: '启用预警规则', exact: true }).getByRole('button', { name: '启用规则', exact: true }).click()
  await dialog.getByRole('button', { name: '停用规则', exact: true }).waitFor()
  await dialog.locator('output[aria-label="当前条件"]').scrollIntoViewIfNeeded()
  await dialog.screenshot({ path: `${evidence}/rule-${spec.key}.png` })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  console.log(`UI CREATED/PUBLISHED/ENABLED ${spec.key}: ${created.data.id}`)
}
try {
  if (!state.versionId) {
    const source = await api('GET', '/indicator-versions/102027642463173253')
    const indicator = state.indicatorId ? { id: state.indicatorId, name: state.name } : await api('POST', '/indicators', {
      code: state.tag, name: `男性出院占比预警真实验收 ${state.tag}`, unit: '%',
      description: '真实源表验收，复制既有男性出院占比公式和粒度配置；不覆盖原指标，不使用模拟数据。' })
    state.indicatorId = indicator.id; state.name = indicator.name; await saveState()
    const version = await api('POST', `/indicators/${indicator.id}/versions`, { formula: source.formula, dimensionGrain: source.dimensionGrain,
      drillPaths: source.drillConfig.drillPaths.map(({ pathCode, pathVersionId, maxLevel }) => ({ pathCode, pathVersionId, maxLevel })),
      factorDimensionBindings: source.factorDimensionBindings, calculationMode: 'TEMPORAL' })
    state.versionId = version.id; await saveState()
  }
  const currentVersion = await api('GET', `/indicator-versions/${state.versionId}`)
  if (currentVersion.status !== 'PUBLISHED') {
    if (!currentVersion.currentArtifactId) await api('POST', `/indicator-versions/${state.versionId}/formula/compile`, { resourceVersion: currentVersion.version })
    await calculate('trial')
    await api('POST', `/indicator-versions/${state.versionId}/publish`)
  }
  const options = await api('GET', `/analysis/warning-rules/scope-options?indicatorVersionId=${state.versionId}`)
  await save('scope-options', options)
  const base = options.find(option => option.targetCode === 'BASE')
  const drill = options.find(option => option.targetCode.startsWith('DRILL:'))
  assert.deepEqual(base.dimensions, ['OUT_DEPT_CODE'])
  assert.deepEqual(drill.dimensions, ['OUT_DEPT_CODE', 'OUT_DEPT_NAME'])
  specs = [
    { key: 'BASE', name: '组合科室', mode: 'GROUPED', targetCode: base.targetCode },
    { key: 'DRILL', name: '下钻科室', mode: 'GROUPED', targetCode: drill.targetCode },
    { key: 'MEMBERS', name: '限定科室22、21、14', mode: 'GROUPED', targetCode: drill.targetCode, members: ['22', '21', '14'] },
    { key: 'MAIN', name: '全院总体', mode: 'MAIN' },
    { key: 'ALL', name: '全部粒度', mode: 'ALL' },
    { key: 'BOUNDARY', name: '25%阈值边界', mode: 'GROUPED', targetCode: base.targetCode, condition: { logic: 'AND', children: [
      { operator: 'GTE', threshold: '0.25' }, { operator: 'LTE', threshold: '0.25' }, { operator: 'NE', threshold: '0' },
      { logic: 'NOT', children: [{ operator: 'GT', threshold: '0.25' }] },
      { logic: 'NOT', children: [{ operator: 'LT', threshold: '0.25' }] }
    ] } },
    { key: 'NEGATIVE', name: '负例非非负值', mode: 'ALL', condition: { logic: 'NOT', children: [{ operator: 'GTE', threshold: '0' }] } }
  ]
  await page.goto(`${origin}/alerts`)
  await page.getByRole('tab', { name: '预警规则', exact: true }).click()
  for (const spec of specs) {
    if (!state.rules[spec.key]) await createRule(spec)
    else {
      const rule = await api('GET', `/analysis/warning-rules/${state.rules[spec.key].id}`)
      if (rule.version.publicationStatus !== 'PUBLISHED') await api('POST', `/analysis/warning-rule-versions/${rule.version.id}/publish`, { resourceVersion: rule.version.resourceVersion })
      const current = await api('GET', `/analysis/warning-rules/${rule.id}`)
      if (current.enableStatus !== 'ENABLED') await api('POST', `/analysis/warning-rules/${rule.id}/enable`, { resourceVersion: current.resourceVersion })
    }
  }
  const batch = await calculate('formal')
  const targets = await targetResults(batch)
  await save('real-results', targets)
  assert.equal(targets.find(target => target.targetCode === 'BASE').rows.length, 24)
  assert.equal(targets.find(target => !target.grain.length).rows.length, 1)
  assert.equal(targets.find(target => target.targetCode === drill.targetCode).rows.length, 24)
  const checks = [], eventLists = {}
  for (const spec of specs) {
    const candidates = targets.filter(target => spec.mode === 'ALL' || (spec.mode === 'MAIN'
      ? !target.grain.some(field => !/^TIME_(YEAR|QUARTER|MONTH|DAY|WEEK)$/i.test(field)) : target.targetCode === spec.targetCode))
      .flatMap(target => target.rows)
    const expected = candidates.filter(row => spec.key === 'NEGATIVE' ? Number(row.value) < 0 : spec.key === 'BOUNDARY' ? Number(row.value) === 0.25 : matches(row))
      .filter(row => !spec.members || spec.members.includes(String(row.dimensions.out_dept_code)))
    let events
    for (let attempt = 0; attempt < 15; attempt++) {
      events = await api('GET', `/analysis/warnings?ruleId=${state.rules[spec.key].id}&page=1&size=100`)
      if (events.records.length >= expected.length) break
      await pause(1000)
    }
    eventLists[spec.key] = events.records
    const expectedIds = expected.map(row => String(row.resultId)).sort()
    const actualIds = events.records.map(event => String(event.indicatorResultId)).sort()
    const passed = JSON.stringify(expectedIds) === JSON.stringify(actualIds)
    checks.push({ key: spec.key, passed, expected: expectedIds.length, actual: actualIds.length, expectedIds, actualIds })
    for (const event of events.records) {
      const row = candidates.find(row => String(row.resultId) === String(event.indicatorResultId))
      assert.ok(row, `${spec.key} event must reference this batch and matching target`)
      assert.equal(Number(event.actualValue), Number(row.value))
      assert.deepEqual(event.comparisonContext.dimensionSnapshot, row.dimensions)
      assert.deepEqual(event.comparisonContext.condition, spec.condition || condition)
    }
    console.log(`${passed ? 'PASS' : 'FAIL'} ${spec.key}: expected=${expected.length} actual=${events.records.length}`)
  }
  await save('events', eventLists); await save('checks', checks)
  assert.ok(checks.every(check => check.passed), JSON.stringify(checks.filter(check => !check.passed)))
  const selected = eventLists.MEMBERS[0]
  assert.equal(selected.comparisonContext.dimensionSnapshot.out_dept_code, '22')
  let deliveries
  for (let attempt = 0; attempt < 20; attempt++) {
    deliveries = await api('GET', `/analysis/warnings/${selected.id}/deliveries?page=1&size=100`)
    if (deliveries.records.some(item => item.channel === 'IN_APP' && item.status === 'SENT')) break
    await pause(1000)
  }
  await save('deliveries', deliveries)
  assert.ok(deliveries.records.some(item => item.channel === 'IN_APP' && item.status === 'SENT'), JSON.stringify(deliveries))
  const notifications = await api('GET', '/me/notifications?page=1&size=100')
  const notification = notifications.records.find(item => String(item.businessRefId) === String(selected.id))
  await save('notification', notification || null)
  assert.ok(notification, 'A real in-app notification must exist for the selected event')
  assert.match(notification.content, /满足条件.*且.*非.*或/)
  assert.match(notification.content, /out_dept_code=22/)
  assert.match(notification.content, /out_dept_name=泌尿外科/)
  await page.goto(`${origin}/alerts?eventId=${selected.id}`)
  const detail = page.getByRole('dialog', { name: '预警事件详情', exact: true })
  await detail.getByText('触发条件', { exact: true }).waitFor()
  await detail.screenshot({ path: `${evidence}/event-detail.png` })
  assert.ok((await detail.innerText()).includes('22'))
  const beforeCounts = checks.map(check => check.actual)
  await calculate('dedup')
  await pause(3000)
  const afterCounts = []
  for (const spec of specs) afterCounts.push(Number((await api('GET', `/analysis/warnings?ruleId=${state.rules[spec.key].id}&page=1&size=100`)).total))
  assert.deepEqual(afterCounts, beforeCounts, 'Recalculating the same period must not duplicate events')
  assert.deepEqual(errors, []); assert.deepEqual(failures, [])
  await save('acceptance', { status: 'PASS', indicatorId: state.indicatorId, versionId: state.versionId, checks, dedupCounts: afterCounts, errors, failures })
  console.log(`PASS REAL ACCEPTANCE ${state.versionId}; evidence=${evidence}`)
} catch (error) {
  await save('failure', { message: error.message, errors, failures })
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  for (const rule of Object.values(state.rules)) {
    try {
      const current = await api('GET', `/analysis/warning-rules/${rule.id}`)
      if (current.enableStatus === 'ENABLED') await api('POST', `/analysis/warning-rules/${rule.id}/disable`, { resourceVersion: current.resourceVersion })
    } catch (error) { console.error(`CLEANUP FAILED ${rule.id}: ${error.message}`); process.exitCode = 1 }
  }
  if (state.versionId) {
    try {
      const schedules = (await api('GET', '/calc/schedules')).filter(schedule => String(schedule.ownerVersionId) === String(state.versionId))
      for (const schedule of schedules) {
        if (schedule.status === 'ACTIVE') await api('PATCH', `/calc/schedules/${schedule.id}/status`, { enabled: false })
      }
      await save('disabled-test-schedules', schedules.map(schedule => schedule.id))
    } catch (error) { console.error(`SCHEDULE CLEANUP FAILED: ${error.message}`); process.exitCode = 1 }
  }
  await browser.close()
}

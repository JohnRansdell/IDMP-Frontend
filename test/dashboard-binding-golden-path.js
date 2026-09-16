import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runFilterGoldenPath } from './dashboard-filter-golden-path.js'

// Isolated browser transport fixture: explicitly NOT a claim that production has
// department-by-month rows. UI actions still execute the mounted Vue application.
const fixture = {
  summaryCards: { deathNum: 2, dischargeNum: 300, outpatientNum: 1200 },
  monthlyTrend: [
    { month: '1月', departmentName: '内科', category: '质量', value: 2, numerator: 4 },
    { month: '1月', departmentName: '外科', category: '安全', value: 6, numerator: 12 },
    { month: '2月', departmentName: '内科', category: '安全', value: 4, numerator: 8 },
    { month: '2月', departmentName: '外科', category: '质量', value: 8, numerator: 16 }
  ],
  departmentRanking: [{ deptName: '内科', value: 2 }, { deptName: '外科', value: 6 }]
}
export async function runBindingGoldenPath(cdp, { click, domClick, value, waitFor, setInput, gridNode, delay, reload }) {
  const errors = []
  cdp.onEvent = message => {
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (message.method !== 'Fetch.requestPaused') return
    const data = message.params.request.url.endsWith('/query') ? fixture : { code: 'quality-overview', name: 'Binding E2E fixture', widgets: [] }
    cdp.send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ code: '0', data })).toString('base64') }).catch(error => errors.push(error.message))
  }
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*analysis/dashboards/quality-overview*' }] })
  await reload(cdp)
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-edit"]')`)
  await click(cdp, '[data-testid="dashboard-edit"]')
  await waitFor(cdp, `document.querySelector('[aria-label="指标数据"]')?.closest('.el-select')?.textContent.includes('死亡人数')`)
  const expected = []
  const setSelect = async (selector, nextValue) => {
    await value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.value = ${JSON.stringify(nextValue)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await delay(100)
  }
  const addField = async (slot, field) => {
    await click(cdp, `[data-testid="binding-slot-${slot}"]`)
    await click(cdp, `[data-testid="binding-field-${field}"]`)
    await waitFor(cdp, `document.querySelector('[data-testid="binding-chip-${slot}-${field}"]')`)
  }
  for (const kind of ['line', 'bar', 'pie', 'kpi']) {
    await click(cdp, `[data-testid="dashboard-library-${kind}"]`)
    await click(cdp, '[data-testid="dashboard-add-widget"]')
    await click(cdp, '[data-testid="dashboard-configure-widget"]')
    await setInput(cdp, '[data-testid="dashboard-widget-title"]', `Binding ${kind}`)
    const id = await value(cdp, `document.querySelector('.grid-stack-item.is-selected')?.getAttribute('data-widget-id') || document.querySelector('[data-testid="dashboard-canvas"] .grid-stack-item:last-of-type').getAttribute('data-widget-id')`)
    const selector = `[data-widget-id="${id}"]`
    const layout = await gridNode(cdp, selector)
    if (kind !== 'kpi') await addField('dimensions', kind === 'line' ? 'month' : 'deptName')
    await addField('measures', 'value')
    if (kind === 'line') {
      await setSelect('[data-testid="binding-aggregation-value"]', 'avg')
      await addField('series', 'departmentName')
      await addField('measures', 'numerator')
      await setSelect('[data-testid="binding-aggregation-numerator"]', 'sum')
    }
    if (kind === 'bar') {
      await setSelect('[data-testid="binding-sort-field"]', 'value')
      await setSelect('[data-testid="binding-sort-direction"]', 'desc')
    }
    await waitFor(cdp, `document.querySelector('${selector} [data-binding-status="ready"]')`)
    assert.deepEqual(await gridNode(cdp, selector), layout, 'binding must not change layout')
    if (kind === 'kpi') assert.equal(await value(cdp, `document.querySelector('${selector} [data-testid="binding-kpi-value"]').textContent`), '2')
    else {
      await waitFor(cdp, `document.querySelector('${selector} canvas')`)
      if (kind === 'line') assert.equal(await value(cdp, `document.querySelector('${selector} [role="img"]').getAttribute('aria-label')`), 'Binding line，4 个系列')
      if (kind === 'bar') assert.equal(await value(cdp, `document.querySelector('${selector} tbody tr td').textContent`), '外科')
    }
    expected.push({ id, kind, layout })
    if (process.env.DASHBOARD_BINDING_VISUAL_DIR) {
      await mkdir(process.env.DASHBOARD_BINDING_VISUAL_DIR, { recursive: true })
      await value(cdp, `document.querySelector('${selector}').scrollIntoView({ block: 'center', inline: 'center' }); document.querySelector('.studio-inspector').scrollTop = 0`)
      await delay(400)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(process.env.DASHBOARD_BINDING_VISUAL_DIR, `binding-${kind}.png`), Buffer.from(shot.data, 'base64'))
    }
  }
  // Existing Ranking has no add-library entry; configure its real saved widget.
  const rankingSelector = '[data-widget-id="ranking-list"]'
  await click(cdp, rankingSelector)
  await click(cdp, '[data-testid="dashboard-configure-widget"]')
  const rankingLayout = await gridNode(cdp, rankingSelector)
  await addField('dimensions', 'deptName')
  await addField('measures', 'value')
  await setSelect('[data-testid="binding-sort-field"]', 'value')
  await setSelect('[data-testid="binding-sort-direction"]', 'desc')
  await waitFor(cdp, `document.querySelector('${rankingSelector} [data-binding-status="ready"]')`)
  assert.ok(await value(cdp, `document.querySelector('${rankingSelector} .binding-ranking li').textContent.includes('外科')`))
  assert.deepEqual(await gridNode(cdp, rankingSelector), rankingLayout)
  expected.push({ id: 'ranking-list', kind: 'ranking', layout: rankingLayout })
  assert.ok(await value(cdp, `document.querySelector('.dashboard-save-state').textContent.includes('未保存')`))
  await domClick(cdp, '[data-testid="dashboard-save"]')
  await waitFor(cdp, `document.querySelector('.dashboard-save-state')?.textContent.includes('已保存')`)
  const stored = await value(cdp, `JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:quality-overview'))`)
  for (const item of expected) item.binding = stored.widgets.find(widget => widget.id === item.id).config.dataBinding
  await reload(cdp)
  await waitFor(cdp, `document.querySelectorAll('[data-binding-status="ready"]').length === 5`)
  assert.equal(await value(cdp, `document.querySelectorAll('.dashboard-grid-guide').length`), 0)
  for (const item of expected) {
    const selector = `[data-widget-id="${item.id}"]`
    assert.deepEqual(await gridNode(cdp, selector), item.layout, 'viewer must retain geometry')
    if (item.kind === 'line') assert.equal(await value(cdp, `document.querySelector('${selector} [role="img"]').getAttribute('aria-label')`), 'Binding line，4 个系列')
  }
  await click(cdp, '[data-testid="dashboard-edit"]')
  for (const item of expected) {
    await click(cdp, `[data-widget-id="${item.id}"]`)
    await click(cdp, '[data-testid="dashboard-configure-widget"]')
    for (const slot of ['dimensions', 'measures', 'series']) for (const field of item.binding[slot]) {
      assert.ok(await value(cdp, `document.querySelector('[data-testid="binding-chip-${slot}-${field.field}"]')`))
      if (slot === 'measures') assert.equal(await value(cdp, `document.querySelector('[data-testid="binding-aggregation-${field.field}"]').value`), field.aggregation)
    }
    assert.equal(await value(cdp, `document.querySelector('[data-testid="binding-dataset"]').value`), item.binding.dataset)
    if (item.binding.sort.length) assert.equal(await value(cdp, `document.querySelector('[data-testid="binding-sort-direction"]').value`), 'desc')
  }
  const reloaded = await value(cdp, `JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:quality-overview'))`)
  assert.deepEqual(reloaded, stored)
  await click(cdp, '[data-testid="binding-chip-measures-value"] button')
  await waitFor(cdp, `document.querySelector('${rankingSelector} [data-testid="binding-invalid"]')`)
  await addField('measures', 'value')
  await waitFor(cdp, `document.querySelector('${rankingSelector} [data-binding-status="ready"]')`)
  assert.deepEqual(errors, [], 'binding UI must not throw runtime exceptions')
  process.stdout.write('dashboard-binding-golden-path: PASS (Line multi-measure/Series, Bar sort, Pie, KPI, Ranking → Save → Reload → Viewer → Inspector; invalid binding recovery)\n')
  await runFilterGoldenPath(cdp, { click, domClick, value, waitFor, setInput, gridNode, delay, reload }, expected)
  assert.deepEqual(errors, [], 'filter UI must not throw runtime exceptions')
  await cdp.send('Fetch.disable')
}

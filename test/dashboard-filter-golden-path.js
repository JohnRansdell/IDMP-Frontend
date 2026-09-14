import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Extends the real mounted browser flow using the explicitly isolated binding HTTP
// fixture. No engine calls, schema injections, or direct runtime mutations.
export async function runFilterGoldenPath(cdp, { click, domClick, value, waitFor, gridNode, delay, reload }, widgets) {
  const kpi = widgets.find(widget => widget.kind === 'kpi')
  const bar = widgets.find(widget => widget.kind === 'bar')
  const line = widgets.find(widget => widget.kind === 'line')
  const storage = () => value(cdp, `JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:quality-overview'))`)
  const setSelect = async (selector, next) => {
    await value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.value = ${JSON.stringify(next)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await delay(80)
  }
  const selectWidget = async item => { await click(cdp, `[data-widget-id="${item.id}"]`); await click(cdp, '[data-testid="dashboard-configure-widget"]') }
  const addField = async (slot, field) => { await click(cdp, `[data-testid="binding-slot-${slot}"]`); await click(cdp, `[data-testid="binding-field-${field}"]`) }
  const save = async () => { await domClick(cdp, '[data-testid="dashboard-save"]'); await waitFor(cdp, `document.querySelector('.dashboard-save-state')?.textContent.includes('已保存')`) }
  const viewer = async () => { await reload(cdp); await waitFor(cdp, `document.querySelector('[data-testid="dashboard-edit"]') && document.querySelector('[data-testid="dashboard-filter-bar"]')`) }
  const kpiIs = text => waitFor(cdp, `document.querySelector('[data-widget-id="${kpi.id}"] [data-testid="binding-kpi-value"]')?.textContent === '${text}'`)
  const table = item => value(cdp, `[...document.querySelectorAll('[data-widget-id="${item.id}"] tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))`)
  const runtimeChoice = async (field, option) => {
    const control = `[data-testid="dashboard-filter-bar"] [data-filter-field="${field}"]`
    if (!await value(cdp, `document.querySelector('${control} details').open`)) await click(cdp, `${control} summary`)
    await click(cdp, `${control} [data-filter-option="${option}"]`)
  }
  for (const item of [kpi, bar]) {
    await selectWidget(item)
    await setSelect('[data-testid="binding-dataset"]', 'trend')
    if (item.kind === 'bar') await addField('dimensions', 'departmentName')
    await addField('measures', 'value')
    await setSelect('[data-testid="binding-aggregation-value"]', 'avg')
  }
  await click(cdp, '[data-testid="dashboard-settings"]')
  for (const field of ['departmentName', 'month', 'category']) {
    await setSelect('[data-testid="global-filter-field"]', field)
    await click(cdp, '[data-testid="global-filter-add"]')
  }
  await click(cdp, '[data-definition-field="month"] summary')
  await click(cdp, '[data-definition-field="month"] [data-filter-option="1月"]')
  assert.ok(await value(cdp, `document.querySelector('.dashboard-save-state').textContent.includes('未保存')`))
  await save()
  const definition = await storage()
  assert.deepEqual(definition.globalFilters.find(def => def.field === 'departmentName').defaultValue, [])
  assert.deepEqual(definition.globalFilters.find(def => def.field === 'month').defaultValue, ['1月'])
  await runtimeChoice('departmentName', '内科'); await kpiIs('2')
  assert.ok(await value(cdp, `document.querySelector('.dashboard-save-state').textContent.includes('已保存')`), 'Designer preview selection must not mark definition dirty')
  assert.deepEqual(await storage(), definition)
  await viewer(); await kpiIs('4')
  const initialLine = await table(line), initialBar = await table(bar)
  await runtimeChoice('departmentName', '内科'); await kpiIs('2')
  assert.notDeepEqual(await table(line), initialLine); assert.notDeepEqual(await table(bar), initialBar)
  await runtimeChoice('month', '1月'); await runtimeChoice('month', '2月'); await kpiIs('4')
  assert.deepEqual(await table(bar), [['内科', '4']])
  assert.equal((await table(line))[0][0], '2月')
  await click(cdp, '[data-testid="dashboard-filter-reset"]'); await kpiIs('4')
  assert.deepEqual(await table(line), initialLine); assert.deepEqual(await table(bar), initialBar)
  await runtimeChoice('category', '质量'); await kpiIs('2')
  assert.deepEqual(await storage(), definition, 'runtime must not persist or overwrite defaults')
  await viewer(); await kpiIs('4')
  assert.equal(await value(cdp, `document.querySelector('[data-filter-field="category"] [data-filter-option="质量"]').checked`), false)
  assert.equal(await value(cdp, `document.querySelector('[data-filter-field="month"] [data-filter-option="1月"]').checked`), true)
  // Component category condition is configured through the existing field picker.
  await click(cdp, '[data-testid="dashboard-edit"]'); await selectWidget(bar)
  await click(cdp, '[data-testid="component-filter-add"]')
  await click(cdp, '[data-testid="binding-field-category"]')
  await setSelect('[data-condition-field="category"] > select', 'equals')
  await setSelect('[data-condition-field="category"] .filter-value select', '1') // 安全, actual field dictionary index
  await save(); await viewer(); await kpiIs('4')
  assert.deepEqual(await table(bar), [['外科', '6']])
  assert.deepEqual(await table(line), initialLine, 'component filter must not affect another widget')
  await runtimeChoice('departmentName', '内科'); await kpiIs('2')
  await waitFor(cdp, `document.querySelector('[data-widget-id="${bar.id}"] [data-binding-status="empty"]')`)
  await runtimeChoice('month', '1月'); await runtimeChoice('month', '2月'); await kpiIs('4')
  assert.deepEqual(await table(bar), [['内科', '4']], 'global time/department AND component category')
  // Scope exclusion is persisted, not a filter-bar runtime value.
  await click(cdp, '[data-testid="dashboard-edit"]'); await selectWidget(bar)
  await click(cdp, '[data-ignore-filter="filter-departmentName"]')
  await save(); await viewer(); await kpiIs('4')
  await runtimeChoice('departmentName', '内科'); await kpiIs('2')
  assert.deepEqual(await table(bar), [['外科', '6']], 'only the opted-out widget ignores department')
  const saved = await storage()
  const barDefinition = saved.widgets.find(widget => widget.id === bar.id)
  assert.deepEqual(barDefinition.config.query.ignoredGlobalFilterIds, ['filter-departmentName'])
  assert.deepEqual(barDefinition.config.dataBinding.filters, [{ field: 'category', operator: 'equals', value: '安全' }])
  assert.deepEqual(saved.globalFilters, definition.globalFilters)
  for (const item of [kpi, line, bar]) assert.deepEqual(await gridNode(cdp, `[data-widget-id="${item.id}"]`), item.layout)
  assert.equal(await value(cdp, `document.querySelectorAll('.dashboard-grid-guide').length`), 0)
  if (process.env.DASHBOARD_FILTER_VISUAL_DIR) {
    await mkdir(process.env.DASHBOARD_FILTER_VISUAL_DIR, { recursive: true })
    await value(cdp, 'window.scrollTo(0, 0)')
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.DASHBOARD_FILTER_VISUAL_DIR, 'filter-viewer.png'), Buffer.from(shot.data, 'base64'))
  }
  process.stdout.write('dashboard-filter-golden-path: PASS (definitions/defaults, 3 widgets, department/month/category, reset/reload, component AND, ignored global, geometry)\n')
}

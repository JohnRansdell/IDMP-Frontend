import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = (await readFile(new URL('../src/idmp/features/dashboard/medicalRuntime.js', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from ['"][^'"]+['"]/g, '').replace('export function', 'function')
const create = Function(`${source}; return createMedicalDashboardRuntime`)()

test('shared viewer uses scoped metadata, inclusive wire bounds and per-result drill tickets', async () => {
  const calls = []
  const api = {
    openMedicalDashboard: async id => calls.push(['open', id]),
    fetchMedicalDashboard: async () => ({ dashboard: { id: '2' } }),
    fetchMedicalDashboardMetadata: async () => ({ deptCode: '16', deptName: 'Current department', widgets: { W1: { fields: [{ code: 'value' }], periods: [] } } }),
    queryMedicalDashboard: async (id, query) => {
      calls.push(['query', query])
      const resultId = query.widgetCodes[0]
      return { drillTicket: `ticket-${resultId}`, data: { widgets: { [resultId]: { status: 'READY', rows: [{ value: 1, drillContext: { resultId, snapshotId: '100' } }] }, BLOCKED: { status: 'FORBIDDEN', rows: [], message: 'No scoped source' } } } }
    },
    fetchMedicalDrillPath: async (id, ticket, resultId) => { calls.push(['path', ticket, resultId]); return { levels: [{ levelCode: 'DOCTOR' }] } },
    searchMedicalDrill: async (id, ticket, resultId) => calls.push(['drill', ticket, resultId])
  }
  const runtime = create(api)
  await runtime.load('2')
  assert.deepEqual([...runtime.departmentNames], [['16', 'Current department']])
  assert.equal(runtime.widgetMetadata('W1').fields[0].code, 'value')
  const results = await Promise.all(['55', '56'].map(code => runtime.query('2', { periodStart: '2026-01-01', periodEnd: '2026-02-01', widgetCodes: [code] })))
  assert.ok(calls.filter(c => c[0] === 'query').every(c => c[1].periodEnd === '2026-01-31'))
  assert.equal(results[0].widgets.BLOCKED.status, 'ERROR')
  assert.equal(results[0].widgets.BLOCKED.message, 'No scoped source')
  await runtime.query('2', { periodStart: '2026-02-01', periodEnd: '2026-05-01', granularity: 'CUSTOM', widgetCodes: ['57'] })
  assert.equal(calls.filter(c => c[0] === 'query').at(-1)[1].periodEnd, '2026-05-01')
  await runtime.drillTarget({ config: {} }, {}, { rows: results[0].widgets['55'].rows })
  await runtime.searchDrill('55', {})
  await runtime.searchDrill('56', {})
  assert.ok(calls.some(c => c[0] === 'path' && c[1] === 'ticket-55'))
  assert.ok(calls.some(c => c[0] === 'drill' && c[1] === 'ticket-55'))
  assert.ok(calls.some(c => c[0] === 'drill' && c[1] === 'ticket-56'))
  assert.throws(() => runtime.searchDrill('forged', {}))
  await runtime.load('2')
  assert.throws(() => runtime.searchDrill('55', {}), /下钻授权已失效/)
})

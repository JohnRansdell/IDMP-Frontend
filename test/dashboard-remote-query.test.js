import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRemoteFilterOptionQuery, buildRemoteWidgetQuery } from '../src/idmp/features/dashboard/remoteQuery.js'

const fields = ['OUT_DEPT_CODE', 'IN_ICD10', 'scenarioVersionId'].map(code => ({ code, filterable: true }))
const widget = { id: 'w1', sourceCode: 'indicator-a', config: {} }

test('remote widget query applies only supported, enabled and scoped filters', () => {
  const result = buildRemoteWidgetQuery({ ...widget, config: { query: { ignoredGlobalFilterIds: ['disease'] } } }, {
    periodStart: '2026-01-01', periodEnd: '2026-02-01', fields,
    definitions: [{ id: 'department', field: 'OUT_DEPT_CODE' }, { id: 'disease', field: 'IN_ICD10' }, { id: 'other', field: 'UNKNOWN' }],
    values: { department: '10', disease: 'A', other: 'B' }
  })
  assert.deepEqual(result.query.filters, { OUT_DEPT_CODE: '10' })
  assert.deepEqual(result.query.widgetCodes, ['w1'])
})

test('fixed component period, organization and scenario narrow the query', () => {
  const result = buildRemoteWidgetQuery({ ...widget, config: { backendQuery: {
    periodMode: 'FIXED', periodStart: '2026-01-10', periodEnd: '2026-01-20', granularity: 'DAILY',
    organizationMode: 'FIXED', organizationScope: { level: 'DEPARTMENT', ids: ['10'] },
    scenarioMode: 'FIXED', scenarioVersionIds: ['123']
  } } }, { periodStart: '2026-01-01', periodEnd: '2026-02-01', fields })
  assert.deepEqual(result.query, {
    periodStart: '2026-01-10', periodEnd: '2026-01-21', granularity: 'DAILY', widgetCodes: ['w1'],
    filters: { OUT_DEPT_CODE: ['10'], scenarioVersionId: ['123'] }
  })
  assert.deepEqual(buildRemoteWidgetQuery({ ...widget, config: { backendQuery: { periodMode: 'FIXED', periodStart: '2025-01-01', periodEnd: '2025-01-31' } } }, {
    periodStart: '2026-01-01', periodEnd: '2026-02-01', fields
  }), { empty: true })
})

test('unsupported fixed organization fails visibly and conflicting scope is empty', () => {
  const scoped = { ...widget, config: { backendQuery: { organizationMode: 'FIXED', organizationScope: { level: 'DOCTOR', ids: ['1'] } } } }
  assert.match(buildRemoteWidgetQuery(scoped, { fields }).error, /不支持/)
  const department = { ...widget, config: { backendQuery: { organizationMode: 'FIXED', organizationScope: { level: 'DEPARTMENT', ids: ['11'] } } } }
  assert.deepEqual(buildRemoteWidgetQuery(department, { fields, definitions: [{ id: 'd', field: 'OUT_DEPT_CODE' }], values: { d: '10' } }), { empty: true })
})

test('candidate values use selected upstream fields, not the child value', () => {
  const definitions = [
    { id: 'department', field: 'OUT_DEPT_CODE' },
    { id: 'disease', field: 'IN_ICD10', dependsOn: ['department'] }
  ]
  assert.deepEqual(buildRemoteFilterOptionQuery(definitions[1], definitions, { department: '10', disease: 'old' }, fields, {
    periodStart: '2026-01-01', periodEnd: '2026-01-31'
  }), {
    fieldCode: 'IN_ICD10', periodStart: '2026-01-01', periodEnd: '2026-01-31', limit: 500,
    filters: { OUT_DEPT_CODE: '10' }
  })
})

test('date range on a period field narrows the remote query using an exclusive end', () => {
  const result = buildRemoteWidgetQuery(widget, {
    periodStart: '2026-01-01', periodEnd: '2026-02-01', fields,
    definitions: [{ id: 'date', field: 'periodStart', type: 'date-range' }],
    values: { date: ['2026-01-10', '2026-01-20'] }
  })
  assert.equal(result.query.periodStart, '2026-01-10')
  assert.equal(result.query.periodEnd, '2026-01-21')
})

test('non-period date range is not silently interpreted as an equality filter', () => {
  const result = buildRemoteWidgetQuery(widget, {
    periodStart: '2026-01-01', periodEnd: '2026-02-01',
    fields: [...fields, { code: 'SURGERY_DATE', filterable: true }],
    definitions: [{ id: 'date', field: 'SURGERY_DATE', type: 'date-range' }],
    values: { date: ['2026-01-10', '2026-01-20'] }
  })
  assert.match(result.error, /不支持范围查询/)
})

test('upstream period range narrows remote candidate options', () => {
  const definitions = [{ id: 'date', field: 'periodStart', type: 'date-range' }, { id: 'disease', field: 'IN_ICD10', dependsOn: ['date'] }]
  const query = buildRemoteFilterOptionQuery(definitions[1], definitions, { date: ['2026-01-10', '2026-01-20'] }, fields, {
    periodStart: '2026-01-01', periodEnd: '2026-01-31'
  })
  assert.equal(query.periodStart, '2026-01-10')
  assert.equal(query.periodEnd, '2026-01-20')
  assert.deepEqual(query.filters, {})
})

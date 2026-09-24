import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDashboardContext, formatDashboardContextValue, isActiveDashboardContextValue } from '../src/idmp/features/dashboard/dashboardContext.js'

test('dashboard context is absent for empty filter, interaction, and drill state', () => {
  const context = buildDashboardContext({ definitions: [{ id: 'department', label: '科室', enabled: true }], values: { department: '' } })
  assert.deepEqual(context.items, [])
  assert.equal(isActiveDashboardContextValue([]), false)
  assert.equal(isActiveDashboardContextValue(''), false)
})

test('dashboard context creates compact filter and interaction chips and formats multiple values', () => {
  const context = buildDashboardContext({
    definitions: [{ id: 'department', label: '科室', enabled: true }, { id: 'disease', label: '疾病', enabled: true }],
    values: { department: '呼吸内科', disease: ['肺炎', '哮喘'] },
    interactions: [{ id: 'line', label: '科室', value: '呼吸内科' }]
  })
  assert.deepEqual(context.filters.map(item => item.value), ['呼吸内科', '肺炎、哮喘'])
  assert.equal(context.interactions.length, 1)
  assert.equal(context.items.length, 3)
  assert.equal(formatDashboardContextValue(['A', 'B']), 'A、B')
})

test('dashboard context keeps drill separate from filter chips and resolves the widget title', () => {
  const context = buildDashboardContext({ drillStates: { 'chart-1': { path: ['呼吸内科', '呼吸一组'] } }, widgets: [{ id: 'chart-1', title: '组织趋势' }] })
  assert.equal(context.drills.length, 1)
  assert.deepEqual(context.drills[0], { id: 'drill:chart-1', kind: 'drill', label: '组织趋势', value: '全院 › 呼吸内科 › 呼吸一组' })
})

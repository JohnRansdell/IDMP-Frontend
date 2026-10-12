import test from 'node:test'
import assert from 'node:assert/strict'
import { widgetEmptyGuidance, widgetLibraryReadiness } from '../src/idmp/features/dashboard/widgetGuidance.js'

const dataset = (fields) => [{ id: 'backend', fields }]
const measure = { id: 'value', label: '指标值', semanticType: 'measure' }
const department = { id: 'department', label: '科室', semanticType: 'dimension' }

test('component library distinguishes ready charts from charts needing more fields', () => {
  assert.equal(widgetLibraryReadiness('kpi', { code: 'a' }, dataset([measure])).status, 'ready')
  assert.equal(widgetLibraryReadiness('bar', { code: 'a' }, dataset([department, measure])).status, 'ready')
  assert.match(widgetLibraryReadiness('scatter', { code: 'a' }, dataset([department, measure])).label, /两个数值字段/)
  assert.match(widgetLibraryReadiness('heatmap', { code: 'a' }, dataset([department, measure])).label, /两个维度/)
  assert.equal(widgetLibraryReadiness('text', null).status, 'ready')
  assert.equal(widgetLibraryReadiness('bar', null).status, 'missing-source')
})

test('empty widgets prioritize request errors and give a matching repair action', () => {
  assert.deepEqual(widgetEmptyGuidance({ status: 'invalid' }, { status: 'ERROR', message: '请求超时' }), {
    title: '数据预览失败', description: '请求超时', action: 'retry'
  })
  assert.equal(widgetEmptyGuidance({ status: 'invalid', message: '请添加一个维度字段' }, {}).action, 'configure')
  const empty = widgetEmptyGuidance({ status: 'empty' }, { status: 'EMPTY' })
  assert.equal(empty.action, 'filters')
  assert.match(empty.description, /画布顶部切换统计周期/)
  assert.notEqual(empty.title, '当前条件下没有结果')
  assert.equal(widgetEmptyGuidance({ status: 'invalid' }, { status: 'LOADING' }).action, '')
})

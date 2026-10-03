import test from 'node:test'
import assert from 'node:assert/strict'
import { breadcrumbLinks as B, buildPageBreadcrumbs } from '../src/router/breadcrumbs.js'

test('ancestor breadcrumbs are links while the current page is plain text', () => {
  const route = { meta: { breadcrumb: [B.home, B.factors, B.factorTemplates, '版本编辑'] } }
  const items = buildPageBreadcrumbs(route)
  assert.deepEqual(items.map(item => item.to), ['/dashboard', '/factor', '/factor/templates', undefined])
  assert.deepEqual(items.map(item => item.current), [false, false, false, true])
  assert.equal(items.at(-1).label, '版本编辑')
})

test('data governance and nested data pages have explicit parent destinations', () => {
  const items = buildPageBreadcrumbs({ meta: { breadcrumb: [B.home, B.data, B.domains, '数据域工作台'] } })
  assert.deepEqual(items.slice(0, -1).map(item => item.to), ['/dashboard', '/data', '/data/domains'])
})

test('indicator analysis has a link back to its query page and a noninteractive indicator name', () => {
  const items = buildPageBreadcrumbs({ name: 'IndicatorAnalysis', query: { indicatorName: '入院转科比例' }, meta: { breadcrumb: [B.home, '指标分析'] } })
  assert.equal(items[1].to, '/analysis')
  assert.equal(items[2].label, '入院转科比例')
  assert.equal(items[2].to, undefined)
})

test('drill parent navigation retains indicator and report dates but drops drill-specific state', () => {
  const query = { indicator: 'RATE', indicatorVersionId: '123456789012345678', indicatorName: '入院转科比例', periodStart: '2026-01-01', periodEnd: '2026-02-01', resultId: '1', pathCode: 'CUSTOM_DEPT', currentLevel: 'DEPT', parentKeys: '{"科室":"A"}', unrelated: ['a', 'b'] }
  const items = buildPageBreadcrumbs({ name: 'ResultDrill', query, meta: { breadcrumb: [B.home, B.analysis, '结果下钻'] } })
  assert.deepEqual(items[1].to, { path: '/analysis', query: { indicator: 'RATE', indicatorVersionId: '123456789012345678', indicatorName: '入院转科比例', periodStart: '2026-01-01', periodEnd: '2026-02-01' } })
  assert.equal(B.analysis.to, '/analysis')
})

test('building breadcrumbs never mutates shared route metadata', () => {
  const route = { meta: { breadcrumb: [B.home, B.analysis] } }
  const result = buildPageBreadcrumbs(route)
  result[0].label = 'changed'
  assert.equal(B.home.label, '首页')
  assert.equal(B.analysis.to, '/analysis')
  assert.deepEqual(buildPageBreadcrumbs({}), [{ label: '首页', current: true }])
})

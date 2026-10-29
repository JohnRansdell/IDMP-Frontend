import test from 'node:test'
import assert from 'node:assert/strict'
import * as echarts from 'echarts'
import { withCategoryViewport } from '../src/idmp/charts/categoryViewport.js'

const categories = Array.from({ length: 30 }, (_, i) => `住院科室${i + 1}`)
const values = categories.map((_, i) => i === 28 ? 1260 : i === 2 ? -130 : i)
for (const [name, series, horizontal, axis] of [
  ['single bar with offscreen extremes', [{ type: 'bar', barWidth: '58%', data: values }], false, {}],
  ['line with missing values and offscreen maximum', [{ type: 'line', data: values.map((v, i) => i % 3 ? v : null) }], false, { scale: true }],
  ['stacked bars retain combined extent', [{ type: 'bar', stack: '费用', data: values }, { type: 'bar', stack: '费用', data: values.map(v => v * 2) }], false, {}],
  ['horizontal bars retain numeric X ticks', [{ type: 'bar', data: values }], true, {}],
  ['zero only has stable usable ticks', [{ type: 'bar', data: categories.map(() => 0) }], false, {}],
  ['explicit bounds remain authoritative', [{ type: 'bar', data: values }], false, { min: -500, max: 2000, interval: 500 }],
  ['grouped bars keep all series extrema', [{ type: 'bar', data: values }, { type: 'bar', data: values.map(v => v * -2) }], false, {}]
]) test(name, () => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 600, height: 320 })
  try {
    const category = { type: 'category', data: categories }, numeric = { type: 'value', ...axis }
    const option = withCategoryViewport({ animation: false, xAxis: horizontal ? numeric : category, yAxis: horizontal ? category : numeric, series }, 600, 320)
    chart.setOption(option)
    const ticks = () => chart.getModel().getComponent(horizontal ? 'xAxis' : 'yAxis').axis.scale.getTicks().map(t => t.value)
    const before = ticks()
    assert.ok(before.length >= 2)
    const span = option.dataZoom[0].endValue
    for (const start of [10, 30 - span - 1, 0]) {
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: 'idmp-category-slider', startValue: start, endValue: start + span })
      assert.deepEqual(ticks(), before, `ticks changed after scrolling to ${start}`)
      assert.equal(chart.getModel().getSeriesByIndex(0).getData().count(), categories.length)
    }
    if (name.includes('stacked')) assert.ok(before.at(-1) >= 3780)
    if (axis.max) assert.equal(before.at(-1), axis.max)
    assert.ok(chart.renderToSVGString().includes('<path'))
  } finally { chart.dispose() }
})

test('category-only existing zoom is stabilized, numeric zoom is preserved', () => {
  const base = { xAxis: { type: 'category', data: categories }, yAxis: { type: 'value' }, series: [{ type: 'line', data: values }] }
  const zoom = [{ type: 'slider', xAxisIndex: 0, start: 10, end: 50 }, { type: 'slider', yAxisIndex: 0, start: 0, end: 80 }]
  const option = withCategoryViewport({ ...base, dataZoom: zoom }, 600, 320)
  assert.deepEqual(option.dataZoom[0], { ...zoom[0], filterMode: 'none' })
  assert.equal(option.dataZoom[1], zoom[1])
})

test('new query data recalculates the scale rather than freezing the previous query', () => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 600, height: 320 })
  const option = data => withCategoryViewport({ animation: false, xAxis: { type: 'category', data: categories }, yAxis: { type: 'value' }, series: [{ type: 'line', data }] }, 600, 320)
  try {
    chart.setOption(option(values), { notMerge: true })
    const original = chart.getModel().getComponent('yAxis').axis.scale.getExtent()[1]
    chart.setOption(option(values.map(v => v * 10)), { notMerge: true })
    assert.ok(chart.getModel().getComponent('yAxis').axis.scale.getExtent()[1] > original)
  } finally { chart.dispose() }
})

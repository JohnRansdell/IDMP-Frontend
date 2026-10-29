import test from 'node:test'
import assert from 'node:assert/strict'
import { withCategoryViewport } from '../src/idmp/charts/categoryViewport.js'

const labels = Array.from({ length: 49 }, (_, i) => `临床科室${i + 1}`)
const option = { grid: { bottom: 20 }, xAxis: { type: 'category', data: labels }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: labels.map((_, i) => ({ value: i % 3 ? i : 0, rowId: `记录${i}` })) }] }
test('dense bars scroll categories and values together without dropping zero rows or IDs', () => {
  const before = JSON.stringify(option)
  const result = withCategoryViewport(option, 600, 300)
  assert.equal(result.series[0].data, option.series[0].data)
  assert.equal(result.series[0].barMaxWidth, 24)
  assert.equal(result.dataZoom[0].filterMode, 'none')
  assert.ok(result.dataZoom[0].endValue >= 10, '600px should display at least eleven categories')
  assert.equal(result.xAxis.data, labels)
  assert.equal(result.xAxis.axisTick.alignWithLabel, true)
  assert.equal(result.xAxis.axisLabel.interval, 0)
  assert.equal(result.xAxis.axisLabel.hideOverlap, false)
  const longName = '老年医学科干部保健科综合一病区'
  assert.equal(result.xAxis.axisLabel.formatter(longName).replaceAll('\n', ''), longName)
  assert.ok(result.xAxis.axisLabel.height >= 15)
  assert.ok(result.dataZoom[0].endValue < labels.length - 1)
  assert.equal(result.dataZoom[0].xAxisIndex, 0)
  assert.equal(JSON.stringify(option), before)
})
test('line windows shrink responsively and preserve the scrolled starting index', () => {
  const line = { ...option, series: [{ type: 'line', data: labels.map((_, i) => i === 0 ? null : i) }] }
  const desktop = withCategoryViewport(line, 1000, 320)
  const mobile = withCategoryViewport(line, 300, 320, 12)
  assert.equal(mobile.dataZoom[0].startValue, 12)
  assert.ok(mobile.dataZoom[0].endValue - 12 < desktop.dataZoom[0].endValue)
  assert.equal(mobile.series[0], line.series[0])
})
test('sparse, existing zoom and noncartesian plots keep their existing presentation', () => {
  const sparse = { ...option, xAxis: { type: 'category', data: ['一月'] } }
  assert.equal(withCategoryViewport(sparse, 1000, 320).dataZoom, undefined)
  const zoom = [{ type: 'slider', start: 30, end: 60 }]
  assert.deepEqual(withCategoryViewport({ ...option, dataZoom: zoom }, 600, 320).dataZoom, [{ ...zoom[0], filterMode: 'none' }])
  assert.equal(zoom[0].filterMode, undefined)
  const pie = { series: [{ type: 'pie', data: [1, 2] }] }
  assert.equal(withCategoryViewport(pie, 300, 320), pie)
})
test('horizontal bars scroll on Y and reserve room for bottom legends', () => {
  const horizontal = { ...option, xAxis: option.yAxis, yAxis: option.xAxis }
  assert.equal(withCategoryViewport(horizontal, 600, 250).dataZoom[0].yAxisIndex, 0)
  const result = withCategoryViewport({ ...option, legend: { bottom: 0 } }, 600, 300)
  assert.ok(result.grid.bottom > result.dataZoom[1].bottom + result.dataZoom[1].height)
})

test('full category labels reserve stable height and trade density for space in shallow charts', () => {
  const names = labels.map((_, i) => `老年医学科干部保健科综合一病区${i}`)
  const input = { ...option, xAxis: { type: 'category', data: names } }
  const normal = withCategoryViewport(input, 600, 360)
  const shallow = withCategoryViewport(input, 600, 180)
  assert.ok(shallow.dataZoom[0].endValue < normal.dataZoom[0].endValue)
  for (const result of [normal, shallow]) {
    const axis = result.xAxis.axisLabel
    for (const name of names) {
      const formatted = axis.formatter(name)
      assert.equal(formatted.replaceAll('\n', ''), name)
      assert.ok(formatted.split('\n').length * axis.lineHeight <= axis.height)
    }
    assert.equal(axis.interval, 0)
    assert.equal(axis.hideOverlap, false)
  }
  assert.equal(withCategoryViewport(input, 600, 360, 10).xAxis.axisLabel.height, normal.xAxis.axisLabel.height)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { valueAxisScale } from '../src/idmp/charts/valueAxisScale.js'
import { createAnalysisTrendPresentation } from '../src/idmp/features/analysis/trendPresentation.js'

test('长小数最大值使用规整刻度，不改变原始序列和目标线', () => {
  const values = [0.1, 0.1169590643, 0.094]
  const { option } = createAnalysisTrendPresentation({
    analysis: { dataAvailable: true, granularity: 'MONTHLY', trend: values.map(value => ({ value, periodStart: '2026-01-01' })) },
    profile: { unit: '%', markLineValue: 10 }, granularity: 'MONTHLY'
  })
  assert.deepEqual(option.series[0].data, [10, 11.69590643, 9.4])
  assert.equal(option.yAxis.max, 12)
  assert.equal(option.yAxis.interval, 2)
  assert.equal(option.yAxis.axisLabel.formatter(12), '12%')
  assert.equal(option.series[0].markLine.data[0].yAxis, 10)
})

test('极小比例、负数、零值、大数和缺失值都保留可区分的刻度', () => {
  for (const values of [[0.0000234, 0.0000456], [1e-10, 4.7e-10], [-4.98, 3.12], [-5, -2], [0, 0], [null, NaN, Infinity], [1e13, 4.2e13]]) {
    const axis = valueAxisScale(values, '%')
    assert.ok(Number.isFinite(axis.interval) && axis.interval > 0)
    assert.ok(axis.max > axis.min)
    for (const value of values.filter(value => typeof value === 'number' && Number.isFinite(value))) {
      assert.ok(axis.min <= value && value <= axis.max)
    }
    const labels = []
    for (let value = axis.min, i = 0; value <= axis.max && i < 20; value += axis.interval, i++) labels.push(axis.axisLabel.formatter(value))
    assert.equal(new Set(labels).size, labels.length)
    assert.ok(labels.every(label => label.length < 20))
  }
})

test('轴范围覆盖高于数据和低于零的目标，浮点步进没有长尾', () => {
  const axis = valueAxisScale([0.21, 0.3125, -0.3], '元')
  assert.ok(axis.min <= -0.3 && axis.max >= 0.3125)
  assert.equal(axis.axisLabel.formatter(0.1 + 0.2), '0.3元')
  assert.equal(axis.axisLabel.formatter(-0), '0元')
})

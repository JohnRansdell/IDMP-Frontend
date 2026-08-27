import test from 'node:test'
import assert from 'node:assert/strict'
import {
  changeWidgetVisualization,
  getWidgetVisualizationType,
  getWidgetVisualizationTypes,
  normalizeLayout
} from '../src/idmp/features/dashboard/layout.js'
import { createDashboardChartOption } from '../src/idmp/features/dashboard/visualization.js'

test('widget visualization conversion follows the supported matrix', () => {
  const cases = [
    {
      widget: { id: 'primary', type: 'primary', kpiIndex: 0, x: 20, y: 30, w: 500, h: 400 },
      types: ['kpi', 'bar', 'line', 'pie'],
      current: 'kpi'
    },
    {
      widget: { id: 'user', type: 'kpi', sourceCode: 'I-1', x: 20, y: 30, w: 500, h: 400 },
      types: ['kpi', 'bar', 'line', 'pie'],
      current: 'kpi'
    },
    {
      widget: { id: 'trend', type: 'chart', preset: 'trend', chartKind: 'line', x: 20, y: 30, w: 500, h: 400 },
      types: ['line', 'bar'],
      current: 'line'
    },
    {
      widget: { id: 'rate', type: 'chart', preset: 'rate', chartKind: 'pie', x: 20, y: 30, w: 500, h: 400 },
      types: ['pie', 'bar'],
      current: 'pie'
    }
  ]

  cases.forEach(({ widget, types, current }) => {
    assert.deepEqual(getWidgetVisualizationTypes(widget), types)
    assert.equal(getWidgetVisualizationType(widget), current)

    types.forEach((visualType) => {
      const changed = changeWidgetVisualization(widget, visualType)
      assert.equal(getWidgetVisualizationType(changed), visualType)
      assert.equal(changed.type, visualType === 'kpi'
        ? widget.kpiIndex === 0 ? 'primary' : 'kpi'
        : 'chart')
      if (visualType !== 'kpi') assert.equal(changed.chartKind, visualType)
      assert.equal(changed.id, widget.id)
      assert.equal(changed.sourceCode, widget.sourceCode)
      assert.equal(changed.kpiIndex, widget.kpiIndex)
      assert.deepEqual(
        { x: changed.x, y: changed.y, w: changed.w, h: changed.h },
        { x: 20, y: 30, w: 500, h: 400 }
      )
    })
  })

  const fixedTypes = ['supporting', 'warnings', 'ranking']
  fixedTypes.forEach((type) => {
    const fixed = { id: type, type, sourceCode: 'I-fixed', x: 0, y: 0, w: 600, h: 400 }
    assert.deepEqual(getWidgetVisualizationTypes(fixed), [])
    assert.equal(getWidgetVisualizationType(fixed), '')
    assert.strictEqual(changeWidgetVisualization(fixed, 'bar'), fixed)
  })
  assert.strictEqual(changeWidgetVisualization(cases[0].widget, 'scatter'), cases[0].widget)
})

test('visualization conversion expands cards but never shrinks them', () => {
  const primary = {
    id: 'primary',
    type: 'primary',
    kpiIndex: 0,
    x: 24,
    y: 30,
    w: 300,
    h: 246
  }
  const primaryChart = changeWidgetVisualization(primary, 'bar')
  assert.deepEqual(
    { type: primaryChart.type, chartKind: primaryChart.chartKind, w: primaryChart.w, h: primaryChart.h },
    { type: 'chart', chartKind: 'bar', w: 360, h: 336 }
  )
  const restoredPrimary = changeWidgetVisualization(primaryChart, 'kpi')
  assert.deepEqual(
    { type: restoredPrimary.type, kpiIndex: restoredPrimary.kpiIndex, w: restoredPrimary.w, h: restoredPrimary.h },
    { type: 'primary', kpiIndex: 0, w: 360, h: 336 }
  )

  const userKpi = {
    id: 'user',
    type: 'kpi',
    sourceCode: 'I-1',
    x: 0,
    y: 0,
    w: 220,
    h: 158
  }
  const userChart = changeWidgetVisualization(userKpi, 'line')
  const restoredUserKpi = changeWidgetVisualization(userChart, 'kpi')
  assert.deepEqual(
    { type: restoredUserKpi.type, sourceCode: restoredUserKpi.sourceCode, w: restoredUserKpi.w, h: restoredUserKpi.h },
    { type: 'kpi', sourceCode: 'I-1', w: 360, h: 336 }
  )
})

test('layout JSON roundtrip removes legacy data snapshots', () => {
  const legacy = [{
    id: 'legacy',
    type: 'kpi',
    sourceCode: 'I-1',
    visualType: 'kpi',
    x: 1,
    y: 2,
    w: 220,
    h: 158,
    data: { value: 1 },
    sourceSnapshot: { value: 2 }
  }]

  const loaded = normalizeLayout(JSON.parse(JSON.stringify(legacy)))
  assert.deepEqual(loaded, [{
    id: 'legacy',
    type: 'kpi',
    sourceCode: 'I-1',
    visualType: 'kpi',
    x: 1,
    y: 2,
    w: 220,
    h: 158
  }])
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(loaded))), loaded)
})

test('preset bar options reuse data without mutating source options', () => {
  const trendOption = {
    xAxis: { type: 'category', boundaryGap: false, data: ['1月', '2月'] },
    series: [{ name: '指标值', type: 'line', smooth: true, data: [91, 92] }]
  }
  const originalTrend = structuredClone(trendOption)
  const trendBar = createDashboardChartOption(
    { preset: 'trend', chartKind: 'bar' },
    { trendOption }
  )

  assert.deepEqual(trendOption, originalTrend)
  assert.notStrictEqual(trendBar, trendOption)
  assert.equal(trendBar.xAxis.boundaryGap, true)
  assert.deepEqual(
    trendBar.series.map(({ type, data }) => ({ type, data })),
    [{ type: 'bar', data: [91, 92] }]
  )

  const rateOption = {
    color: ['#1261a6'],
    series: [{
      name: '指标值',
      type: 'pie',
      data: [
        { name: '内科', value: 98 },
        { name: '外科', value: 95 }
      ]
    }]
  }
  const originalRate = structuredClone(rateOption)
  const rateBar = createDashboardChartOption(
    { preset: 'rate', chartKind: 'bar' },
    { rateOption }
  )

  assert.deepEqual(rateOption, originalRate)
  assert.notStrictEqual(rateBar, rateOption)
  assert.deepEqual(rateBar.xAxis, {
    type: 'category',
    data: ['内科', '外科']
  })
  assert.deepEqual(rateBar.series, [{
    name: '指标值',
    type: 'bar',
    barWidth: 22,
    data: [98, 95]
  }])

  const missingSource = createDashboardChartOption(
    { type: 'chart', chartKind: 'line', sourceCode: 'missing' },
    { getSource: () => undefined }
  )
  assert.deepEqual(missingSource.xAxis.data, [])
  assert.deepEqual(missingSource.series[0].data, [])
})

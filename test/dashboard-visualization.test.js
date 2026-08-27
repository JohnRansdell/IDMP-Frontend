import test from 'node:test'
import assert from 'node:assert/strict'
import {
  changeWidgetVisualization,
  getWidgetVisualizationType,
  getWidgetVisualizationTypes,
  normalizeLayout
} from '../src/idmp/features/dashboard/layout.js'
import {
  buildDashboardDrillRouteQuery,
  createDashboardChartOption,
  normalizeDashboardDrillTarget,
  resolveDashboardChartDrillTarget
} from '../src/idmp/features/dashboard/visualization.js'

const createDrillTarget = (overrides = {}) => ({
  resultId: 9001,
  indicatorId: 1001,
  indicatorCode: 'IND-001',
  indicatorName: '住院死亡率',
  indicatorVersionId: 2001,
  currentLevel: 'MEDICAL_GROUP',
  parentKeys: {
    HOSPITAL_CODE: 1,
    OUT_DEPT_CODE: 20
  },
  snapshotId: 3001,
  period: '2026-06',
  ...overrides
})

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

test('dashboard drill targets use a strict stringified business whitelist', () => {
  const input = createDrillTarget({
    currentLevel: 'medical_group',
    parentKeys: {
      HOSPITAL_CODE: 1,
      OUT_DEPT_CODE: 20,
      MEDICAL_GROUP_CODE: 300,
      PHYSICAL_COLUMN: 'secret'
    },
    ignored: 'value'
  })
  const original = structuredClone(input)
  const target = normalizeDashboardDrillTarget(input, 'mock')

  assert.deepEqual(input, original)
  assert.deepEqual(target, {
    resultId: '9001',
    indicatorId: '1001',
    indicatorCode: 'IND-001',
    indicatorName: '住院死亡率',
    indicatorVersionId: '2001',
    currentLevel: 'MEDICAL_GROUP',
    parentKeys: {
      HOSPITAL_CODE: '1',
      OUT_DEPT_CODE: '20',
      MEDICAL_GROUP_CODE: '300'
    },
    snapshotId: '3001',
    period: '2026-06',
    source: 'mock'
  })
  assert.equal(normalizeDashboardDrillTarget(input).source, undefined)

  const invalidTargets = [
    null,
    createDrillTarget({ resultId: '' }),
    createDrillTarget({ indicatorVersionId: null }),
    createDrillTarget({ currentLevel: 'PATIENT' }),
    createDrillTarget({ parentKeys: { HOSPITAL_CODE: 'H001' } }),
    createDrillTarget({ parentKeys: [] })
  ]
  invalidTargets.forEach((invalid) => assert.equal(normalizeDashboardDrillTarget(invalid), null))
})

test('chart drill resolution only trusts params.data.drillTarget and builds a flat route query', () => {
  const target = resolveDashboardChartDrillTarget({
    name: '不可作为下钻依据',
    data: {
      name: '心外科',
      value: 98,
      drillTarget: createDrillTarget()
    }
  }, 'mock')

  assert.deepEqual(buildDashboardDrillRouteQuery(target), {
    resultId: '9001',
    indicator: 'IND-001',
    indicatorId: '1001',
    indicatorName: '住院死亡率',
    indicatorVersionId: '2001',
    currentLevel: 'MEDICAL_GROUP',
    HOSPITAL_CODE: '1',
    OUT_DEPT_CODE: '20',
    snapshotId: '3001',
    period: '2026-06',
    source: 'mock',
    from: 'dashboard'
  })
  assert.equal(resolveDashboardChartDrillTarget({ name: '心外科' }, 'mock'), null)
  assert.equal(resolveDashboardChartDrillTarget({ data: { name: '心外科', value: 98 } }), null)
  assert.equal(buildDashboardDrillRouteQuery(null), null)
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
        { name: '内科', value: 98, drillTarget: createDrillTarget() },
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
    data: [
      { name: '内科', value: 98, drillTarget: createDrillTarget() },
      { name: '外科', value: 95 }
    ]
  }])
  const ratePie = createDashboardChartOption(
    { preset: 'rate', chartKind: 'pie' },
    { rateOption }
  )
  assert.deepEqual(
    resolveDashboardChartDrillTarget({ data: ratePie.series[0].data[0] }),
    resolveDashboardChartDrillTarget({ data: rateBar.series[0].data[0] })
  )

  const source = {
    name: '住院死亡率',
    departmentData: [{ name: '内科', value: 98, drillTarget: createDrillTarget() }]
  }
  const originalSource = structuredClone(source)
  const genericBar = createDashboardChartOption(
    { chartKind: 'bar', sourceCode: 'IND-001' },
    { getSource: () => source }
  )
  assert.deepEqual(source, originalSource)
  assert.deepEqual(genericBar.series[0].data, source.departmentData)
  assert.notStrictEqual(genericBar.series[0].data[0], source.departmentData[0])

  const missingSource = createDashboardChartOption(
    { type: 'chart', chartKind: 'line', sourceCode: 'missing' },
    { getSource: () => undefined }
  )
  assert.deepEqual(missingSource.xAxis.data, [])
  assert.deepEqual(missingSource.series[0].data, [])
})

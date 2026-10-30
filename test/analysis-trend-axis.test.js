import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnalysisTrendPresentation } from '../src/idmp/features/analysis/trendPresentation.js'
import { analysisChartExportOption } from '../src/idmp/features/analysis/pdfReport.js'

test('trend axes measure full tick labels for all units without changing result values', () => {
  for (const [unit, values] of [
    ['元', [123456789.12, 987654321.09]],
    ['人次', [-123456789, 234567890]],
    ['%', [0.0000234, 0.0000456]],
    ['', [0, 0]],
    ['毫克/千克/分钟', [123456.78]]
  ]) {
    const { option, rows } = createAnalysisTrendPresentation({
      analysis: { dataAvailable: true, granularity: 'MONTHLY',
        trend: values.map((value, index) => ({ value, periodStart: `2026-0${index + 1}-01` })) },
      profile: { unit }, granularity: 'MONTHLY'
    })
    assert.equal(option.grid.containLabel, true)
    assert.equal(option.yAxis.axisLabel.formatter(0), `0${unit}`)
    assert.equal(option.yAxis.nameTextStyle.align, 'left')
    assert.deepEqual(option.series[0].data, rows.map(row => row.actual))
    const exported = analysisChartExportOption(option)
    assert.deepEqual(exported.grid, option.grid)
    assert.deepEqual(exported.yAxis, option.yAxis)
  }
})

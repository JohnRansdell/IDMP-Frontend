import * as echarts from 'echarts'
import { IDMP_CHART_THEME, normalizeChartOption } from '../../charts/theme.js'

const text = value => value === undefined || value === null || value === '' ? '-' : String(value)

export function buildAnalysisPdfReport({ versionId, metadata = [], primaryMetric, summaryMetrics = [], trendRows = [], hasPeerTrend = false,
  unit = '', trendDescription = '', chartPng, rankRows = [], scenarioRows = [], scenarioDescription = '', provenance = [], drillSection }) {
  const sections = [
    { title: '指标概览', columns: ['项目', '结果', '说明'], rows: [
      [text(primaryMetric?.label), text(primaryMetric?.value), text(primaryMetric?.statusLabel)],
      ...summaryMetrics.map(item => [text(item.label), text(item.value), text(item.description)])
    ] },
    { title: '趋势分析', description: trendDescription, columns: ['周期', '本院实际值', ...(hasPeerTrend ? ['同级医院均值'] : [])],
      rows: trendRows.map(row => [text(row.label), metric(row.actual, unit), ...(hasPeerTrend ? [metric(row.peer, unit)] : [])]),
      ...(chartPng ? { chartPng } : {}) },
    { title: '科室指标排名', columns: ['排名', '科室', '指标值', '分子', '分母', '状态'],
      rows: rankRows.map(row => [row.rank, row.department, row.rate, row.numerator, row.denominator, row.status].map(text)) },
    { title: '不同场景对比', description: scenarioDescription,
      columns: ['场景', '周期', '指标值', '分子', '分母', '状态', '结果 ID', '快照 ID'], rows: scenarioRows.map(row => row.map(text)) },
    { title: '计算口径与结果追溯', columns: ['项目', '内容'], rows: provenance.map(row => row.map(text)) }
  ]
  if (drillSection) {
    if (drillSection.columns.length <= 8) sections.push(drillSection)
    else {
      // Repeat the row key so wide drill tables remain traceable across column groups.
      for (let start = 1; start < drillSection.columns.length; start += 7) {
        const end = Math.min(start + 7, drillSection.columns.length)
        sections.push({ ...drillSection, title: `${drillSection.title}（字段组 ${Math.ceil(start / 7)}）`,
          columns: [drillSection.columns[0], ...drillSection.columns.slice(start, end)],
          rows: drillSection.rows.map(row => [row[0], ...row.slice(start, end)]) })
      }
    }
  }
  const rows = sections.reduce((sum, section) => sum + section.rows.length, 0)
  if (rows > 3000) throw new Error('导出数据超过 3000 行，请缩小分析时间范围后重试。')
  if (sections.length > 12 || sections.some(section => section.columns.length > 8 || section.rows.some(row => row.length !== section.columns.length))) {
    throw new Error('导出表格格式不完整，请重新加载分析页面。')
  }
  return structuredClone({ indicatorVersionId: String(versionId), metadata: metadata.map(([label, value]) => ({ label, value: text(value) })), sections })
}

const metric = (value, unit) => value === undefined || value === null || value === '-' ? '-' : `${text(value)}${unit}`

export function renderAnalysisChartPng(option) {
  const element = document.createElement('div')
  Object.assign(element.style, { position: 'fixed', left: '-10000px', width: '1000px', height: '360px' })
  document.body.appendChild(element)
  let chart
  try {
    chart = echarts.init(element, IDMP_CHART_THEME, { renderer: 'canvas', width: 1000, height: 360, devicePixelRatio: 1 })
    chart.setOption(normalizeChartOption({ ...option, animation: false, backgroundColor: '#ffffff' }), { notMerge: true })
    return chart.getDataURL({ type: 'png', pixelRatio: 1.5, backgroundColor: '#ffffff', excludeComponents: ['toolbox'] })
  } finally { chart?.dispose(); element.remove() }
}

export function analysisPdfFilename(name, versionId) {
  const safe = String(name || '指标分析').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100)
  return `${safe}-分析报告-${versionId}.pdf`
}

export function downloadAnalysisPdf(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try { anchor.click() } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000) }
}

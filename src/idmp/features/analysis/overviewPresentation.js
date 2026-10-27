import { getStatusLabel } from '../../design/status.js'
import { formatResultNumber, formatResultValue, hasResultDisplay, resultChartNumber, resultNumber, resultUnit } from '../shared/resultPresentation.js'
import { operandValue, resultOperandColumns } from '../shared/formulaPresentation.js'
import { resultAvailabilityGuidance } from './resultAvailability.js'

export function resolveAnalysisPerformanceTarget(versionId, ...analyses) {
  const response = analyses.find(analysis => analysis?.indicatorVersionId != null
    && String(analysis.indicatorVersionId) === String(versionId)
    && Object.hasOwn(analysis, 'performanceTarget'))
  const target = response?.performanceTarget
  return target && String(target.indicatorVersionId) === String(versionId) ? target : null
}

export function createAnalysisProfile(indicator, performanceTarget, display) {
  const name = indicator?.name || '未命名指标'
  const unit = display?.format === 'PERCENT' ? '%' : resultUnit(indicator?.unit || indicator?.displayUnit || '')
  const targetValue = resultNumber(performanceTarget?.targetValue) !== null
    && String(performanceTarget.targetValue).trim() !== ''
    ? resultChartNumber(performanceTarget.targetValue, { unit, display }) : null
  return {
    code: String(indicator?.id || indicator?.indicatorId || indicator?.code || indicator?.name || ''),
    name,
    unit,
    targetLabel: targetValue === null ? '目标值未配置'
      : `目标值：${hasResultDisplay(performanceTarget.targetDisplayValue)
        ? performanceTarget.targetDisplayValue : formatResultValue(performanceTarget.targetValue, { unit, display })}`,
    markLineValue: targetValue,
    yAxisMax: null
  }
}

const formatCount = value => formatResultNumber(value, { maximumFractionDigits: 3 })
const displayStatus = value => value ? getStatusLabel(value) : '-'

// This model is shared by the overview component and the PDF export.
export function createOverviewPresentation({ report, formal, selected, unit, display, formula }) {
  const hasData = Boolean(formal.analysis?.dataAvailable && formal.overview)
  const hasResponse = Boolean((formal.analysis || report.result) && selected)
  const operandMetrics = result => resultOperandColumns([result], formula).map(operand => ({
    label: operand.label, value: formatCount(operandValue(result, operand))
  }))
  function primaryMetric() {
    if (report.dirty) return { label: `${report.periodLabel}指标值`, value: '-', tone: 'neutral', status: 'PENDING_QUERY', statusLabel: '待查询', periodLabel: report.periodLabel }
    if (report.loading || report.error) return {
      label: `${report.periodLabel}指标值`, value: '-', tone: 'neutral',
      status: report.loading ? 'LOADING' : 'UNKNOWN', statusLabel: report.loading ? '查询中' : '查询失败',
      periodLabel: report.periodLabel
    }
    if (report.result) {
      const result = report.result
      const ready = result.status === 'READY'
      return {
        label: `${report.resultPeriodLabel}指标值`,
        value: ready ? (hasResultDisplay(result.displayValue) ? result.displayValue : formatResultValue(result.value, { unit, display })) : '-',
        tone: ready && result.qualityStatus === 'PASSED' ? 'success' : 'neutral',
        status: ready ? 'ACTIVE' : result.status,
        statusLabel: ready ? report.modeLabel : resultAvailabilityGuidance(result.status).title,
        periodLabel: report.resultPeriodLabel
      }
    }
    const overview = formal.overview
    if (hasData) {
      return {
        label: `${formal.periodLabel || '当前报告期'}指标值`,
        value: hasResultDisplay(overview.displayValue) ? overview.displayValue : formatResultValue(overview.value, { unit, display }),
        tone: overview.qualityStatus === 'PASSED' ? 'success' : 'warning',
        status: overview.outcomeStatus || 'ACTIVE',
        statusLabel: '已发布结果',
        periodLabel: formal.periodLabel || '结果周期未返回'
      }
    }
    if (hasResponse) return { label: `${report.periodLabel || '当前报告期'}指标值`, value: '-', tone: 'neutral', status: formal.availability?.status || 'UNKNOWN', statusLabel: resultAvailabilityGuidance(formal.availability?.status).title, periodLabel: report.periodLabel || '请先选择报告期' }
    return { label: '当前指标值', value: '-', tone: 'neutral', status: 'NO_DATA', statusLabel: '暂无正式结果', periodLabel: '尚未读取到已激活结果' }
  }
  function summaryMetrics() {
    if (report.dirty) return [{ label: '查询状态', value: '待查询' }]
    if (report.loading || report.error) return [{ label: '查询状态', value: report.loading ? '查询中' : '查询失败', description: report.error }]
    if (selected) {
      if (report.result) {
        const result = report.result
        if (result.status !== 'READY') return [
          { label: report.modeLabel, value: '不可用', description: result.message || '未返回可用结果' }
        ]
        return [
          ...operandMetrics(result),
          { label: '质量状态', value: displayStatus(result.qualityStatus), tone: result.qualityStatus === 'PASSED' ? 'success' : 'warning' },
          { label: '结果来源', value: result.executionMode === 'AD_HOC_SOURCE' ? '源数据即时计算' : '正式结果复用' }
        ]
      }
      const metrics = []
      if (!formal.analysis) {
        return [
          { label: '分析状态', value: formal.loading || report.loading ? '正在读取' : '暂无正式结果', description: formal.error || '暂无可展示的指标结果' },
          { label: '维度分析', value: '-', description: '暂无维度结果' }
        ]
      }
      metrics.push(...operandMetrics(formal.overview))
      const dimensionCount = formal.dimensionCount
      const configured = formal.hasDrill
      metrics.push(dimensionCount == null
        ? { label: '维度分析', value: configured ? '已配置' : '未配置' }
        : dimensionCount
        ? { label: '维度结果', value: `${dimensionCount} 个`, description: '本报告期已生成的维度成员数' }
        : { label: '维度分析', value: configured ? '本期暂无结果' : '未配置', description: configured ? '该报告期未生成维度结果' : '该指标未配置维度分析' })
      if (hasData) {
        metrics.push(
          { label: '质量状态', value: displayStatus(formal.overview?.qualityStatus), tone: formal.overview?.qualityStatus === 'PASSED' ? 'success' : 'warning' },
          { label: '结果口径', value: formal.overview?.dimensions && Object.keys(formal.overview.dimensions).length ? '指定维度' : '全院汇总' }
        )
      } else {
        metrics.push(
          { label: '分析状态', value: displayStatus(formal.availability?.status) },
          { label: '结果说明', value: formal.availability?.message || '请打开数据说明查看原因' }
        )
      }
      return metrics
    }
    return []
  }
  return { primary: primaryMetric(), summaries: summaryMetrics() }
}

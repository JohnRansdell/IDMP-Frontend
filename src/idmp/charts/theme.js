export const IDMP_CHART_COLORS = [
  '#1261a6',
  '#007c83',
  '#6f5aa8',
  '#b75d00',
  '#4f6b7a',
  '#2d7d9a'
]

export const IDMP_CHART_THEME = {
  color: IDMP_CHART_COLORS,
  backgroundColor: 'transparent',
  textStyle: {
    color: '#52606d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 12
  },
  title: {
    textStyle: {
      color: '#17212b',
      fontSize: 14,
      fontWeight: 600
    },
    subtextStyle: {
      color: '#6b7785',
      fontSize: 12
    }
  },
  legend: {
    textStyle: {
      color: '#52606d'
    }
  },
  tooltip: {
    backgroundColor: '#17212b',
    borderWidth: 0,
    textStyle: {
      color: '#ffffff',
      fontSize: 12
    },
    extraCssText: 'box-shadow: 0 4px 12px rgba(23, 33, 43, 0.18); border-radius: 3px;'
  },
  categoryAxis: {
    axisLine: {
      lineStyle: { color: '#aeb8c2' }
    },
    axisTick: {
      lineStyle: { color: '#aeb8c2' }
    },
    axisLabel: {
      color: '#52606d'
    },
    splitLine: {
      lineStyle: { color: '#e3e9ee' }
    }
  },
  valueAxis: {
    axisLine: {
      show: false
    },
    axisTick: {
      show: false
    },
    axisLabel: {
      color: '#52606d'
    },
    splitLine: {
      lineStyle: { color: '#e3e9ee', type: 'dashed' }
    }
  }
}

export const normalizeChartOption = (option = {}) => ({
  animationDuration: 180,
  animationDurationUpdate: 120,
  animationEasing: 'cubicOut',
  aria: {
    enabled: true,
    decal: { show: false }
  },
  ...option
})


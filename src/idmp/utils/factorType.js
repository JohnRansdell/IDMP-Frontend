export function getFactorTypeLabel(kind) {
  return {
    SOURCE: '原子因子',
    DERIVED: '复合因子',
    原子因子: '原子因子',
    源表因子: '原子因子',
    复合因子: '复合因子',
    组合因子: '复合因子'
  }[kind] || '-'
}

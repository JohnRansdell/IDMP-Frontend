import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorVersionPayload,
  combineFormulaNodes,
  drillLevelLabel,
  drillPathLabel,
  findUnsupportedDrillFactors,
  formatIndicatorTrialPeriod,
  normalizeDrillCapabilities,
  normalizeDrillConfig,
  normalizeDrillPaths,
  normalizeIndicatorTrialResults,
  normalizeIndicatorAnalysisParams,
  selectDefaultIndicatorTrialTarget,
  selectIndicatorSummaryRecord,
  validateDrillSelection
} from '../src/idmp/api/adapters/indicator.js'

test('indicator trial adapter keeps every returned time target and defaults to month', () => {
  const payload = {
    batchId: '102027642460316627',
    batchStatus: 'SUCCEEDED',
    qualityStatus: 'PASSED',
    results: {
      records: [{ resultId: 'duplicated-year', dimensions: { time_year: 2025 }, displayValue: '5.43%' }]
    },
    targets: [
      {
        targetId: '102027642460316628',
        targetCode: 'DRILL:TIME:YEAR',
        drillPathCode: 'TIME',
        drillLevelCode: 'YEAR',
        grain: ['TIME_YEAR'],
        targetStatus: 'READY',
        results: { records: [{ resultId: '102027642460316687', dimensions: { time_year: 2025 }, resultValue: 0.05430839, displayValue: '5.43%' }], total: '1', pageNum: 1, pageSize: 100, pages: 1 }
      },
      {
        targetId: '102027642460316638',
        targetCode: 'DRILL:TIME:QUARTER',
        drillPathCode: 'TIME',
        drillLevelCode: 'QUARTER',
        grain: ['TIME_YEAR', 'TIME_QUARTER'],
        results: { records: [{ dimensions: { time_year: 2025, time_quarter: 4 }, displayValue: '5.43%' }], total: '1' }
      },
      {
        targetId: '102027642460316648',
        targetCode: 'DRILL:TIME:MONTH',
        drillPathCode: 'TIME',
        drillLevelCode: 'MONTH',
        grain: ['TIME_YEAR', 'TIME_QUARTER', 'TIME_MONTH'],
        results: { records: [
          { resultId: '102027642460316700', dimensions: { time_year: 2025, time_quarter: 4, time_month: 12 }, numeratorValue: null, denominatorValue: null, resultValue: 0.05430839, displayValue: '5.43%' },
          { resultId: '102027642460316701', dimensions: { time_year: 2026, time_quarter: 1, time_month: 1 }, resultValue: 0.0584114, displayValue: '5.84%' }
        ], total: '2', pageNum: 1, pageSize: 100, pages: 1 }
      }
    ]
  }

  const normalized = normalizeIndicatorTrialResults(payload)
  assert.equal(normalized.targets.length, 3)
  assert.deepEqual(normalized.targets.map((target) => target.levelCode), ['YEAR', 'QUARTER', 'MONTH'])
  assert.equal(normalized.targets.flatMap((target) => target.records).some((record) => record.resultId === 'duplicated-year'), false)
  const month = selectDefaultIndicatorTrialTarget(normalized.targets)
  assert.equal(month.levelCode, 'MONTH')
  assert.deepEqual(month.records.map((record) => formatIndicatorTrialPeriod(record, month)), ['2025-12', '2026-01'])
  assert.equal(month.records[0].numeratorValue, null)
  assert.equal(month.records[0].denominatorValue, null)
  assert.equal(month.records[0].resultId, '102027642460316700')
  assert.equal(month.total, 2)
})

test('indicator trial adapter retains the legacy top-level result shape', () => {
  const normalized = normalizeIndicatorTrialResults({
    targetId: 99,
    batchStatus: 'SUCCEEDED',
    results: { records: [{ resultId: 101, dimensions: {}, displayValue: '0.00%', resultValue: 0 }], total: '1' }
  })
  assert.equal(normalized.targets.length, 1)
  assert.equal(normalized.targets[0].targetCode, 'LEGACY')
  assert.equal(normalized.targets[0].records[0].resultId, '101')
  assert.equal(normalized.targets[0].records[0].resultValue, 0)
})

test('formula node combination preserves a single factor reference', () => {
  const factorRef = {
    nodeId: 'factor_left_0_102027642460282572',
    nodeType: 'FACTOR_REF',
    factorVersionId: '102027642460282572'
  }

  assert.deepEqual(combineFormulaNodes([factorRef], 'ADD', 'left'), factorRef)
})

test('formula node combination keeps every factor reference when summing multiple factors', () => {
  const first = { nodeId: 'first', nodeType: 'FACTOR_REF', factorVersionId: '101' }
  const second = { nodeId: 'second', nodeType: 'FACTOR_REF', factorVersionId: '102' }

  assert.deepEqual(combineFormulaNodes([first, second], 'ADD', 'left'), {
    nodeId: 'left_add_1',
    nodeType: 'BINARY',
    operator: 'ADD',
    left: first,
    right: second
  })
})

test('indicator trial summary selects the root grain instead of the first department row', () => {
  const root = { levelCode: 'HOSPITAL', dimensions: { hospital_code: 'H001' }, resultValue: 0.4192, displayValue: '41.92%' }
  const payload = { results: { records: [
    { levelCode: 'OUT_DEPT', dimensions: { hospital_code: 'H001', out_dept_code: 'D001' }, resultValue: 0, displayValue: '0.00%' },
    root
  ] } }

  assert.equal(selectIndicatorSummaryRecord(payload), root)
  const globalRoot = { dimensions: {}, resultValue: 0.5, displayValue: '50.00%' }
  assert.equal(selectIndicatorSummaryRecord({ results: { records: [payload.results.records[0], globalRoot] } }), globalRoot)
})

test('下钻路径与层级显示中文且未知码原样返回', () => {
  assert.equal(drillPathLabel('ORGANIZATION'), '组织维度')
  assert.equal(drillLevelLabel('OUT_DEPT'), '科室')
  assert.equal(drillLevelLabel('CUSTOM_LEVEL'), 'CUSTOM_LEVEL')
})

test('indicator analysis query normalizes runtime datetimes to API date values', () => {
  assert.deepEqual(normalizeIndicatorAnalysisParams({
    indicatorVersionId: '102027642460296816',
    periodStart: '2026-04-01T00:00:00',
    periodEnd: '2026-05-01T00:00:00',
    granularity: 'MONTHLY'
  }), {
    indicatorVersionId: '102027642460296816',
    periodStart: '2026-04-01',
    periodEnd: '2026-05-01',
    granularity: 'MONTHLY'
  })
})

test('indicator version payload always includes the selected drill path', () => {
  const payload = buildIndicatorVersionPayload({
    copyFromVersionId: 901,
    drillConfig: {
      pathCode: 'ORGANIZATION',
      maxLevel: 'OUT_DEPT'
    }
  })

  assert.deepEqual(payload, {
    copyFromVersionId: '901',
    drillPaths: [{ pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' }]
  })
})

test('indicator version payload supports multiple selected drill paths', () => {
  const payload = buildIndicatorVersionPayload({
    drillPaths: [
      { pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' },
      { pathCode: 'TIME', maxLevel: 'MONTH' }
    ]
  })

  assert.deepEqual(payload.drillPaths, [
    { pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' },
    { pathCode: 'TIME', maxLevel: 'MONTH' }
  ])
  assert.throws(() => buildIndicatorVersionPayload({
    drillPaths: [
      { pathCode: 'TIME', maxLevel: 'MONTH' },
      { pathCode: 'TIME', maxLevel: 'DAY' }
    ]
  }), /只能选择一次/)
})

test('drill capability adapter preserves bigint ids and validates selected levels', () => {
  const capabilities = normalizeDrillCapabilities({
    factorVersionIds: ['102027642460282572', '102027642460282586'],
    dimensions: [{
      pathCode: 'ORGANIZATION',
      supported: true,
      maxLevel: 'OUT_DEPT',
      levels: [{ code: 'HOSPITAL', name: '全院' }, { code: 'OUT_DEPT', name: '出院科室' }],
      limitingFactors: [{ factorVersionId: '102027642460282572', maxLevel: 'OUT_DEPT', reason: '缺少主治医师字段' }]
    }, {
      pathCode: 'TIME',
      supported: false,
      maxLevel: '',
      levels: [],
      limitingFactors: []
    }]
  })

  assert.equal(capabilities.factorVersionIds[0], '102027642460282572')
  assert.equal(capabilities.dimensions[0].limitingFactors[0].factorVersionId, '102027642460282572')
  assert.equal(validateDrillSelection(capabilities, [{ pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' }]), '')
  assert.match(validateDrillSelection(capabilities, [{ pathCode: 'ORGANIZATION', maxLevel: 'ATTENDING_DOCTOR' }]), /不支持层级/)
  assert.match(validateDrillSelection(capabilities, [{ pathCode: 'TIME', maxLevel: 'MONTH' }]), /不支持下钻/)
  assert.deepEqual(normalizeDrillPaths({ drillConfig: { drillPaths: [{ pathCode: 'TIME', maxLevel: 'MONTH' }, { pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' }] } }), [
    { pathCode: 'TIME', maxLevel: 'MONTH', pathVersionId: '' },
    { pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT', pathVersionId: '' }
  ])
})

test('organization drill validation reports factor grain gaps before version creation', () => {
  const unsupported = findUnsupportedDrillFactors([
    { name: '总体因子', dsl: { output: { grain: [] } } },
    { name: '科室因子', dsl: { output: { grain: ['HOSPITAL_CODE', 'OUT_DEPT_CODE'] } } }
  ], { pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' })

  assert.equal(unsupported.length, 1)
  assert.equal(unsupported[0].factor.name, '总体因子')
  assert.deepEqual(unsupported[0].missing, ['HOSPITAL_CODE', 'OUT_DEPT_CODE'])
  assert.deepEqual(findUnsupportedDrillFactors([
    { dsl: { output: { grain: [] } } }
  ], { pathCode: 'TIME', maxLevel: 'MONTH' }), [])
})

test('indicator version payload rejects an incomplete drill configuration', () => {
  assert.throws(
    () => buildIndicatorVersionPayload({ drillConfig: { pathCode: '', maxLevel: '' } }),
    /必须选择下钻路径/
  )
})

test('indicator version adapter restores drill config from backend response', () => {
  const config = normalizeDrillConfig({
    drillConfig: {
      pathVersionId: 7001,
      paths: [{ pathCode: 'ORGANIZATION', maxLevel: 'OUT_DEPT' }]
    }
  })

  assert.deepEqual(config, {
    pathCode: 'ORGANIZATION',
    maxLevel: 'OUT_DEPT',
    pathVersionId: '7001'
  })
})

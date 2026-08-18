import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorVersionPayload,
  findUnsupportedDrillFactors,
  normalizeDrillCapabilities,
  normalizeDrillConfig,
  normalizeDrillPaths,
  normalizeIndicatorAnalysisParams,
  validateDrillSelection
} from '../src/idmp/api/adapters/indicator.js'

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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorVersionPayload,
  findUnsupportedDrillFactors,
  normalizeDrillConfig
} from '../src/idmp/api/adapters/indicator.js'

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

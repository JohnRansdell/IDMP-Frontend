import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIndicatorVersionPayload,
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

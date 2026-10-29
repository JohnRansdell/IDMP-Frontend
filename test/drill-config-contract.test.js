import test from 'node:test'
import assert from 'node:assert/strict'
import * as adapter from '../src/idmp/api/adapters/indicator.js'

const organization = { pathCode: 'ORGANIZATION', maxLevel: 'DEPARTMENT', pathVersionId: '9223372036854775807' }
const custom = { pathCode: 'CUSTOM_LOCATION', pathName: '诊疗位置', maxLevel: 'WARD', levels: [
  { levelCode: 'ROOT', levelName: '全院' },
  { levelCode: 'WARD', levelName: '病区', dimensionFieldCode: '病区' }
] }

test('组织与自定义路径按正式响应读取后可完整保存', () => {
  const response = { drillConfig: { drillPaths: [organization, custom] } }
  const paths = adapter.normalizeDrillPaths(response)
  assert.equal(paths.length, 2)
  assert.deepEqual(adapter.buildIndicatorVersionPayload({ drillPaths: paths }).drillPaths,
    [organization, custom])
  assert.equal(paths[0].pathVersionId, organization.pathVersionId)
  assert.deepEqual(paths[1].levels, custom.levels)
})

test('旧单路径函数和默认配置不再导出', () => {
  assert.equal('normalizeDrillConfig' in adapter, false)
  assert.equal('defaultDrillConfig' in adapter, false)
})

test('不再从旧单对象或别名推导版本下钻路径', () => {
  for (const payload of [
    { drillConfig: organization },
    { drillConfig: { paths: [organization] } },
    { drillPaths: [organization] }
  ]) assert.deepEqual(adapter.normalizeDrillPaths(payload), [])
  assert.deepEqual(adapter.buildIndicatorVersionPayload({ drillConfig: organization }), { drillPaths: [] })
})

test('正式路径为空时保持为空且不回退旧配置', () => {
  assert.deepEqual(adapter.normalizeDrillPaths({}), [])
  assert.deepEqual(adapter.buildIndicatorVersionPayload(), { drillPaths: [] })
  assert.deepEqual(adapter.normalizeDrillPaths({ drillPaths: [organization],
    drillConfig: { drillPaths: [], paths: [organization] } }), [])
  assert.deepEqual(adapter.buildIndicatorVersionPayload({ drillPaths: [], drillConfig: organization }), { drillPaths: [] })
})

test('非列表正式路径必须报格式错误而非转成单路径或空列表', () => {
  for (const paths of [organization, 'ORGANIZATION', 1]) {
    assert.throws(() => adapter.normalizeDrillPaths({ drillConfig: { drillPaths: paths } }), /下钻路径必须是列表/)
    assert.throws(() => adapter.buildIndicatorVersionPayload({ drillPaths: paths }), /下钻路径必须是列表/)
  }
})

test('能力接口仍保留默认组织路径的独立契约', () => {
  const capabilities = adapter.normalizeDrillCapabilities({ defaultOrganizationPath: organization })
  assert.deepEqual(capabilities.defaultOrganizationPath, organization)
  assert.equal(adapter.normalizeDrillCapabilities({}).defaultOrganizationPath, null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOrganizationPath, organizationLevelName } from '../src/idmp/utils/organizationDrill.js'
import { normalizeDrillPaths } from '../src/idmp/api/adapters/indicator.js'
import { setOrganizationEnabled, setOrganizationDepth } from '../src/idmp/features/indicator/organizationDrill.js'
import { chartDrillLevelName, resolveChartDrillPath } from '../src/idmp/features/dashboard/backendChartDrill.js'

const legacy = { pathCode: 'ORGANIZATION', pathVersionId: '123', maxLevel: 'ATTENDING_DOCTOR', levels: [
  { levelCode: 'HOSPITAL', levelName: '旧医院', memberKeyFieldCode: 'HOSPITAL_CODE' },
  { levelCode: 'OUT_DEPT', levelName: '出院科室', memberKeyFieldCode: 'OUT_DEPT_CODE', dimensionFieldCode: 'OUT_DEPT_CODE', displayFieldCode: 'OUT_DEPT_NAME' },
  { levelCode: 'ATTENDING_DOCTOR', levelName: '主治医师', memberKeyFieldCode: 'ATTENDING_DOCTOR', dimensionFieldCode: 'ATTENDING_DOCTOR' }
] }

test('旧组织路径统一名称但保留结果定位、层级编码与字段绑定', () => {
  const paths = normalizeDrillPaths({ drillConfig: { drillPaths: [legacy] } })
  assert.deepEqual(paths[0].levels.map(l => l.levelName), ['医院', '科室', '医生'])
  assert.equal(paths[0].pathVersionId, '123')
  assert.equal(paths[0].levels[1].levelCode, 'OUT_DEPT')
  assert.equal(paths[0].levels[1].memberKeyFieldCode, 'OUT_DEPT_CODE')
  assert.equal(paths[0].levels[1].displayFieldCode, 'OUT_DEPT_NAME')
  assert.equal(legacy.levels[1].levelName, '出院科室')
})

test('新建与启用已有组织路径使用相同中文角色', () => {
  const path = setOrganizationDepth(setOrganizationEnabled([], true), 'ATTENDING_DOCTOR')[0]
  assert.deepEqual(path.levels.map(l => l.levelName), ['医院', '科室', '医生'])
  assert.equal(setOrganizationEnabled([legacy], true)[0].levels[1].levelName, '科室')
})

test('看板和分析共用组织角色名称，不覆盖自定义路径', () => {
  const path = resolveChartDrillPath([legacy], 'OUT_DEPT_CODE')
  assert.equal(chartDrillLevelName('OUT_DEPT', path), '科室')
  assert.equal(chartDrillLevelName('ATTENDING_DOCTOR', path), '医生')
  assert.equal(organizationLevelName('ORGANIZATION', 'IN_DEPT', '入院科室'), '科室')
  const custom = { ...legacy, pathCode: 'CUSTOM_LOCATION' }
  assert.equal(normalizeOrganizationPath(custom), custom)
  assert.equal(chartDrillLevelName('OUT_DEPT', custom), '出院科室')
})

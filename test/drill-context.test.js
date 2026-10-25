import assert from 'node:assert/strict'
import test from 'node:test'
import { assertDrillResponseContext, buildDrillRequest, drillMemberField, drillScope, nextDrillNavigation } from '../src/idmp/features/analysis/drillContext.js'
import { canonicalDrillRootResultId } from '../src/idmp/api/adapters/drill.js'
import { projectedDrillNavigation } from '../src/idmp/features/dashboard/backendChartDrill.js'

const path = { pathCode: 'ORGANIZATION', levels: [
  { levelCode: 'HOSPITAL', memberKeyFieldCode: 'HOSPITAL_CODE' },
  { levelCode: 'OUT_DEPT', dimensionFieldCode: '出院科室', memberKeyFieldCode: '科室编码', displayFieldCode: '科室名称' },
  { levelCode: 'DOCTOR', memberKeySemanticFieldCode: '医生工号', displaySemanticFieldCode: '医生姓名' }
] }
const period = { periodStart: '2026-02-01', periodEnd: '2026-05-01' }

test('the configured identity takes precedence over logical dimensions and historical aliases', () => {
  assert.equal(drillMemberField(path, 'OUT_DEPT'), '科室编码')
  assert.equal(drillMemberField(path, 'DOCTOR'), '医生工号')
  assert.equal(drillMemberField(undefined, 'OUT_DEPT'), 'OUT_DEPT_CODE')
  assert.equal(drillMemberField({ levels: [{ levelCode: 'OUT_DEPT' }] }, 'OUT_DEPT'), '')
})

test('every request preserves result snapshot path interval and independent member selections', () => {
  const context = { resultId: '102027642463201863', snapshotId: '102027642463201864', indicatorVersionId: '版本甲',
    pathCode: 'ORGANIZATION', currentLevel: 'DOCTOR', periodRange: period,
    parentKeys: { 科室编码: '15', 科室名称: '骨科（东院）' }, filters: { 科室编码: ['15', '16'], IN_ICD10: ['J18.900'], 科室名称: ['骨科(东院)'] } }
  for (const pageSize of [20, 100, 200]) {
    const request = buildDrillRequest(context, { path, pageNum: 2, pageSize })
    assert.equal(request.resultId, context.resultId)
    assert.equal(request.payload.snapshotId, context.snapshotId)
    assert.equal(request.payload.pathCode, path.pathCode)
    assert.equal(request.payload.currentLevel, 'DOCTOR')
    assert.deepEqual(request.payload.periodRange, period)
    assert.deepEqual(request.payload.parentKeys, { 科室编码: '15' })
    assert.deepEqual(request.payload.filters, { 科室编码: ['15', '16'], IN_ICD10: ['J18.900'] })
    assert.equal(request.payload.indicatorVersionId, undefined, 'version is checked against the response, not sent as an unsupported API field')
    request.payload.filters.IN_ICD10.push('其他')
    assert.deepEqual(context.filters.IN_ICD10, ['J18.900'])
  }
  assert.equal(context.parentKeys.科室名称, '骨科（东院）')
})

test('display names without a stable code fail instead of silently expanding the selection', () => {
  for (const context of [{ filters: { 科室名称: ['骨科'] } }, { parentKeys: { 科室名称: '骨科' } },
    { filters: { 科室编码: [], 科室名称: ['骨科'] } }]) {
    assert.throws(() => drillScope(context, path), /缺少成员编码/)
  }
})

test('real name-like dimension identities and unrelated disease filters are not guessed away', () => {
  const namePath = { levels: [{ levelCode: 'MEMBER', memberKeyFieldCode: '病种名称', displayFieldCode: '病种名称' }] }
  const context = { parentKeys: { 病种名称: '肺炎' }, filters: { 病种名称: ['肺炎'], PATIENT_NAME: ['张'] } }
  assert.deepEqual(drillScope(context, namePath), context)
})

test('navigation binds codes only and preserves zero identities and ancestor scope', () => {
  const context = { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: '院区甲' } }
  for (const label of ['骨科（东院）', '骨科(东院)', '骨科新名称']) {
    assert.deepEqual(nextDrillNavigation(context, { dimensionKey: 0, dimensionLabel: label }, 'DOCTOR', path), {
      currentLevel: 'DOCTOR', parentKeys: { HOSPITAL_CODE: '院区甲', 科室编码: '0' }, label
    })
  }
  assert.equal(nextDrillNavigation(context, { dimensionLabel: '无编码科室' }, 'DOCTOR', path), null)
})

test('projected navigation removes obsolete names only after resolving the selected row code', () => {
  const projected = projectedDrillNavigation({ 科室编码: '15', 科室名称: '新名称' }, path, {
    currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: '院区甲' }, filters: { 科室名称: ['旧名称'], 病种: ['肺炎'] }
  })
  assert.deepEqual(projected.initialNavigation.parentKeys, { HOSPITAL_CODE: '院区甲', 科室编码: '15' })
  assert.deepEqual(projected.filters, { 病种: ['肺炎'] })
})

test('formal dates validate a response but never accidentally request an interval aggregate', () => {
  const request = buildDrillRequest({ resultId: '结果甲', period, currentLevel: 'OUT_DEPT' })
  assert.equal(request.payload.periodRange, undefined)
  assert.doesNotThrow(() => assertDrillResponseContext({ context: { periodStart: '2026-02-01T00:00:00', periodEnd: '2026-05-01T00:00:00' } }, { period }))
  assert.throws(() => assertDrillResponseContext({ context: { periodStart: '2026-02-01', periodEnd: '2026-03-01' } }, { period }), /统计周期不一致/)
})

test('wrong versions snapshots and paths cannot be displayed as the requested context', () => {
  for (const field of ['indicatorVersionId', 'snapshotId', 'pathCode']) {
    assert.throws(() => assertDrillResponseContext({ context: { [field]: '其他' } }, { [field]: '当前' }), /不一致/)
  }
  assert.doesNotThrow(() => assertDrillResponseContext({ context: { snapshotId: 42 } }, { snapshotId: '42' }))
})

test('canonical root lookup is shared by charts and tables without borrowing a department result', () => {
  const response = { records: [{ levelCode: 'OUT_DEPT', resultId: '科室结果' }, { levelCode: 'HOSPITAL', resultId: '全院结果' }] }
  assert.equal(canonicalDrillRootResultId(response, 'HOSPITAL'), '全院结果')
  assert.equal(canonicalDrillRootResultId(response, 'ROOT'), '')
})

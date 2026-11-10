import test from 'node:test'
import assert from 'node:assert/strict'
import { inheritedFactorParameters } from '../src/idmp/utils/factorRuntimeParameters.js'
import { collectSqlRuntimeParameters, validateSqlRuntimeParameterValues, buildSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'

test('required and conflict messages use the same business names as the fields', () => {
  const declaration = { code: 'deptCode', type: 'STRING', required: true, displayName: '出院科室' }
  assert.equal(validateSqlRuntimeParameterValues([declaration], {}), '请填写必填参数：出院科室')
  assert.equal(validateSqlRuntimeParameterValues([declaration], { deptCode: '  ' }), '请填写必填参数：出院科室')
  assert.equal(validateSqlRuntimeParameterValues([{ ...declaration, conflict: true }], {}), '同名参数声明不一致：出院科室')
  assert.equal(validateSqlRuntimeParameterValues([{ code: 'deptCode', required: true }], {}), '请填写必填参数：科室编码')
  assert.equal(validateSqlRuntimeParameterValues([{ code: 'unlabelled', required: true }], {}), '请填写必填参数：unlabelled')
})

test('invalid runtime types are rejected with Chinese labels before numeric conversion', () => {
  const cases = [
    ['INTEGER', '3.5', '整数'], ['INTEGER', '1e3', '整数'], ['INTEGER', '9007199254740992', '整数'],
    ['DECIMAL', 'Infinity', '数值'], ['DECIMAL', '1.5x', '数值'], ['DECIMAL', '0x10', '数值'],
    ['BOOLEAN', 'yes', '是或否'], ['BOOLEAN', 1, '是或否'], ['STRING', { value: 'x' }, '文本'],
    ['DATE', '2026-02-30', '日期'], ['DATE', '2026-01-01T12:00:00', '日期'],
    ['DATETIME', '2026-01-01T25:00:00', '日期时间'], ['DATETIME', '2026-01-01', '日期时间'],
    ['DATETIME', '2026-02-30T12:00:00', '日期时间']
  ]
  for (const [type, value, message] of cases) {
    const result = validateSqlRuntimeParameterValues([{ code: 'customValue', type, label: '业务条件' }], { customValue: value })
    assert.match(result, /业务条件/)
    assert.ok(result.includes(message), result)
    assert.equal(result.includes('customValue'), false)
  }
})

test('valid zero, false, numeric strings, leap dates and datetime values keep their request keys', () => {
  const declarations = [
    { code: 'count', type: 'INTEGER', required: true, displayName: '人数' },
    { code: 'ratio', type: 'DECIMAL' }, { code: 'enabled', type: 'BOOLEAN', required: true },
    { code: 'date', type: 'DATE' }, { code: 'time', type: 'DATETIME' }, { code: 'deptCode', type: 'STRING' }
  ]
  const values = { count: '0', ratio: '-1.25', enabled: false, date: '2024-02-29', time: '2026-01-01T23:59:59', deptCode: 'D001' }
  assert.equal(validateSqlRuntimeParameterValues(declarations, values), '')
  assert.deepEqual(buildSqlRuntimeParameterValues(declarations, values), { ...values, count: 0, ratio: -1.25 })
  assert.equal(validateSqlRuntimeParameterValues([{ code: 'optional', type: 'DATE' }], {}), '')
})

async function inherit(rootParameters, upstreamParameters) {
  const root = { id: 'root', parameterSchema: { parameters: rootParameters }, logicalPlan: { factorDependencies: [{ factorVersionId: 'upstream' }] } }
  const upstream = { id: 'upstream', parameterSchema: { parameters: upstreamParameters } }
  const before = structuredClone({ root, upstream })
  const result = await inheritedFactorParameters(root, async () => upstream)
  assert.deepEqual({ root, upstream }, before)
  return result
}

test('upstream declarations without a name cannot erase the root business name', async () => {
  const result = await inherit([{ code: 'deptCode', type: 'STRING', displayName: '出院科室', required: false, parameterMode: 'DIMENSION' }],
    [{ code: 'deptCode', type: 'STRING', label: 'deptCode', required: true, parameterMode: 'TEMPORARY' }])
  assert.equal(result[0].displayName, '出院科室')
  assert.equal(result[0].required, true)
  assert.equal(result[0].parameterMode, 'TEMPORARY')
})

test('a named root wins conflicts while an unnamed root inherits the upstream label', async () => {
  const preferred = await inherit([{ code: 'deptCode', type: 'STRING', name: '统计科室' }], [{ code: 'deptCode', type: 'STRING', displayName: '入院科室' }])
  assert.equal(preferred[0].displayName, '统计科室')
  const inherited = await inherit([{ code: 'deptCode', type: 'STRING', label: 'deptCode' }], [{ code: 'deptCode', type: 'STRING', label: '入院科室' }])
  assert.equal(inherited[0].displayName, '入院科室')
})

test('incompatible inherited types report the current business name', async () => {
  await assert.rejects(inherit([{ code: 'deptCode', type: 'STRING', displayName: '出院科室' }], [{ code: 'deptCode', type: 'INTEGER' }]), /运行参数“出院科室”.*类型不一致/)
})

test('SQL declarations inherit the first explicit name without hiding type conflicts', () => {
  const declarations = collectSqlRuntimeParameters([
    { key: 'first', parameters: [{ code: 'deptCode', type: 'STRING' }] },
    { key: 'second', parameters: [{ code: 'deptCode', type: 'STRING', label: '统计科室' }] },
    { key: 'third', parameters: [{ code: 'deptCode', type: 'INTEGER', displayName: '其他名称' }] }
  ])
  assert.equal(declarations[0].displayName, '统计科室')
  assert.equal(declarations[0].conflict, true)
  assert.equal(validateSqlRuntimeParameterValues(declarations, {}), '同名参数声明不一致：统计科室')
})

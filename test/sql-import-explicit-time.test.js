import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'

const { descriptor } = parse(await readFile(new URL('../src/idmp/views/SqlIndicatorImport.vue', import.meta.url), 'utf8'))
const validation = descriptor.scriptSetup.content.split('\n').find(line => line.startsWith('function validateMetadata()'))
const validate = (factors, formula = { root: { nodeType: 'FACTOR_REF', factorKey: 'total' } }) => Function(
  'factorMetadata', 'scope', 'indicator', 'preview', 'validateRuntimeDeclarations', 'validateGrouping', 'hasFormula',
  `${validation}; return validateMetadata()`
)({ value: factors }, { value: 'FACTORS_AND_INDICATOR' }, { code: 'RATIO', name: '手术占比' },
  { value: { formula: { template: formula } } }, () => '', () => '', value => Boolean(value?.root))

test('layered SQL import accepts explicitly selected time fields before backend confirmation', () => {
  assert.equal(validate([{ key: 'total', code: 'TOTAL', name: '手术人数', calculationMode: 'TEMPORAL', timeField: 's.surgery_date' }]), '')
})

test('temporal import still requires a selected time field', () => {
  assert.match(validate([{ key: 'total', code: 'TOTAL', name: '手术人数', calculationMode: 'TEMPORAL', timeField: '' }]), /时间字段/)
})

test('static import needs no time field and mixed modes remain rejected', () => {
  const factor = { key: 'total', code: 'TOTAL', name: '手术人数', calculationMode: 'STATIC' }
  assert.equal(validate([factor]), '')
  assert.match(validate([factor, { ...factor, key: 'other', calculationMode: 'TEMPORAL', timeField: 's.date' }]), /相同计算模式/)
})

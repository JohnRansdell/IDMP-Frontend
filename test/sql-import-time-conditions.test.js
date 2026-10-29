import test from 'node:test'
import assert from 'node:assert/strict'
import { sqlTimeFieldDescription } from '../src/idmp/features/indicator/sqlImportFields.js'

test('原日期条件提示明确说明不会被替换', () => {
  assert.match(sqlTimeFieldDescription({ recommendationReasons: ['SQL_PERIOD_PREDICATE', 'SOURCE_TIME_TYPE'] }), /原条件仍会保留.*源字段为日期时间类型/)
})

test('文本时间字段显示中文校验说明，不泄漏内部代码', () => {
  const text = sqlTimeFieldDescription({ recommendationReasons: ['SOURCE_VALUE_VALIDATION_REQUIRED'] })
  assert.match(text, /确认时将检查/)
  assert.doesNotMatch(text, /SOURCE_VALUE/)
  assert.match(sqlTimeFieldDescription({ recommendationReasons: ['SOURCE_VALUE_PROFILE_ISO_DATE_TIME'] }), /抽样确认/)
})

test('未识别的服务端推荐原因使用可理解的默认提示', () => {
  assert.match(sqlTimeFieldDescription({ recommendationReasons: ['NEW_INTERNAL_REASON'] }), /所选字段/)
  assert.match(sqlTimeFieldDescription({ recommended: true }), /请确认符合本次统计口径/)
})

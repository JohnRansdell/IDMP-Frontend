import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'
const payload='{"factorVersionIds":[102027642461800096,102027642461800094],"id":102027642461800121,"value":0.072,"safe":9007199254740991,"decimal":102027642461800096.12,"exp":1e20,"text":"SQL :102027642461800096, [[AND name={{name}}]]"}'
function verify(parse) {
  const data=parse(payload)
  assert.deepEqual(data.factorVersionIds,['102027642461800096','102027642461800094'])
  assert.equal(data.id,'102027642461800121')
  assert.equal(data.value,0.072);assert.equal(data.safe,9007199254740991)
  assert.equal(typeof data.decimal,'number');assert.equal(typeof data.exp,'number')
  assert.equal(data.text,'SQL :102027642461800096, [[AND name={{name}}]]')
}
test('JSON response preserves unsafe scalar and array IDs without changing metric values or SQL text',()=>verify(parseJsonPreservingLargeIntegers))
test('fallback browser parser has the same precision and string safety',()=>{
  const nativeParse=JSON.parse
  JSON.parse=(text,reviver)=>nativeParse(text,reviver?function(key,value){return reviver.call(this,key,value)}:undefined)
  try {verify(parseJsonPreservingLargeIntegers)} finally {JSON.parse=nativeParse}
})
test('escaped strings and nested ID arrays round-trip',()=>{
  const data=parseJsonPreservingLargeIntegers('{"text":"quoted \\\"x\\\" :102027642461800096,","rows":[[-102027642461800096]]}')
  assert.equal(data.text,'quoted "x" :102027642461800096,');assert.equal(data.rows[0][0],'-102027642461800096')
})
test('malformed JSON is not retried through a precision-losing parser',()=>assert.equal(parseJsonPreservingLargeIntegers('{bad}'),null))

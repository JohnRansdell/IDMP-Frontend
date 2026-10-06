import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { hashPolicyFile, uploadPolicyFile } from '../src/idmp/api/modules/policies.js'
import { clearAccessToken, requestFile } from '../src/idmp/api/request.js'

globalThis.localStorage = { getItem: () => '', removeItem() {} }
test.beforeEach(() => clearAccessToken())
function file(text = '医疗质量政策', name = '政策.txt') { return Object.assign(new Blob([text]), { name }) }
const ok = data => new Response(JSON.stringify({ code: '0', data }), { headers: { 'Content-Type': 'application/json' } })
test('分块 SHA-256 与标准实现一致，兼容没有 Web Crypto 的 HTTP 页面', async () => {
  const value = '政策'.repeat(800_000)
  assert.equal(await hashPolicyFile(file(value)), createHash('sha256').update(value).digest('hex'))
})
test('秒传命中时不发送文件内容', async () => {
  const paths = []
  globalThis.fetch = async url => {
    paths.push(url)
    if (url.endsWith('upload-options')) return ok({ extensions: ['txt'], maxBytes: 1024 })
    if (url.endsWith('/check')) return ok({ instantUpload: true, file: { id: '100000000000000001' } })
    throw new Error('不应再次上传')
  }
  assert.equal((await uploadPolicyFile(file())).instantUpload, true)
  assert.equal(paths.length, 2)
})
test('首次上传用 multipart，浏览器自行生成 boundary', async () => {
  const source = file('首次上传测试')
  let uploaded = false
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('upload-options')) return ok({ extensions: ['txt'], maxBytes: 1024 })
    if (url.endsWith('/check')) return ok({ instantUpload: false, file: null })
    assert.ok(url.endsWith('/upload'))
    assert.ok(options.body instanceof FormData)
    assert.equal(options.headers['Content-Type'], undefined)
    assert.equal(await options.body.get('file').text(), await source.text())
    assert.equal(options.body.get('sha256'), createHash('sha256').update(await source.text()).digest('hex'))
    uploaded = true
    return ok({ instantUpload: false, file: { id: '1' } })
  }
  await uploadPolicyFile(source)
  assert.equal(uploaded, true)
})
test('空文件和未允许的格式在前端被拒绝', async () => {
  globalThis.fetch = async () => ok({ extensions: ['txt'], maxBytes: 1024 })
  await assert.rejects(uploadPolicyFile(file('')), /不能为空/)
  await assert.rejects(uploadPolicyFile(file('binary', 'a.exe')), /请选择/)
})

test('上传大小按后端的 10 MB 配置校验，超过限制不发送文件', async () => {
  const paths = []
  globalThis.fetch = async url => {
    paths.push(url)
    if (url.endsWith('upload-options')) return ok({ extensions: ['txt'], maxBytes: 10 * 1024 * 1024 })
    if (url.endsWith('/check')) return ok({ instantUpload: true, file: { id: '10' } })
    throw new Error('不应发送文件内容')
  }
  assert.equal((await uploadPolicyFile(file('x'.repeat(10 * 1024 * 1024)))).instantUpload, true)
  paths.length = 0
  await assert.rejects(uploadPolicyFile(file('x'.repeat(10 * 1024 * 1024 + 1))), /不能超过 10\.0 MB/)
  assert.equal(paths.length, 1)
})
test('受保护文件读取保留 MIME，错误不会展示 HTML', async () => {
  globalThis.fetch = async () => new Response('正文', { headers: { 'Content-Type': 'text/plain' } })
  assert.equal(await (await requestFile('/meta/file-objects/1/content')).text(), '正文')
  globalThis.fetch = async () => new Response('<html>413 Request Entity Too Large</html>', { status: 413 })
  await assert.rejects(requestFile('/meta/file-objects/1/content'), /文件超过允许/)
})

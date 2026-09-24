import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('background picker keeps system assets available and explains unavailable upload without a fake upload', async () => {
  const source = await readFile(new URL('../src/idmp/features/dashboard/components/BackgroundAssetPicker.vue', import.meta.url), 'utf8')
  assert.match(source, /系统背景/)
  assert.match(source, /我的图片/)
  assert.match(source, /需要配置图片资源服务后才能上传自定义图片/)
  assert.doesNotMatch(source, /blob:/)
  assert.doesNotMatch(source, /FormData/)
})

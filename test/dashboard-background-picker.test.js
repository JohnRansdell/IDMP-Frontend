import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('background picker keeps system assets and supports bounded browser-local images without a fake upload', async () => {
  const source = await readFile(new URL('../src/idmp/features/dashboard/components/BackgroundAssetPicker.vue', import.meta.url), 'utf8')
  assert.match(source, /系统背景/)
  assert.match(source, /我的图片/)
  assert.match(source, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.match(source, /MAX_CUSTOM_IMAGE_SIZE = 1024 \* 1024/)
  assert.match(source, /reader\.readAsDataURL\(file\)/)
  assert.match(source, /图片保存在当前浏览器中/)
  assert.doesNotMatch(source, /blob:/)
  assert.doesNotMatch(source, /FormData/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {canAccess} from '../src/idmp/auth/permissions.js'

const analyst = {status: 'authenticated', user: {id: '123'}, roles: ['DEPARTMENT_ANALYST'], apiRules: [], deniedPaths: []}
test('登录用户的收件箱和已读操作不依赖角色菜单权限', () => {
  for (const [method, path] of [['GET', '/me/notifications'], ['GET', '/me/notifications/unread-count'], ['POST', '/me/notifications/123/read'], ['POST', '/me/notifications/read-all']]) {
    assert.equal(canAccess(analyst, method, path), true)
  }
  assert.equal(canAccess(analyst, 'DELETE', '/me/notifications/123/read'), false)
  assert.equal(canAccess(analyst, 'GET', '/system/users'), false)
})
test('匿名、签名看板专用会话和显式禁止均不能绕过权限', () => {
  for (const session of [{...analyst, status: 'anonymous', user: null}, {...analyst, roles: ['MEDICAL_VIEWER']}, {...analyst, deniedPaths: ['/api/v1/me/notifications/**']}]) {
    assert.equal(canAccess(session, 'GET', '/me/notifications'), false)
  }
})
test('权限豁免只限个人通知既有端点', () => {
  for (const path of ['/me/notifications/export', '/me/notifications/123', '/me/notifications/read-all/extra', '/me/notifications-other']) {
    assert.equal(canAccess(analyst, 'GET', path), false)
    assert.equal(canAccess(analyst, 'POST', path), false)
  }
})

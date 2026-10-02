import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseJson } from './system-test-client.mjs'

const root = 'D:/idmp/idmp-web/src/main/java/com/idmp/web'
const evidenceRoot = '.tmp/system-test-20261002'
async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else result.push(path)
  }
  return result
}
const routes = []
for (const file of (await files(root)).filter(path => path.endsWith('Controller.java'))) {
  const source = await readFile(file, 'utf8')
  const classIndex = source.indexOf('public class ')
  const classAnnotation = source.slice(0, classIndex).match(/@RequestMapping\("([^"]*)"\)/)
  const base = classAnnotation?.[1] || ''
  for (const match of source.slice(classIndex).matchAll(/@(Get|Post|Put|Patch|Delete)Mapping(?:\("([^"]*)"\))?/g)) {
    const line = source.slice(0, classIndex + match.index).split('\n').length
    const path = base + (match[2] || '')
    routes.push({ controller: relative(root, file).replaceAll('\\', '/'), line, method: match[1].toUpperCase(), path })
  }
}
const calls = []
for (const file of (await files(evidenceRoot)).filter(path => path.endsWith('/summary.json') || path.endsWith('\\summary.json'))) {
  const summary = parseJson(await readFile(file, 'utf8'))
  for (const call of summary.calls || []) calls.push({ ...call, evidence: relative(evidenceRoot, file).replaceAll('\\', '/') })
}
for (const route of routes) {
  const tokens = route.path.split('/').map(token => /^\{[^}]+\}$/.test(token) ? '[^/]+' : token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp('^' + tokens.join('/') + '$')
  route.pattern = pattern
  route.specificity = route.path.split('/').filter(token => token && !token.startsWith('{')).length
  route.calls = []
}
for (const call of calls) {
  const matches = routes.filter(route => call.method === route.method && route.pattern.test('/api/v1' + call.path.split('?')[0]))
  matches.sort((a, b) => b.specificity - a.specificity)
  if (matches[0]) matches[0].calls.push(call)
}
for (const route of routes) {
  delete route.pattern
  delete route.specificity
  route.successCalls = route.calls.filter(call => call.http >= 200 && call.http < 300).length
  route.status = route.successCalls ? '成功请求已覆盖（不等于功能全验收）' : route.calls.length ? '仅错误或边界请求' : '未请求'
}
routes.sort((a, b) => a.controller.localeCompare(b.controller) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
const result = { total: routes.length, requested: routes.filter(route => route.calls.length).length, success: routes.filter(route => route.successCalls).length, calls: calls.length, routes }
await mkdir(join(evidenceRoot, 'COVERAGE'), { recursive: true })
await writeFile(join(evidenceRoot, 'COVERAGE', 'interfaces.json'), JSON.stringify(result, null, 2))
const lines = ['# 2026-10-02 接口请求覆盖清单', '', '根据当前后端 Controller 的 HTTP 方法及路径与本轮测试请求记录匹配。包括初次探测和更正请求；请求成功不代表所有输入组合、页面交互或业务分支已通过。错误请求也不能直接认定为产品缺陷，具体结论以完整测试报告为准。', '', `- 实现接口：${result.total} 个。`, `- 至少请求一次：${result.requested} 个。`, `- 至少一次 2xx：${result.success} 个。`, '- 本清单不计单元测试或模拟 API；不含 Actuator。', '', '| 方法 | 接口 | 请求覆盖 | 证据 |', '| --- | --- | --- | --- |']
for (const route of routes) lines.push(`| ${route.method} | \`${route.path}\` | ${route.status} | ${[...new Set(route.calls.map(call => call.evidence.split('/')[0]))].join('、') || '-'} |`)
await writeFile('docs/2026-10-02_接口测试覆盖清单.md', lines.join('\n') + '\n')
console.log(JSON.stringify({ total: result.total, requested: result.requested, success: result.success, calls: result.calls, untested: routes.filter(route => !route.calls.length).map(route => `${route.method} ${route.path}`) }, null, 2))

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { dashboardDetailToSchema, schemaToDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'
import { serializeWarningRulePayload } from '../src/idmp/api/adapters/warning.js'

const root = path.resolve('src/idmp')
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(dir, item.name)) : [path.join(dir, item.name)]) }

test('所有页面与公共组件均不提供资源编码控件或列，业务字段和值项不受影响', () => {
  const forbidden = /^(?:指标|因子|模板|因子模板|场景|映射|语义组|政策文件|值集|预警规则|规则|看板|组件|数据源|数据域|关系)编码$/
  for (const file of files(root).filter(file => file.endsWith('.vue'))) {
    const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'))
    assert.deepEqual(errors, [], file)
    const visit = node => {
      if (['el-form-item', 'el-table-column', 'el-descriptions-item', 'CodeTooltip'].includes(node.tag)) {
        const label = node.props?.find(prop => prop.type === 6 && prop.name === 'label')?.value?.content || ''
        assert.equal(forbidden.test(label), false, `${file}: ${label}`)
        if (label === '编码') assert.equal(path.basename(file), 'ValueSetVersionEditor.vue', file)
      }
      for (const child of node.children || []) visit(child)
    }
    if (descriptor.template?.ast) visit(descriptor.template.ast)
    assert.doesNotMatch(descriptor.scriptSetup?.content || '', /请输入(?:指标|因子|模板|场景|值集|数据域|规则|映射|政策文件)编码/, file)
  }
})

const createFunctions = {
  factors: ['createFactor', 'createFactorTemplate'], indicators: ['createIndicator'], scenarios: ['createScenario'],
  mappings: ['createMapping', 'createMappingGroup'], policies: ['createPolicy'], valueSets: ['createValueSet'],
  warnings: ['createWarningRule'], meta: ['createDataDomain', 'createPhysicalTableRelation', 'createSemanticTableRelation'],
  analysisDashboard: ['createDashboard']
}
for (const [module, names] of Object.entries(createFunctions)) {
  test(`${module} 创建不提交资源编码，嵌套业务编码保持不变`, async () => {
    const source = fs.readFileSync(path.join(root, 'api/modules', `${module}.js`), 'utf8')
    for (const name of names) {
      const fn = source.match(new RegExp(`export (?:async )?function ${name}\\([^]*?\\n}`))?.[0]
        || source.match(new RegExp(`export const ${name} = .*`))?.[0]
      assert.ok(fn, name)
      let sent
      const request = (url, options) => { sent = JSON.parse(options.body); return sent }
      const api = Function('requestJson', 'serializeWarningRulePayload', 'write', `${fn.replace('export ', '')}; return ${name}`)(request, serializeWarningRulePayload, (url, body) => request(url, { body: JSON.stringify(body) }))
      const nested = { code: 'DEPT_CODE', parameters: [{ code: 'deptCode' }], items: [{ code: '01' }] }
      await api({ code: 'IGNORED_CLIENT_CODE', name: '资源编码回归验收', indicatorVersionId: '123', nested })
      assert.equal(Object.hasOwn(sent, 'code'), false, name)
      assert.deepEqual(sent.nested, nested, name)
    }
  })
}

test('新组件仅发送临时关联标识，保存后的组件保留后端编码，复制组件重新生成', () => {
  const schema = { name: '联动验收', layout: { columns: 24 }, widgets: [{ id: 'local-widget', type: 'text', title: '验收说明', config: {}, layout: { x: 0, y: 0, w: 4, h: 3 } }] }
  const created = schemaToDashboardPayload(schema)
  assert.equal(created.widgets[0].clientKey, 'local-widget')
  assert.equal(Object.hasOwn(created.widgets[0], 'code'), false)
  const loaded = dashboardDetailToSchema({ dashboard: { id: '1', name: schema.name }, version: { ...created, widgets: [{ ...created.widgets[0], code: 'WIDGET_SERVER_CODE' }] } })
  assert.equal(schemaToDashboardPayload(loaded).widgets[0].code, 'WIDGET_SERVER_CODE')
  loaded.widgets[0].id = 'copied-local-widget'
  const copied = schemaToDashboardPayload(loaded).widgets[0]
  assert.equal(copied.clientKey, 'copied-local-widget')
  assert.equal(Object.hasOwn(copied, 'code'), false)
})

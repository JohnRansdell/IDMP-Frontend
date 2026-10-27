import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class Cdp {
  sequence = 0
  pending = new Map()
  errors = []
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject) })
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data)
      if (data.method === 'Runtime.exceptionThrown') this.errors.push(data.params.exceptionDetails)
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    return new Promise((resolve, reject) => { const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
}

function mockBackend() {
  localStorage.setItem('idmp_access_token', 'factor-physical-fixture')
  const realFetch = window.fetch.bind(window)
  window.__factorRequests = []
  const mapped = table => table === 'visit' ? [
    { id: '10', code: 'ADMISSION_TIME', name: '入院时间', sourceFieldName: 'in_date', dataType: 'DATETIME' },
    { id: '11', code: 'DEPARTMENT', name: '科室', sourceFieldName: 'dept_code', dataType: 'STRING' },
    { id: '12', code: 'COST', name: '费用', sourceFieldName: 'fee', dataType: 'DECIMAL' }
  ] : [
    { id: '20', code: 'VISIT_KEY', name: '住院号', sourceFieldName: 'visit_id', dataType: 'STRING' },
    { id: '21', code: 'DIAGNOSIS', name: '病种', sourceFieldName: 'diagnosis', dataType: 'STRING' },
    { id: '22', code: 'DIAGNOSIS_TIME', name: '诊断时间', sourceFieldName: 'diagnosis_time', dataType: 'DATETIME' }
  ]
  const source = table => mapped(table).map(field => ({ columnName: field.sourceFieldName, columnType: ['10', '22'].includes(field.id) ? 'datetime' : field.id === '12' ? 'decimal(12,2)' : 'varchar(40)', comment: field.name }))
  const relation = { id: '100', leftPhysicalTableBindingId: '1', rightPhysicalTableBindingId: '2', leftDomainId: '9', rightDomainId: '9', leftDomainCode: 'VISIT', rightDomainCode: 'VISIT', leftTableName: 'visit', rightTableName: 'diagnosis', joinType: 'LEFT', cardinality: 'MANY_TO_ONE' }
  const relations = JSON.parse(localStorage.getItem('idmp_relation_fixture') || 'null') || [relation]
  let indicator = JSON.parse(localStorage.getItem('idmp_indicator_fixture') || 'null')
  window.__rejectRelationValidation = false
  window.__failRelationPublish = false
  window.__loseRelationCreateResponse = false
  window.__failNextFieldLoad = false
  window.__delayNextFieldLoad = 0
  const initialDsl = { primaryDomain: { domainCode: 'VISIT', tableName: 'visit', sourceAlias: 'base' }, calculationMode: 'TEMPORAL', aggregation: { function: 'COUNT_DISTINCT', fieldRef: { sourceAlias: 'join1', fieldCode: 'visit_id' } }, joins: [{ relationId: '100', fromAlias: 'base', sourceAlias: 'join1' }], groupBy: ['dept_code', { sourceAlias: 'join1', fieldCode: 'diagnosis' }], filters: { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'in_date', operator: 'BETWEEN', parameter: 'period' }] }, missingRowPolicy: 'ZERO' }
  let dsl = JSON.parse(localStorage.getItem('idmp_factor_dsl_fixture') || 'null') || JSON.parse(JSON.stringify(initialDsl))
  const legacyDsl = JSON.parse(JSON.stringify(initialDsl))
  window.__restoreOriginalDsl = () => { dsl = JSON.parse(JSON.stringify(initialDsl)); localStorage.removeItem('idmp_factor_dsl_fixture'); window.__factorRequests = [] }
  legacyDsl.primaryDomain = { domainCode: 'VISIT', semanticTableCode: 'visit', sourceAlias: 'base' }
  legacyDsl.aggregation.fieldRef.fieldCode = 'VISIT_KEY'
  legacyDsl.groupBy = ['DEPARTMENT', { sourceAlias: 'join1', fieldCode: 'DIAGNOSIS' }]
  legacyDsl.filters.children[0].fieldCode = 'ADMISSION_TIME'
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const p = url.pathname.replace('/api/v1', '')
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const body = init.body ? JSON.parse(init.body) : null
    window.__factorRequests.push({ path: p, query: url.search, method: init.method || 'GET', body })
    let data = {}
    if (p === '/auth/me') data = { user: { id: '1', username: 'tester', displayName: '验收用户' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (p === '/meta/data-domains') data = [{ id: '9', code: 'VISIT', name: '住院数据域', status: 'PUBLISHED' }]
    else if (p.endsWith('/physical-tables')) data = [{ id: '1', domainId: '9', tableName: 'visit', tableComment: '住院记录', defaultTimeSemanticFieldCode: 'ADMISSION_TIME', status: 'PUBLISHED' }, { id: '2', domainId: '9', tableName: 'diagnosis', tableComment: '诊断记录', status: 'PUBLISHED' }]
    else if (p.includes('/physical-tables/') && p.endsWith('/semantic-fields')) data = mapped(p.split('/').at(-2))
    else if (p.startsWith('/meta/source-tables/') && p.endsWith('/fields')) data = source(p.split('/').at(-2))
    else if (p === '/meta/physical-table-relations' && init.method === 'POST') {
      data = { ...relation, ...body, id: String(100 + relations.length), status: 'DRAFT', resourceVersion: 0 }
      relations.push(data)
      localStorage.setItem('idmp_relation_fixture', JSON.stringify(relations))
      if (window.__loseRelationCreateResponse) {
        window.__loseRelationCreateResponse = false
        return new Response(JSON.stringify({ code: 'CONFLICT', message: '关联保存暂时失败，请重试' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      }
    }
    else if (p === '/meta/physical-table-relations') data = relations.filter(item => !url.searchParams.get('status') || item.id === '100' || item.status === url.searchParams.get('status'))
    else if (p.startsWith('/meta/physical-table-relations/')) {
      const item = relations.find(item => item.id === p.split('/')[3])
      if (p.endsWith('/validate')) data = { valid: !window.__rejectRelationValidation, diagnostics: window.__rejectRelationValidation ? [{ severity: 'ERROR', message: '关联字段未发布，请检查字段状态' }] : [] }
      else if (p.endsWith('/publish')) {
        if (window.__failRelationPublish) {
          window.__failRelationPublish = false
          return new Response(JSON.stringify({ code: 'CONFLICT', message: '关联保存暂时失败，请重试' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
        }
        item.status = 'PUBLISHED'; item.resourceVersion++; data = item
        localStorage.setItem('idmp_relation_fixture', JSON.stringify(relations))
      } else if (init.method === 'PATCH') { Object.assign(item, body, { status: 'DRAFT', resourceVersion: item.resourceVersion + 1 }); data = item }
      else data = item
    }
    else if (p === '/indicator-versions/drill-capabilities') {
      if (window.__failNextFieldLoad) {
        window.__failNextFieldLoad = false
        return new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: '物理字段加载失败，请重试' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      const refs = []
      const collect = node => { if (!node) return; if (node.nodeType === 'FACTOR_REF') refs.push(node.factorVersionId); collect(node.left); collect(node.right) }
      collect(body.formula.root)
      const ids = [...new Set(refs.flatMap(id => id === 'COMPOSITE' ? ['LEAF_A', 'LEAF_B'] : [id]))]
      data = { factorVersionIds: ids, dimensions: [
        { pathCode: 'TIME', supported: true, maxLevel: 'DAY', levels: [{ code: 'YEAR', name: '年度' },{ code: 'QUARTER', name: '季度' },{ code: 'MONTH', name: '月度' },{ code: 'DAY', name: '日' }], limitingFactors: [] },
        { pathCode: 'ORGANIZATION', supported: false, maxLevel: 'HOSPITAL', levels: [], limitingFactors: [{ factorVersionId: ids[0], reason: '缺少默认组织维度' }] },
        ...(body.drillPaths || []).filter(path=>path.pathCode.startsWith('CUSTOM_')).map(path=>({pathCode:path.pathCode,supported:true,maxLevel:path.maxLevel,levels:path.levels.map(level=>({code:level.levelCode,name:level.levelName})),limitingFactors:[]}))
      ], fieldOptions: ids.map(id => ({ factorVersionId: id, factorName: `因子 ${id}`, fields: [
        { tableName: 'visit', columnName: 'dept_code', fieldReference: 'base.dept_code' },
        ...(id === '10' ? [{ tableName: 'diagnosis', columnName: 'department_id', fieldReference: 'join1.department_id' }, { tableName: 'visit', columnName: 'dept_code', fieldReference: 'join2.dept_code' }] : [])
      ] })) }
      const responseDelay = window.__delayNextFieldLoad
      window.__delayNextFieldLoad = 0
      if (responseDelay) await new Promise(resolve => setTimeout(resolve, responseDelay))
    }
    else if (p === '/indicators' && init.method === 'POST') { indicator = { ...body, id: '200', status: 'DRAFT', resourceVersion: 0 }; localStorage.setItem('idmp_indicator_fixture', JSON.stringify(indicator)); data = indicator }
    else if (p === '/indicators/200') data = indicator
    else if (p === '/indicators/200/versions') data = []
    else if (p.includes('/value-set')) data = p.includes('/11/') ? { bound: true, valueSet: { id: '90' }, publishedVersion: { id: '91', matchMode: 'EXACT', items: [{ code: 'D1', label: '内科' }] } } : { bound: false }
    else if (p === '/factors' && init.method === 'POST') { dsl = body.dsl; localStorage.setItem('idmp_factor_dsl_fixture', JSON.stringify(dsl)); data = { id: '1', draftVersionId: '3', status: 'DRAFT', resourceVersion: 1 } }
    else if (p === '/factors/1') { if (body) { dsl = body.dsl; localStorage.setItem('idmp_factor_dsl_fixture', JSON.stringify(dsl)) } data = { id: '1', code: 'FACTOR_TEST', name: '物理字段因子', draftVersionId: '3', status: 'DRAFT', resourceVersion: 1 } }
    else if (p === '/factors/1/versions') data = [{ id: '3', versionNo: 1, publicationStatus: 'DRAFT' }]
    else if (p === '/factor-versions/3') data = { id: '3', dsl, publicationStatus: 'DRAFT' }
    else if (p === '/factors/2' || p === '/factors/3') data = { id: p.split('/').at(-1), code: 'EXISTING', name: '已有因子', draftVersionId: p.endsWith('/2') ? '4' : '5', status: 'DRAFT' }
    else if (p === '/factors/2/versions' || p === '/factors/3/versions') data = [{ id: p.includes('/2/') ? '4' : '5', publicationStatus: 'DRAFT' }]
    else if (p === '/factor-versions/4') data = { id: '4', dsl: legacyDsl, publicationStatus: 'DRAFT' }
    else if (p === '/factor-versions/5') data = { id: '5', dsl: { definitionType: 'SQL', sqlTemplate: 'SELECT COUNT(*) FROM visit', calculationMode: 'STATIC' }, publicationStatus: 'DRAFT' }
    else if (p === '/factors/4') data = { id: '4', code: 'SQL_TEMPORAL', name: 'SQL时序因子', currentPublishedVersionId: '6', status: 'PUBLISHED' }
    else if (p === '/factors/4/versions') data = [{ id: '6', versionNo: 1, status: 'PUBLISHED' }]
    else if (p === '/factor-versions/6') data = { id: '6', currentArtifactId: '22', status: 'PUBLISHED', dsl: { definitionType: 'SQL', sqlTemplate: 'SELECT COUNT(*) FROM visit b JOIN diagnosis d ON b.id=d.visit_id', periodColumn: 'd.diagnosis_time', calculationMode: 'TEMPORAL' } }
    else if (p === '/factors/5') data = { id: '5', code: 'DERIVED_TEST', name: '复合因子类别测试', draftVersionId: '7', status: 'DRAFT' }
    else if (p === '/factors/5/versions') data = [{ id: '7', versionNo: 1, publicationStatus: 'DRAFT' }]
    else if (p === '/factor-versions/7') data = { id: '7', publicationStatus: 'DRAFT', dsl: { schemaVersion: '1.1', dslType: 'FACTOR', definitionKind: 'DERIVED', calculationMode: 'STATIC', primaryDomain: { domainCode: 'VISIT' }, expression: { nodeType: 'BINARY', operator: 'ADD', left: { nodeType: 'FACTOR_REF', factorVersionId: '6', alignmentPolicy: 'STRICT_EQUAL' }, right: { nodeType: 'CONST', value: '1' } }, output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: 'COUNT', unit: 'COUNT', grain: [] } } }
    else if (p === '/factor-versions/3/compile') data = { artifactId: '23', status: 'VALID' }
    else if (p === '/compile-artifacts/23') data = { logicalPlan: {}, parameters: [] }
    else if (p === '/factor-versions/3/trial-period-recommendation') data = { availabilityStatus: 'AVAILABLE', recommendedPeriodStart: '2026-03-01T00:00:00', recommendedPeriodEnd: '2026-04-01T00:00:00' }
    else if (p === '/compile-artifacts/22') data = { logicalPlan: { periodBinding: { tableAlias: 'd', physicalTable: 'diagnosis', physicalColumn: 'diagnosis_time', expression: 'd.diagnosis_time' } } }
    else if (p === '/factor-versions/6/compile') data = { artifactId: '22', status: 'VALID' }
    else if (p === '/factor-versions/6/trial-period-recommendation') data = { availabilityStatus: 'NO_DATA' }
    return new Response(JSON.stringify({ code: '0', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

const appPort = Number(process.env.FACTOR_EDITOR_PORT || 41771), debugPort = 41772
const profile = await mkdtemp(join(tmpdir(), 'idmp-factor-physical-e2e-'))
const server = process.env.FACTOR_EDITOR_PORT ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let chrome, cdp
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser acceptance condition timed out') }
async function evaluate(expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
async function click(expression) {
  await evaluate(`(${expression}).scrollIntoView({block:'center',behavior:'instant'})`)
  await delay(150)
  const point = await evaluate(`(() => { const r=(${expression}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2} })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
const button = label => `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(label)})`
async function choose(selector, text) {
  await click(selector)
  const option = `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.includes(${JSON.stringify(text)})&&el.getBoundingClientRect().height>0)`
  await waitFor(() => evaluate(`!!(${option})`))
  await click(option)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await delay(200)
}
async function fixture() {
  await evaluate(`(() => {let component=document.querySelector('.factor-editor').__vueParentComponent;while(component&&component.type.__name!=='FactorEditor')component=component.parent;window.__factorFixture=component.setupState})()`)
}
try {
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } })
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item=>item.type==='page'); return !!target } catch { return false } })
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/new` })
  await waitFor(()=>evaluate(`!!document.querySelector('.definition-kind-selector')`))
  assert.match(await evaluate(`document.querySelector('input[aria-label="因子编码"]').value`), /^FACTOR_[0-9A-F]{32}$/)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="因子编码"]').disabled`), false)
  await evaluate(`(() => {const input=document.querySelector('input[aria-label="因子编码"]');input.value='FACTOR_MANUAL_CODE';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  assert.equal(await evaluate(`document.querySelector('.definition-kind-selector').closest('section').querySelector('h2').textContent`), '基础信息')
  assert.equal(await evaluate(`document.querySelector('.definition-kind-selector .is-active').textContent`), '原子因子')
  await click(`document.querySelectorAll('.definition-kind-selector .el-radio-button')[1]`)
  await waitFor(()=>evaluate(`!!document.querySelector('[aria-label="复合因子定义"]')`))
  assert.equal(await evaluate(`document.querySelector('.definition-kind-selector .is-active').textContent`), '复合因子')
  await mkdir('.tmp/factor-physical-browser', { recursive: true })
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport,deviceScaleFactor:1})
    await delay(150)
    await writeFile(`.tmp/factor-physical-browser/category-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    const categoryLayout=await evaluate(`(() => {const items=[...document.querySelectorAll('.definition-kind-selector .el-radio-button__inner')];return {viewport:innerWidth,items:items.map(el=>{const r=el.getBoundingClientRect();return {height:r.height,width:r.width,left:r.left,right:r.right,background:getComputedStyle(el).backgroundColor}})}})()`)
    assert.ok(categoryLayout.items.every(r=>r.height===30&&r.width>100&&r.left>=0&&r.right<=categoryLayout.viewport),JSON.stringify(categoryLayout))
    assert.ok(categoryLayout.items[0].right<categoryLayout.items[1].left,JSON.stringify(categoryLayout))
    assert.notEqual(categoryLayout.items[0].background,categoryLayout.items[1].background)
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await click(`document.querySelectorAll('.definition-kind-selector .el-radio-button')[0]`)
  await waitFor(()=>evaluate(`!!document.querySelector('.caliber-section')`))
  await waitFor(()=>evaluate(`!!document.querySelector('.factor-editor')`)); await fixture()
  for (const [templateId, versionId] of [['', ''], ['', '3'], ['10', ''], ['10', '3']]) {
    await evaluate(`window.__factorFixture.template.templateId=${JSON.stringify(templateId)};window.__factorFixture.workflow.versionId=${JSON.stringify(versionId)}`)
    await delay(30)
    const numbers = await evaluate(`Array.from(document.querySelectorAll('.factor-editor .editor-section > .section-title > span:first-child')).map(el=>el.textContent.trim())`)
    assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => String(i + 1)), `Section numbering: template=${templateId}, version=${versionId}`)
    const modeNumber = await evaluate(`Array.from(document.querySelectorAll('.factor-editor > .editor-section')).find(el=>el.querySelector('h2')?.textContent==='计算模式').querySelector('.section-title > span').textContent.trim()`)
    assert.equal(modeNumber, String(5 + Number(Boolean(templateId))))
  }
  await mkdir('.tmp/factor-physical-browser', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    for (const status of ['DRAFT', 'PUBLISHED']) {
      await evaluate(`window.__factorFixture.template.templateId='';window.__factorFixture.workflow.versionId='3';window.__factorFixture.workflow.status=${JSON.stringify(status)};window.__factorFixture.workflow.published=${status === 'PUBLISHED'}`)
      await waitFor(() => evaluate(`(() => { const tag=document.querySelector('.workflow-section .section-title .el-tag'); return !!tag && !Array.from(tag.classList).some(name=>name.includes('enter-')) })()`))
      const header = await evaluate(`(() => {
        const heading = document.querySelector('.workflow-section .section-title');
        const number = heading.querySelector('.section-number');
        const tag = heading.querySelector('.el-tag');
        const style = getComputedStyle(tag), bounds = tag.getBoundingClientRect(), circle = number.getBoundingClientRect();
        return { text: tag.textContent.trim(), type: tag.className, background: style.backgroundColor,
          radius: style.borderRadius, width: bounds.width, height: bounds.height,
          circleWidth: circle.width, circleHeight: circle.height, circleBackground: getComputedStyle(number).backgroundColor,
          overlap: bounds.left < circle.right, overflow: document.documentElement.scrollWidth > innerWidth };
      })()`)
      assert.equal(header.text, status === 'PUBLISHED' ? '已发布' : '草稿')
      assert.match(header.type, status === 'PUBLISHED' ? /el-tag--success/ : /el-tag--info/)
      assert.notEqual(header.background, header.circleBackground)
      assert.notEqual(header.radius, '50%')
      assert.ok(header.width > 28, JSON.stringify(header))
      assert.equal(header.circleWidth, 28)
      assert.equal(header.circleHeight, 28)
      assert.equal(header.overlap, false)
      assert.equal(header.overflow, false)
    }
    await evaluate(`document.querySelector('.workflow-section').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy(0,-90)`)
    await writeFile(`.tmp/factor-physical-browser/workflow-${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate(`window.__factorFixture.template.templateId='';window.__factorFixture.workflow.versionId='';window.__factorFixture.workflow.status='DRAFT';window.__factorFixture.workflow.published=false`)
  await click(`Array.from(document.querySelectorAll('[aria-label="取数方式"] .el-radio-button')).find(el=>el.textContent.trim()==='数据域取数')`)
  await choose(`document.querySelector('.form-block .el-select')`, '住院数据域')
  await choose(`document.querySelectorAll('.form-block .el-select')[1]`, '住院记录')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===3`))
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), '')
  assert.deepEqual(await evaluate(`window.__factorFixture.fields.map(f=>[f.code,f.kind])`), [['in_date','DATETIME'],['dept_code','VALUE_SET'],['fee','NUMBER']])
  await choose(`document.querySelector('.time-binding .el-select')`, 'visit.in_date')
  await evaluate(`window.__factorFixture.basicForm.name='单表测试'`)
  await click(button('保存草稿并继续'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors'&&r.method==='POST')`))
  const created = await evaluate(`window.__factorRequests.find(r=>r.path==='/factors'&&r.method==='POST').body.dsl`)
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors'&&r.method==='POST').body.code`), 'FACTOR_MANUAL_CODE')
  assert.deepEqual(created.primaryDomain, { domainCode: 'VISIT', tableName: 'visit' })
  assert.equal(created.periodColumn, 'in_date')
  assert.deepEqual(created.filters, { nodeType: 'TRUE' })
  await waitFor(()=>evaluate(`location.pathname==='/factor/edit/1'&&document.querySelector('.page-toolbar')?.textContent.includes('保存修改')`))
  await delay(300); await fixture()
  assert.equal(await evaluate(`document.querySelector('input[aria-label="因子编码"]').disabled`), true)
  await waitFor(()=>evaluate(`document.activeElement?.id==='factor-workflow'`))
  const continuation = await evaluate(`(() => {
    const workflow=document.querySelector('#factor-workflow'), period=workflow.querySelector('.trial-period-card'), actions=workflow.querySelector('.workflow-actions');
    const mode=[...document.querySelectorAll('.editor-section')].find(el=>el.querySelector('h2')?.textContent==='计算模式'), save=document.querySelector('.editor-actions-bar');
    const rect=workflow.getBoundingClientRect(), button=actions.querySelector('button').getBoundingClientRect();
    return { modeBeforeSave:!!(mode.compareDocumentPosition(save)&Node.DOCUMENT_POSITION_FOLLOWING), saveBeforeWorkflow:!!(save.compareDocumentPosition(workflow)&Node.DOCUMENT_POSITION_FOLLOWING), periodBeforeActions:!!(period.compareDocumentPosition(actions)&Node.DOCUMENT_POSITION_FOLLOWING), top:rect.top, buttonBottom:button.bottom, height:innerHeight };
  })()`)
  assert.equal(continuation.modeBeforeSave, true)
  assert.equal(continuation.saveBeforeWorkflow, true)
  assert.equal(continuation.periodBeforeActions, true)
  assert.ok(continuation.top>=64 && continuation.top<continuation.height, JSON.stringify(continuation))
  assert.ok(continuation.buttonBottom<continuation.height, JSON.stringify(continuation))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true })
  await evaluate(`window.scrollTo(0,0);window.__factorFixture.focusWorkflow()`)
  await delay(100)
  assert.equal(await evaluate(`(() => {const r=document.querySelector('.workflow-actions button').getBoundingClientRect();return r.top>=64&&r.bottom<=innerHeight})()`), true, '手机保存后编译按钮直接可见')
  await writeFile('.tmp/factor-physical-browser/continue-mobile.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format:'png' })).data,'base64'))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false })
  // A user-selected period must survive compilation and the backend recommendation.
  await evaluate(`window.__factorFixture.trialPeriod=['2026-01-01T00:00:00','2026-02-01T00:00:00'];window.__factorFixture.onTrialPeriodChange(window.__factorFixture.trialPeriod)`)
  await click(button('编译并校验'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factor-versions/3/trial-period-recommendation')`))
  await waitFor(()=>evaluate(`!window.__factorFixture.loading.recommendation`))
  assert.deepEqual(await evaluate(`Array.from(window.__factorFixture.trialPeriod)`), ['2026-01-01T00:00:00','2026-02-01T00:00:00'])
  assert.equal(await evaluate(`window.__factorFixture.trialPeriodSource`), 'USER')
  await click(button('添加关联表'))
  await waitFor(()=>evaluate(`!!document.querySelector('.join-mode')`))
  assert.equal(await evaluate(`document.querySelector('.join-mode .is-checked').textContent`), '复用已有表关系')
  assert.equal(await evaluate(`!!document.querySelector('.inline-relation-editor')`), false)
  await choose(`document.querySelector('.join-row .el-select')`, 'diagnosis（LEFT')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  assert.match(await evaluate(`document.querySelector('.join-target').textContent`), /关联到diagnosis左关联 · 多对一/)
  await choose(`document.querySelector('.time-binding .el-select')`, 'diagnosis.diagnosis_time')
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'join1.diagnosis_time')
  assert.doesNotMatch(await evaluate(`document.querySelector('.time-binding .el-select').textContent`), /join1\./)
  await click(`Array.from(document.querySelectorAll('.measure-card')).find(el=>el.textContent.includes('去重计数'))`)
  await choose(`document.querySelector('.measure-field .el-select')`, '住院号（visit_id）')
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  await evaluate(`window.__factorFixture.filters.children.push({nodeType:'PREDICATE',fieldCode:'dept_code',operator:'IN_VALUE_SET',itemCodes:['D1']});window.__factorFixture.scopeMode='FILTERED'`)
  await click(button('保存修改'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors/1'&&r.method==='PATCH')`))
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl.filters.children[0].valueSetVersionId`), '91')
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl.periodColumn`), 'join1.diagnosis_time')
  // Reload an existing temporal join draft, independently of the created fixture.
  await evaluate(`window.__restoreOriginalDsl()`)
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/1` })
  await waitFor(()=>evaluate(`document.querySelector('.join-target strong')?.textContent==='diagnosis'`)); await fixture()
  assert.equal(await evaluate(`document.querySelector('.definition-kind-selector')`),null)
  assert.equal(await evaluate(`document.querySelector('[aria-label="当前因子类别"]').textContent`),'原子因子')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  assert.deepEqual(await evaluate(`Array.from(window.__factorFixture.dslForm.groupBy)`), ['dept_code','join1.diagnosis'])
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'in_date')
  assert.equal(await evaluate(`window.__factorFixture.scopeMode`), 'ALL')
  assert.match(await evaluate(`document.body.innerText`), /diagnosis（LEFT · MANY_TO_ONE）/)
  await choose(`document.querySelector('.join-row .el-select')`, 'diagnosis（LEFT')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  await click(button('保存修改'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors/1'&&r.method==='PATCH')`))
  const updated = await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl`)
  assert.deepEqual(updated.aggregation.fieldRef, { sourceAlias: 'join1', fieldCode: 'visit_id' })
  assert.deepEqual(updated.joins, [{ relationId: '100', fromAlias: 'base', sourceAlias: 'join1' }])
  assert.equal(updated.missingRowPolicy, 'ZERO')
  assert.equal(updated.periodColumn, 'in_date')
  assert.deepEqual(updated.filters, { nodeType: 'TRUE' })
  assert.deepEqual(updated.groupBy, ['dept_code', { sourceAlias: 'join1', fieldCode: 'diagnosis' }])
  // 直接在关联区域配置，无需提前登记关系；校验和发布失败可继续使用原草稿。
  await delay(800)
  await click(`document.querySelector('.join-row-actions button[title="删除关联表"]')`)
  await waitFor(()=>evaluate(`window.__factorFixture.joins.length===0`))
  await click(button('添加关联表'))
  await waitFor(()=>evaluate(`!!document.querySelector('.join-mode')`))
  await click(`Array.from(document.querySelectorAll('.join-mode .el-radio')).find(el=>el.textContent.trim()==='创建并使用新表关系')`)
  await waitFor(()=>evaluate(`!!document.querySelector('.inline-relation-editor')&&!window.__factorFixture.loading.relations`))
  assert.equal(await evaluate(`!!document.querySelector('.join-reuse')`), false)
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`document.querySelector('.inline-relation-editor .el-alert')?.textContent.includes('物理表')`))
  await choose(`document.querySelectorAll('.relation-settings .el-select')[1]`, '诊断记录')
  await choose(`document.querySelectorAll('.relation-settings .el-select')[3]`, '多对一')
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[0]`, 'visit.fee')
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[1]`, 'diagnosis.visit_id')
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`document.querySelector('.inline-relation-editor .el-alert')?.textContent.includes('类型不一致')`))
  assert.equal(await evaluate(`window.__factorRequests.filter(r=>r.path==='/meta/physical-table-relations'&&r.method==='POST').length`), 0)
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[0]`, 'visit.dept_code')
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[1]`, 'diagnosis.diagnosis ·')
  await click(button('添加字段'))
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[2]`, 'visit.in_date')
  await choose(`document.querySelectorAll('.relation-key-row .el-select')[3]`, 'diagnosis.diagnosis_time')
  await click(`Array.from(document.querySelectorAll('.join-mode .el-radio')).find(el=>el.textContent.trim()==='复用已有表关系')`)
  await waitFor(()=>evaluate(`!!document.querySelector('.join-reuse')`))
  assert.equal(await evaluate(`document.querySelector('.inline-relation-editor').getBoundingClientRect().height`), 0)
  await click(`Array.from(document.querySelectorAll('.join-mode .el-radio')).find(el=>el.textContent.trim()==='创建并使用新表关系')`)
  assert.equal(await evaluate(`document.querySelectorAll('.relation-key-row').length`), 2)
  assert.match(await evaluate(`document.querySelectorAll('.relation-key-row .el-select')[0].textContent`), /visit.dept_code/)
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('.inline-relation-editor').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(150)
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`), false)
    const fits = await evaluate(`Array.from(document.querySelectorAll('.inline-relation-editor .el-select')).every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})`)
    assert.equal(fits, true)
    await writeFile(`.tmp/factor-physical-browser/inline-relation-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,mobile:false,deviceScaleFactor:1})
  await evaluate(`window.__rejectRelationValidation=true;window.__loseRelationCreateResponse=true`)
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`document.querySelector('.inline-relation-editor .el-alert')?.textContent.includes('暂时失败')`))
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`document.querySelector('.inline-relation-editor .el-alert')?.textContent.includes('关联字段未发布')`))
  assert.equal(await evaluate(`window.__factorFixture.joins[0].relationId`), '')
  assert.equal(await evaluate(`window.__factorRequests.filter(r=>r.path.endsWith('/101/publish')).length`), 0)
  await evaluate(`window.__rejectRelationValidation=false;window.__failRelationPublish=true`)
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`document.querySelector('.inline-relation-editor .el-alert')?.textContent.includes('暂时失败')`))
  assert.equal(await evaluate(`window.__factorFixture.joins[0].relationId`), '')
  await click(button('保存并使用关联'))
  await waitFor(()=>evaluate(`!document.querySelector('.inline-relation-editor')&&window.__factorFixture.joins[0].relationId==='101'&&window.__factorFixture.fields.length===6`))
  assert.equal(await evaluate(`window.__factorRequests.filter(r=>r.path==='/meta/physical-table-relations'&&r.method==='POST').length`), 1)
  const relationRequest = await evaluate(`window.__factorRequests.find(r=>r.path==='/meta/physical-table-relations'&&r.method==='POST').body`)
  assert.match(relationRequest.code, /^JOIN_[A-Fa-f0-9]{32}$/)
  assert.deepEqual(relationRequest.leftKeySpec, {fieldCodes:['DEPARTMENT','ADMISSION_TIME']})
  assert.deepEqual(relationRequest.rightKeySpec, {fieldCodes:['DIAGNOSIS','DIAGNOSIS_TIME']})
  await evaluate(`window.__factorRequests=[];window.__factorFixture.dslForm.aggregation='COUNT';window.__factorFixture.dslForm.fieldCode='';window.__factorFixture.dslForm.periodColumn='in_date'`)
  await click(button('保存修改'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors/1'&&r.method==='PATCH')`))
  assert.deepEqual(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl.joins`), [{relationId:'101',fromAlias:'base',sourceAlias:'join1'}])
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/1` })
  await waitFor(()=>evaluate(`document.querySelector('.join-target strong')?.textContent==='diagnosis'`)); await fixture()
  assert.equal(await evaluate(`window.__factorFixture.joins[0].relationId`), '101')
  assert.equal(await evaluate(`window.__factorRequests.some(r=>r.path.includes('semantic-tables')||r.path.includes('semantic-table-relations'))`), false)
  await mkdir('.tmp/factor-physical-browser', { recursive: true })
  await evaluate(`window.scrollTo(0,0)`)
  await writeFile('.tmp/factor-physical-browser/desktop.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  await writeFile('.tmp/factor-physical-browser/mobile.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/2` })
  await waitFor(()=>evaluate(`document.querySelector('.join-target strong')?.textContent==='diagnosis'`)); await fixture()
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  assert.deepEqual(await evaluate(`Array.from(window.__factorFixture.dslForm.groupBy)`), ['dept_code','join1.diagnosis'])
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'in_date')
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/5` })
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="当前因子类别"]')?.textContent==='复合因子'`))
  assert.equal(await evaluate(`document.querySelector('.definition-kind-selector')`),null)
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="复合因子定义"]')`),true)
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`window.scrollTo(0,0)`)
    await delay(150)
    await writeFile(`.tmp/factor-physical-browser/category-readonly-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/3` })
  await waitFor(()=>evaluate(`!!document.querySelector('[aria-label="原始 SQL"]')`))
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()==='保存修改').disabled`), false)
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/4` })
  await waitFor(()=>evaluate(`document.querySelector('.time-binding strong')?.textContent==='diagnosis.diagnosis_time'`)); await fixture()
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'd.diagnosis_time')
  assert.equal(await evaluate(`!!document.querySelector('.time-binding input')`), false)
  assert.equal(await evaluate(`window.__factorRequests.filter(r=>r.path==='/compile-artifacts/22').length`), 1)
  await evaluate(`window.__factorFixture.nativePeriodBinding=null;window.__factorFixture.workflow.published=false`)
  await waitFor(()=>evaluate(`document.querySelector('.time-binding strong')?.textContent.includes('尚未确认物理表')`))
  await evaluate(`window.__factorFixture.compileCurrentVersion()`)
  assert.equal(await evaluate(`document.querySelector('.time-binding strong').textContent`), 'diagnosis.diagnosis_time')
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'd.diagnosis_time')
  for (const viewport of [{ width:1440,height:1000,mobile:false }, { width:390,height:844,mobile:true }]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor:1 })
    await evaluate(`document.querySelector('.time-binding').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(100)
    await writeFile(`.tmp/factor-physical-browser/sql-period-${viewport.mobile?'mobile':'desktop'}.png`, Buffer.from((await cdp.send('Page.captureScreenshot', {format:'png'})).data,'base64'))
  }
  if (!process.env.FACTOR_EDITOR_ONLY) {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/new` })
  await waitFor(()=>evaluate(`!!document.querySelector('.editor-page')`))
  await evaluate(`(() => {let c=document.querySelector('.editor-page').__vueParentComponent;while(c&&c.type.__name!=='IndicatorEditor')c=c.parent;window.__indicator=c.setupState;window.__indicator.numeratorFactors=[{code:'SQL_FACTOR',name:'SQL 因子',versionId:'10',dsl:{definitionType:'SQL',periodColumn:'b.in_date'}}];window.__indicator.indicatorWorkflow.versionId='11'})()`)
  assert.equal(await evaluate(`window.__indicator.indicatorCalculationMode`), 'TEMPORAL')
  assert.equal(await evaluate(`window.__indicator.canPublishIndicatorVersion`), true)
  assert.equal(await evaluate(`window.__indicator.publishPanelDescription.includes('缺少统计周期')`), false)
  await evaluate(`window.__indicator.activeTab='formula'`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  assert.equal(await evaluate(`window.__factorRequests.filter(r=>r.path==='/indicator-versions/drill-capabilities').some(r=>r.body.drillPaths!==undefined)`), false, '候选字段自动加载不应提交下钻配置或标记预检完成')
  assert.equal(await evaluate(`window.__indicator.drillCapability.status`), 'idle')
  await evaluate(`window.__indicator.selectedDrillPaths=[{pathCode:'CUSTOM_TEST',pathName:'科室下钻',maxLevel:'DEPT',levels:[{levelCode:'ROOT',levelName:'全院'},{levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室'}]}]`)
  assert.deepEqual(await evaluate(`Array.from(window.__indicator.indicatorDimensionGrain)`), [])
  await waitFor(()=>evaluate(`document.querySelector('.bindings .bindings__field-select input')?.disabled===true`))
  await choose(`document.querySelector('.bindings .bindings__table-select')`, 'visit（base）')
  await choose(`document.querySelector('.bindings .bindings__field-select')`, 'dept_code')
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), 'base.dept_code', '不配置组合粒度且未手动预检时也能选择下钻字段')
  await choose(`document.querySelector('.bindings .bindings__table-select')`, 'diagnosis')
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), undefined, '切换物理表应清除旧字段映射')
  await click(`document.querySelector('.bindings .bindings__field-select')`)
  await waitFor(()=>evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.trim()==='department_id'&&el.getBoundingClientRect().height>0)`))
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).filter(el=>el.getBoundingClientRect().height>0).map(el=>el.textContent.trim())`), ['department_id'], '只展示所选物理表的字段')
  await click(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.trim()==='department_id'&&el.getBoundingClientRect().height>0)`)
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), 'join1.department_id')
  await choose(`document.querySelector('.bindings .bindings__table-select')`, 'visit（join2）')
  await choose(`document.querySelector('.bindings .bindings__field-select')`, 'dept_code')
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), 'join2.dept_code', '同表 JOIN 的引用不能被替换为主表引用')
  await choose(`document.querySelector('.bindings .bindings__table-select')`, 'visit（base）')
  await choose(`document.querySelector('.bindings .bindings__field-select')`, 'dept_code')
  await evaluate(`window.__indicator.factorDimensionBindings={'10':{科室:'join1.department_id'}}`)
  await waitFor(()=>evaluate(`document.querySelector('.bindings .bindings__table-select .el-select__placeholder')?.textContent.trim()==='diagnosis'`))
  await waitFor(()=>evaluate(`document.querySelector('.bindings .bindings__field-select .el-select__placeholder')?.textContent.trim()==='department_id'`))
  await evaluate(`document.querySelector('.bindings .bindings__field-select').dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))`)
  await click(`document.querySelector('.bindings .bindings__field-select .el-select__clear')`)
  await waitFor(()=>evaluate(`window.__indicator.factorDimensionBindings['10'].科室===undefined`))
  assert.equal(await evaluate(`document.querySelector('.bindings .bindings__table-select .el-select__placeholder')?.textContent.trim()`), 'diagnosis', '清空回显字段后应保留当前物理表')
  await choose(`document.querySelector('.bindings .bindings__table-select')`, 'visit（base）')
  await choose(`document.querySelector('.bindings .bindings__field-select')`, 'dept_code')
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('.bindings').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(150)
    const bounds = await evaluate(`(() => {const row=document.querySelector('.bindings__selectors');return [...row.children].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}})})()`)
    assert.ok(bounds.every(rect=>rect.width>0&&rect.left>=0&&rect.right<=viewport.width), '物理表和字段选择框不能超出视口')
    assert.ok(viewport.mobile ? bounds[1].top>=bounds[0].bottom : bounds[1].left>=bounds[0].right, '桌面并排、手机上下排列，不能重叠')
    await writeFile(`.tmp/factor-physical-browser/dimension-table-field-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await evaluate(`window.__indicator.selectedDrillPaths=[{pathCode:'CUSTOM_TEST',pathName:'科室医生下钻',maxLevel:'DOCTOR',levels:[{levelCode:'ROOT',levelName:'全院'},{levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室'},{levelCode:'DOCTOR',levelName:'医生',dimensionFieldCode:'医生'}]}];window.__indicator.indicatorDimensionGrain=['科室','病种']`)
  await waitFor(()=>evaluate(`document.querySelectorAll('.bindings').length===2`))
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.drill-field-bindings .el-form-item__label')).map(el=>el.textContent.trim())`), ['科室','医生'], '下钻区域只显示路径需要的字段')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.grain-field-bindings .el-form-item__label')).map(el=>el.textContent.trim())`), ['科室','病种'], '组合粒度区域只显示组合粒度字段')
  assert.equal(await evaluate(`document.querySelector('.drill-field-bindings h4').textContent`), '下钻字段映射')
  assert.equal(await evaluate(`document.querySelector('.grain-field-bindings h4').textContent`), '组合粒度字段映射')
  const headingStyles = await evaluate(`(() => {const style=selector=>{const el=document.querySelector(selector),css=getComputedStyle(el);return {fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight,color:css.color}};return {drill:style('.custom-paths__heading h3'),grain:style('.grouping-section__title'),drillMapping:style('.drill-field-bindings h4'),grainMapping:style('.grain-field-bindings h4'),nested:!!document.querySelector('[aria-label="下钻配置"] > .drill-field-bindings')&&!!document.querySelector('[aria-label="组合粒度配置"] > .grain-field-bindings')}})()`)
  assert.deepEqual(headingStyles.drill, headingStyles.grain, '下钻路径和组合粒度标题应使用一致的字号、字重、行高和颜色')
  assert.deepEqual(headingStyles.drillMapping, headingStyles.grainMapping, '两处字段映射的标题格式应一致')
  assert.ok(parseFloat(headingStyles.drillMapping.fontSize) < parseFloat(headingStyles.drill.fontSize), '字段映射标题字号应小于所属配置标题')
  assert.equal(headingStyles.nested, true, '字段映射应嵌套在各自的配置区域内')
  await choose(`document.querySelector('.grain-field-bindings .bindings__table-select')`, 'diagnosis')
  await waitFor(()=>evaluate(`document.querySelector('.drill-field-bindings .bindings__table-select .el-select__placeholder').textContent.trim()==='diagnosis'`))
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), undefined, '切换组合粒度的表也应清空共享维度的旧字段')
  await choose(`document.querySelector('.grain-field-bindings .bindings__field-select')`, 'department_id')
  await waitFor(()=>evaluate(`document.querySelector('.drill-field-bindings .bindings__field-select .el-select__placeholder').textContent.trim()==='department_id'`))
  await choose(`document.querySelector('.drill-field-bindings .bindings__table-select')`, 'visit（join2）')
  await waitFor(()=>evaluate(`document.querySelector('.grain-field-bindings .bindings__table-select .el-select__placeholder').textContent.trim()==='visit（join2）'`))
  await choose(`document.querySelector('.drill-field-bindings .bindings__field-select')`, 'dept_code')
  await waitFor(()=>evaluate(`document.querySelector('.grain-field-bindings .bindings__field-select .el-select__placeholder').textContent.trim()==='dept_code'`))
  assert.equal(await evaluate(`window.__indicator.factorDimensionBindings['10'].科室`), 'join2.dept_code', '两个入口修改同一份因子维度映射')
  assert.deepEqual(await evaluate(`Array.from(window.__indicator.customGroupingFields)`), ['科室','医生','病种'], '提交字段仍为两个配置的去重并集')
  for (const viewport of [{width:1440,height:1100,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('.grain-field-bindings').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(150)
    await writeFile(`.tmp/factor-physical-browser/separate-dimension-bindings-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await evaluate(`window.__indicator.indicatorDimensionGrain=['病种']`)
  await waitFor(()=>evaluate(`document.querySelectorAll('.grain-field-bindings .el-form-item').length===1`))
  assert.equal(await evaluate(`window.__indicator.activeFactorDimensionBindings()['10'].科室`), 'join2.dept_code', '从组合粒度移除科室不能丢弃下钻仍需的映射')
  await evaluate(`window.__indicator.selectedDrillPaths=[]`)
  await waitFor(()=>evaluate(`!document.querySelector('.drill-field-bindings')&&!!document.querySelector('.grain-field-bindings')`))
  await choose(`document.querySelector('.grain-field-bindings .bindings__table-select')`, 'visit（base）')
  await choose(`document.querySelector('.grain-field-bindings .bindings__field-select')`, 'dept_code')
  assert.deepEqual(await evaluate(`window.__indicator.activeFactorDimensionBindings()`), {'10':{病种:'base.dept_code'}}, '仅组合粒度时仅提交其有效映射')
  await evaluate(`window.__indicator.selectedDrillPaths=[{pathCode:'CUSTOM_TEST',pathName:'科室下钻',maxLevel:'DEPT',levels:[{levelCode:'ROOT',levelName:'全院'},{levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室'}]}];window.__indicator.indicatorDimensionGrain=[]`)
  await waitFor(()=>evaluate(`!!document.querySelector('.drill-field-bindings')&&!document.querySelector('.grain-field-bindings')`))
  await choose(`document.querySelector('.drill-field-bindings .bindings__table-select')`, 'visit（base）')
  await choose(`document.querySelector('.drill-field-bindings .bindings__field-select')`, 'dept_code')
  await evaluate(`window.__failNextFieldLoad=true;window.__indicator.numeratorFactors=[{code:'NEW_FACTOR',name:'新因子',versionId:'20'}]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='error'`))
  await waitFor(()=>evaluate(`document.querySelector('.bindings input[role="combobox"]')?.disabled===true`))
  await click(button('重新加载'))
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  assert.deepEqual(await evaluate(`Array.from(window.__indicator.factorFieldState.factorVersionIds)`), ['20'])
  await evaluate(`window.__delayNextFieldLoad=700;window.__indicator.numeratorFactors=[{code:'OLD_FACTOR',versionId:'30'}]`)
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/indicator-versions/drill-capabilities'&&r.body.formula.root.factorVersionId==='30')`))
  assert.equal(await evaluate(`window.__indicator.factorFieldState.status`), 'loading')
  await evaluate(`window.__indicator.numeratorFactors=[{code:'LATEST_FACTOR',versionId:'40'}]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  await delay(800)
  assert.deepEqual(await evaluate(`Array.from(window.__indicator.factorFieldState.factorVersionIds)`), ['40'], '旧请求晚返回不能覆盖新因子的候选字段')
  await evaluate(`window.__indicator.numeratorFactors=[{code:'COMPOSITE_FACTOR',versionId:'COMPOSITE'}]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  assert.deepEqual(await evaluate(`window.__indicator.dimensionBindingFactors.map(item=>item.versionId)`), ['LEAF_A','LEAF_B'], '复合因子应映射原子依赖的物理字段')
  await evaluate(`window.__indicator.numeratorFactors=[];window.__indicator.denominatorFactors=[]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='idle'`))
  assert.deepEqual(await evaluate(`Array.from(window.__indicator.factorFieldState.fieldOptions)`), [])
  assert.equal(await evaluate(`document.querySelector('.bindings')?.textContent.includes('尚未选择因子')`), true)
  await evaluate(`window.__indicator.numeratorFactors=[{code:'SQL_FACTOR',name:'SQL 因子',versionId:'10',dsl:{definitionType:'SQL',periodColumn:'b.in_date'}}];window.__indicator.denominatorFactors=[{code:'DENOMINATOR',name:'分母',versionId:'20'}]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  await choose(`document.querySelectorAll('.bindings .bindings__field-select')[1]`, 'dept_code')
  await click(button('预检系统默认下钻能力'))
  await waitFor(()=>evaluate(`window.__indicator.drillCapability.status==='ready'`))
  const checkedMapping = await evaluate(`window.__factorRequests.find(r=>r.path==='/indicator-versions/drill-capabilities'&&r.body.drillPaths?.length)`)
  assert.equal(checkedMapping.body.formula.root.operator, 'DIV')
  assert.deepEqual(checkedMapping.body.factorDimensionBindings, { '10': { 科室: 'base.dept_code' }, '20': { 科室: 'base.dept_code' } }, '配置完成后的预检应包含真实公式和逐因子映射')
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="下钻配置"] [aria-label="自定义路径校验结果"]')`), true, '自定义路径校验属于自定义下钻配置')
  const customResult = await evaluate(`document.querySelector('[aria-label="自定义路径校验结果"] .el-table').innerText`)
  const defaultResult = await evaluate(`document.querySelector('[aria-label="系统默认下钻能力预检"] .el-table').innerText`)
  assert.ok(customResult.includes('科室下钻')&&customResult.includes('校验通过')&&customResult.includes('科室'))
  assert.ok(!defaultResult.includes('科室下钻'), '系统默认预检不应混入自定义路径')
  assert.ok(defaultResult.includes('缺少默认组织维度'), '系统默认路径仍展示限制原因')
  assert.equal(await evaluate(`document.querySelector('[aria-label="自定义路径校验结果"] input[type="checkbox"]')`), null, '自定义路径结果不再重复提供启用开关')
  await evaluate(`window.__indicator.drillCapability.dimensions=window.__indicator.drillCapability.dimensions.map(row=>row.pathCode==='CUSTOM_TEST'?{...row,maxLevel:'ROOT',limitingFactors:[{factorVersionId:'10',reason:'医生字段尚未映射'}]}:row)`)
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="自定义路径校验结果"] .el-table').innerText.includes('未完全支持')`))
  assert.ok((await evaluate(`document.querySelector('[aria-label="自定义路径校验结果"] .el-table').innerText`)).includes('全院'), '自定义层级显示业务名称，而非内部层级编码')
  await click(button('校验自定义路径'))
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="自定义路径校验结果"] .el-table')?.innerText.includes('校验通过')`))
  for (const viewport of [{width:1440,height:1100,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('[aria-label="自定义路径校验结果"]').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(150)
    await writeFile(`.tmp/factor-physical-browser/custom-drill-validation-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await evaluate(`document.querySelector('[aria-label="系统默认下钻能力预检"]').scrollIntoView({block:'center',behavior:'instant'})`)
    await delay(150)
    await writeFile(`.tmp/factor-physical-browser/default-drill-preflight-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await evaluate(`window.__indicator.invalidateGroupingConfiguration()`)
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="自定义路径校验结果"]').innerText.includes('待重新校验')`))
  assert.ok((await evaluate(`document.querySelector('[aria-label="系统默认下钻能力预检"]').innerText`)).includes('待重新预检'))
  await evaluate(`window.__indicator.drillCapability.status='error';window.__indicator.drillCapability.errorMessage='下钻校验失败，请重试'`)
  await waitFor(()=>evaluate(`document.querySelector('[aria-label="自定义路径校验结果"]').innerText.includes('下钻校验失败，请重试')`))
  assert.ok((await evaluate(`document.querySelector('[aria-label="系统默认下钻能力预检"]').innerText`)).includes('下钻校验失败，请重试'))
  await evaluate(`window.__indicator.denominatorFactors=[];window.__indicator.selectedDrillPaths=[]`)
  await waitFor(()=>evaluate(`window.__indicator.factorFieldState.status==='ready'`))
  assert.equal(await evaluate(`document.querySelector('[aria-label="自定义路径校验结果"]')`), null, '没有自定义路径时不显示其校验区域')
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await waitFor(()=>evaluate(`document.querySelector('.factor-library__footer')?.getBoundingClientRect().height>0`))
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
    await waitFor(()=>evaluate(`parseFloat(getComputedStyle(document.querySelector('.factor-library__footer button')).paddingLeft)===${viewport.mobile?8:15}`))
    await evaluate(`document.querySelector('.factor-library__footer').scrollIntoView({block:'center',behavior:'instant'})`)
    const layout = await evaluate(`(() => {const footer=document.querySelector('.factor-library__footer'),buttons=footer.querySelectorAll('button');const a=buttons[0].getBoundingClientRect(),b=buttons[1].getBoundingClientRect();return {alignment:Math.abs(a.top+a.height/2-b.top-b.height/2),gap:b.left-a.right,width:footer.clientWidth,buttons:[...buttons].map(el=>({width:el.getBoundingClientRect().width,padding:getComputedStyle(el).padding,minWidth:getComputedStyle(el).minWidth})),wrapper:getComputedStyle(buttons[1].parentElement).minWidth}})()`)
    assert.ok(layout.alignment < 1, `因子操作按钮应水平居中对齐: ${JSON.stringify(layout)}`)
    assert.ok(Math.abs(layout.gap-12) < 1, '因子操作按钮间距应为 12px')
    await writeFile(`.tmp/factor-physical-browser/factor-actions-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  const generatedIndicatorCode = await evaluate(`document.querySelector('input[aria-label="指标编码"]').value`)
  assert.match(generatedIndicatorCode, /^INDICATOR_[0-9A-F]{32}$/)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="指标编码"]').disabled`), false)
  await evaluate(`Object.assign(window.__indicator.form,{name:'自动编码验收',definition:'自动编码验收定义',sources:['HIS']});window.__indicator.indicatorWorkflow.versionId='';window.__indicator.activeTab='basic'`)
  await click(button('保存基本信息'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/indicators'&&r.method==='POST')`))
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/indicators'&&r.method==='POST').body.code`), generatedIndicatorCode)
  await waitFor(()=>evaluate(`location.pathname==='/indicator/edit/200'`))
  assert.equal(await evaluate(`document.querySelector('input[aria-label="指标编码"]').disabled`), true)
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/new` })
  await waitFor(()=>evaluate(`!!document.querySelector('input[aria-label="指标编码"]')`))
  await evaluate(`(() => {let c=document.querySelector('.editor-page').__vueParentComponent;while(c&&c.type.__name!=='IndicatorEditor')c=c.parent;window.__indicator=c.setupState;Object.assign(window.__indicator.form,{name:'手动编码验收',definition:'手动编码验收定义',sources:['HIS']});const input=document.querySelector('input[aria-label="指标编码"]');input.value='INDICATOR_MANUAL_CODE';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await click(button('保存基本信息'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/indicators'&&r.method==='POST')`))
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/indicators'&&r.method==='POST').body.code`), 'INDICATOR_MANUAL_CODE')
  await waitFor(()=>evaluate(`location.pathname==='/indicator/edit/200'`))
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/200` })
  await waitFor(()=>evaluate(`document.querySelector('input[aria-label="指标编码"]')?.value==='INDICATOR_MANUAL_CODE'`))
  assert.equal(await evaluate(`document.querySelector('input[aria-label="指标编码"]').disabled`), true)
  await waitFor(()=>evaluate(`(() => {let c=document.querySelector('.editor-page').__vueParentComponent;while(c&&c.type.__name!=='IndicatorEditor')c=c.parent;return c.setupState.indicatorWorkflow.indicatorId==='200'&&!c.setupState.editLoadState.loading})()`))
  assert.equal(await evaluate(`document.querySelector('input[aria-label="指标编码"]').value`), 'INDICATOR_MANUAL_CODE')
  assert.equal(await evaluate(`document.querySelector('input[aria-label="指标编码"]').disabled`), true)
  }
  assert.deepEqual(cdp.errors, [])
  console.log('PASS: factor creation, configuration/save order, draft continuation on desktop/mobile, custom period preservation, JOIN hydration/save and SQL period display' + (process.env.FACTOR_EDITOR_ONLY ? '' : '; indicator integration'))
} catch (error) {
  if (cdp) await writeFile('.tmp/factor-physical-browser/failure.png', Buffer.from((await cdp.send('Page.captureScreenshot', {format:'png'})).data,'base64'))
  if (cdp) console.error(await evaluate(`document.body.innerText`).catch(()=>''))
  throw error
} finally { cdp?.socket.close(); chrome?.kill(); server?.kill() }

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const directory = '.tmp/semantic-audit-20261023'
const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`))
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true })
const page = await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'})
const errors = [], requests = [], checks = [], snapshots = []
function check(name,passed,detail) { checks.push({name,passed,detail}); console.log(`${passed?'PASS':'FAIL'} ${name}${passed?'':` ${JSON.stringify(detail).slice(0,1500)}`}`) }
page.on('pageerror',error=>errors.push(error.message))
page.on('request',request=>{ if (request.url().includes('/api/v1/')) requests.push({url:request.url(),method:request.method(),body:request.postDataJSON()}) })
async function ready() {
  await page.getByTestId('dashboard-period-type').waitFor({timeout:90000})
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="binding-widget"]').length === 11 && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'),null,{timeout:90000})
  await page.waitForLoadState('networkidle')
}
async function fillDate(id,value) {
  const input = page.getByTestId(id).locator('input')
  await input.fill(`${value.slice(0,4)} 年 ${value.slice(5)} 月`)
  await input.press('Enter')
  await input.press('Tab')
}
async function choose(type,start,end) {
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option',{name:type,exact:true}).click()
  if (type === '月度') await fillDate('dashboard-period-month',start)
  else { await fillDate('dashboard-period-start',start); await fillDate('dashboard-period-end',end) }
  await page.getByTestId('dashboard-period-apply').click()
  await ready()
}
async function capture(tag) {
  const snapshot = await page.evaluate(async () => {
    let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
    while(component&&!component.setupState.remoteWidgetDatasets) component=component.parent
    const state = component.setupState
    const moduleUrl = performance.getEntriesByType('resource').find(entry=>/\/echarts\.js\?v=/.test(entry.name))?.name
    const echarts = await import(moduleUrl)
    const widgets = []
    for (const widget of document.querySelectorAll('[data-widget-id]')) {
      const id = widget.dataset.widgetId
      const charts = [...widget.querySelectorAll('.idmp-chart')].map(element=>{
        const option = echarts.getInstanceByDom(element)?.getOption()
        return { series:option?.series?.map(series=>({name:series.name,type:series.type,yAxisIndex:series.yAxisIndex,data:series.data})),x:option?.xAxis?.map(axis=>axis.data), y:option?.yAxis?.map(axis=>({type:axis.type,name:axis.name})),width:element.clientWidth,height:element.clientHeight }
      })
      widgets.push({id,text:widget.innerText,charts,dataset:state.remoteWidgetDatasets[id]})
    }
    return {widgets,period:state.remotePeriodSelection}
  })
  snapshots.push({tag,...snapshot})
  await writeFile(`${directory}/browser-${tag}.json`,JSON.stringify(snapshot,null,2))
  console.log(tag,JSON.stringify(snapshot.widgets.filter(widget=>widget.charts.length).map(widget=>({id:widget.id,series:widget.charts[0].series.map(series=>({name:series.name,first:series.data.slice(0,1),points:series.data.length}))}))).slice(0,6000))
  return snapshot
}
async function verify(tag,snapshot) {
  const source = oracle[tag]
  for (const [id,key] of [['dashboard-widget-1790681712300-4','mortality'],['dashboard-widget-1791798674947-4','transfer'],['dashboard-widget-1791875881995-2','tcm']]) {
    const widget = snapshot.widgets.find(item=>item.id===id)
    for (const [index,point] of widget.charts[0].series[0].data.entries()) {
      const code = point.dimensionValues?.out_dept_code ?? point.dimensionValues?.['科室']
      const rows = (key === 'transfer' ? source.transferDepartments : source.departments).filter(row=>row.code === code)
      const rawName = point.dimensionValues?.OUT_DEPT_NAME
      const row = rows.find(row=>row.name===rawName) || (rows.length===1 ? rows[0] : null)
      assert.ok(row,`${tag}/${key}/${code}: missing independent source row`)
      const numerator = Number(key==='mortality' ? row.deaths : key==='transfer' ? row.transfers : row.chineseCost)
      const denominator = Number(key==='mortality' ? row.discharged : key==='transfer' ? row.admissions : row.drugCost)
      const expected = denominator ? numerator/denominator : null
      check(`chart-${tag}-${key}-${index}-source-value`,Math.abs(point.value-expected)<=1e-8,{actual:point.value,expected})
    }
  }
  for (const [id,key] of [['dashboard-widget-1790681716574-5','mortality'],['dashboard-widget-1792310106913-3','tcm']]) {
    const widget = snapshot.widgets.find(item=>item.id===id)
    const tags = tag==='Jan' ? ['Jan'] : ['Jan','Feb','Mar']
    const expected = tags.map(tag=>key==='mortality' ? Number(oracle[tag].ba.deaths)/Number(oracle[tag].ba.discharged) : Number(oracle[tag].ba.chineseCost)/Number(oracle[tag].ba.drugCost))
    check(`chart-${tag}-${key}-monthly-trend-source`,widget.charts[0].series[0].data.length===expected.length && widget.charts[0].series[0].data.every((value,index)=>Math.abs(value-expected[index])<=1e-8),{actual:widget.charts[0].series[0].data,expected})
    if(key==='tcm') check(`chart-${tag}-tcm-dual-axis`,widget.charts[0].series[1].data.every((value,index)=>Math.abs(value-Number(oracle[tags[index]].ba.chineseCost))<0.005)&&widget.charts[0].series[1].yAxisIndex===1,widget.charts[0].series[1])
  }
  const mortality = snapshot.widgets.find(item=>item.id==='dashboard-widget-1790681712300-4')
  checks.push({name:`observation-${tag}-zero-departments-hidden`,passed:true,detail:{chartRows:mortality.charts[0].series[0].data.length,resultRows:mortality.dataset.rows.length,behavior:'Existing explicit engine behavior; requires a product decision, not a numerical regression.'}})
  const tcm = snapshot.widgets.find(item=>item.id==='dashboard-widget-1791875881995-2')
  const missingNames = tcm.charts[0].series[0].data.filter(point=>String(point.name).startsWith('科室编码')).length
  const diagnostic = tcm.dataset.nameDiagnostics?.find(message=>message.includes('暂显示科室编码'))
  check(`presentation-${tag}-dictionary-diagnostic`,!diagnostic || Number(diagnostic.match(/^\d+/)?.[0])===missingNames,{missingNames,diagnostic})
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await ready()
  await choose('月度','2026-01')
  await verify('Jan',await capture('Jan'))
  const warningText = await page.locator('[data-widget-id="dashboard-widget-1791890122387-2"]').innerText()
  check('presentation-nested-warning-card',!/阈值\s*-/.test(warningText),{actual:warningText,expected:'The condition tree is available; null scalar threshold must not be shown as an unexplained dash.'})
  const table = page.locator('[data-widget-id="dashboard-widget-1790681721550-6"]')
  const respiratory = table.locator('tbody tr').filter({hasText:'呼吸与危重症医学科'}).first()
  const actual = await respiratory.locator('td').last().innerText()
  check('presentation-table-percent-format',actual==='0.23%',{department:'呼吸与危重症医学科',source:{deaths:1,discharged:429},expected:'0.23%',actual})
  await table.screenshot({path:`${directory}/mortality-table.png`})
  await choose('自定义区间','2026-01','2026-03')
  await verify('Q1',await capture('Q1'))
  await choose('自定义区间','2026-01','2026-02')
  const custom = await capture('JanFeb')
  for (const id of ['dashboard-widget-1790681694636-1','dashboard-widget-1791798674947-4','dashboard-widget-1791875881995-2']) {
    const widget = custom.widgets.find(widget=>widget.id===id)
    assert.match(widget.text,/暂不支持整体结果查询/)
    assert.equal(widget.charts.length,0)
  }
  checks.push({name:'non-calendar interval never displays last month as interval total',passed:true})
  await choose('月度','2026-05')
  const empty = await capture('May')
  assert.equal(empty.widgets.reduce((count,widget)=>count+widget.charts.length,0),0)
  checks.push({name:'no-data month clears every previous chart',passed:true})
  await choose('月度','2026-01')
  await capture('Jan-restored')
  assert.deepEqual(errors,[])
  assert.deepEqual(requests.filter(request=>request.method!=='GET'&&!/\/(query|search|filter-options)$/.test(request.url)),[])
  await page.screenshot({path:`${directory}/dashboard-desktop.png`,fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await ready()
  await page.screenshot({path:`${directory}/dashboard-mobile.png`,fullPage:true})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
} finally {
  await writeFile(`${directory}/browser-summary.json`,JSON.stringify({checks,errors,requests},null,2))
  await browser.close()
}
if (checks.some(check => !check.passed)) process.exitCode = 1

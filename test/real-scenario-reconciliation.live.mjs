import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
import { projectedDrillNavigation } from '../src/idmp/features/dashboard/backendChartDrill.js'

const exec = promisify(execFile)
const base = `${process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'}/api/v1`
const directory = '.tmp/semantic-audit-20261023'
await mkdir(directory, { recursive: true })
const checks = [], calls = []
const save = (name, value) => writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2))
async function api(path, body) {
  const started = performance.now()
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) })
  const payload = parse(await response.text())
  calls.push({ path, body, http: response.status, ms: Math.round(performance.now() - started) })
  if (!response.ok || !['OK', '0', 'ACCEPTED'].includes(String(payload.code))) {
    const error = new Error(`${path}: ${response.status} ${payload.message}`)
    error.status = response.status
    throw error
  }
  return payload.data
}
async function sql(database, query, columns) {
  assert.ok(['SOURCE', 'PLATFORM'].includes(database))
  assert.match(query.trim(), /^(SELECT|WITH)\b/i)
  const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`
  const { stdout } = await exec('ssh', ['lab-server', `python3 /home/tjg/idmp-deploy/inspect-departments.py ${database} ${quote(query)}`], { timeout: 120000, maxBuffer: 15 * 1024 * 1024 })
  return stdout.trimEnd().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('\t').map((value, index) => [columns[index], value === 'NULL' ? null : value])))
}
function check(name, passed, detail) {
  checks.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : ` ${JSON.stringify(detail).slice(0, 1000)}`}`)
}
async function run(name, action) {
  try { await action() } catch (error) { check(name, false, { error: error.message }) }
}
const specimens = [
  { key: 'mortality', id: '102027642460761108' }, { key: 'emergency', id: '102027642460335204' },
  { key: 'transfer', id: '102027642461313070' }, { key: 'tcm', id: '102027642462358147' },
  { key: 'male', id: '102027642463173248' }, { key: 'arithmetic', id: '102027642463192671' },
  { key: 'warning', id: '102027642463201862' }
]
const mode = process.argv[2] || 'survey'
const periods = [
  ['Jan', '2026-01-01', '2026-02-01', 'MONTHLY'], ['Feb', '2026-02-01', '2026-03-01', 'MONTHLY'],
  ['Mar', '2026-03-01', '2026-04-01', 'MONTHLY'], ['Apr', '2026-04-01', '2026-05-01', 'MONTHLY'],
  ['Q1', '2026-01-01', '2026-04-01', 'QUARTERLY'], ['JanFeb', '2026-01-01', '2026-03-01', 'MONTHLY'],
  ['Year2025', '2025-01-01', '2026-01-01', 'YEARLY'], ['May', '2026-05-01', '2026-06-01', 'MONTHLY']
]
function near(a, b, tolerance = 1e-8) { return a === null || b === null ? a === b : Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= tolerance }
if (mode === 'survey') {
  const catalog = []
  for (const specimen of specimens) await run(`survey-${specimen.key}`, async () => {
    const indicator = await api(`/indicators/${specimen.id}`)
    const versionsResponse = await api(`/indicators/${specimen.id}/versions`)
    const versions = Array.isArray(versionsResponse) ? versionsResponse : versionsResponse.items || versionsResponse.records || []
    const selected = versions.find(version => version.status === 'PUBLISHED') || versions[0]
    const versionId = selected?.id || indicator.metadataVersionId
    const version = versionId ? await api(`/indicator-versions/${versionId}`) : null
    const published = versions.some(version => version.status === 'PUBLISHED')
    const fields = published ? await api(`/analysis/dashboard-data-sources/${indicator.code}/fields`) : null
    const periods = published ? await api(`/analysis/dashboard-data-sources/${indicator.code}/available-periods`) : null
    const record = { ...specimen, code: indicator.code, indicator, versions, version, fields, periods }
    catalog.push(record)
    console.log(JSON.stringify({ key: specimen.key, name: indicator.name, code: indicator.code, versionId, versionKeys: Object.keys(version || {}) }))
  })
  await save('catalog', catalog)
  await save('dashboard', await api('/analysis/dashboards/1189225114584501123'))
  await save('rules', await api('/analysis/warning-rules?page=1&size=100'))
  await save('events', await api('/analysis/warnings?page=1&size=100'))
  const tables = await sql('SOURCE', 'SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()', ['table'])
  await save('source-tables', tables)
}
if (mode === 'factors') {
  const catalog = JSON.parse(await readFile(`${directory}/catalog.json`))
  const ids = new Set(catalog.flatMap(item => item.version.formulaDefinition.factors.map(factor => factor.factorVersionId)))
  const factors = []
  for (const id of ids) factors.push(await api(`/factor-versions/${id}`))
  await save('factors', factors)
  for (const factor of factors) console.log(JSON.stringify(factor))
}
if (mode === 'probe') {
  const catalog = JSON.parse(await readFile(`${directory}/catalog.json`))
  for (const item of catalog) await run(`analysis-${item.key}`, async () => {
    const query = new URLSearchParams({ indicatorVersionId: item.version.id, periodStart: '2026-01-01', periodEnd: '2026-04-01', sections: 'TREND', granularity: 'MONTHLY' })
    const path = `/analysis/indicators/${item.id}/analysis?${query}`
    if (item.version.status !== 'PUBLISHED') {
      await assert.rejects(() => api(path), error => error.status === 404)
      check(`analysis-${item.key}-unpublished-rejected`, true, { versionId: item.version.id, status: item.version.status })
      return
    }
    const result = await api(path)
    await save(`analysis-${item.key}`, result)
    console.log(item.key, JSON.stringify(result).slice(0, 1500))
  })
  const result = expandDashboardResponse(await api('/analysis/dashboards/1189225114584501123/query', { periodStart: '2026-01-01', periodEnd: '2026-02-01', granularity: 'MONTHLY', responseFormat: 'COLUMNAR', widgetCodes: ['dashboard-widget-1790681694636-1', 'dashboard-widget-1791798674947-4', 'dashboard-widget-1791875881995-2'] }))
  await save('dashboard-jan', result)
  for (const [key, value] of Object.entries(result.widgets)) console.log(key, JSON.stringify(value).slice(0, 6000))
  for (const id of ['102027642462321074', '102027642462321076']) console.log(JSON.stringify(await api(`/factor-versions/${id}`)))
  console.log(JSON.stringify(await sql('SOURCE', 'SELECT sex, COUNT(*) FROM vmq_basicinformationba GROUP BY sex', ['sex', 'count'])))
  console.log(JSON.stringify(await sql('PLATFORM', "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('rsl_indicator_result','rsl_result_set','rsl_active_result_ref','job_calc_target') ORDER BY table_name,ordinal_position", ['table','column'])))
}
if (mode === 'source') {
  const oracle = await readFile(`${directory}/source-oracle.json`).then(JSON.parse).catch(() => ({}))
  for (const [tag, start, end] of periods) {
    if (oracle[tag]) continue
    const baSelect = "COUNT(*) AS discharged, SUM(sex='1') AS male, SUM(out_status='4') AS deaths, SUM(chinese_patent_drugs_cost) + SUM(chinese_herbal_cost) AS chinese_cost, SUM(drug_cost) AS drug_cost, SUM(total_cost) AS total_cost, SUM(material_cost) AS material_cost, COUNT(DISTINCT VISIT_ID) AS visits"
    const baCols = ['discharged','male','deaths','chineseCost','drugCost','totalCost','materialCost','visits']
    const where = `out_date >= '${start}' AND out_date < '${end}'`
    const ba = await sql('SOURCE', `SELECT ${baSelect} FROM vmq_basicinformationba WHERE ${where}`, baCols)
    const departments = await sql('SOURCE', `SELECT out_dept_code,out_dept_name,${baSelect} FROM vmq_basicinformationba WHERE ${where} GROUP BY out_dept_code,out_dept_name`, ['code','name',...baCols])
    const transferWhere = `b.in_date >= '${start}' AND b.in_date < '${end}'`
    const transferJoin = 'vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON t.In_Hospital_ID=b.In_Hospital_ID'
    const transferCondition = `${transferWhere} AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48`
    // Keep each admission row's date/department attached while testing eligibility.
    const admissions = await sql('SOURCE', `SELECT COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b WHERE ${transferWhere}`, ['admissions'])
    const transfers = await sql('SOURCE', `SELECT COUNT(DISTINCT b.In_Hospital_ID) FROM ${transferJoin} WHERE ${transferCondition}`, ['transfers'])
    const transfer = [{ ...admissions[0], ...transfers[0] }]
    const transferDepartments = await sql('SOURCE', `SELECT b.out_dept_code,b.out_dept_name,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b WHERE ${transferWhere} GROUP BY b.out_dept_code,b.out_dept_name`, ['code','name','admissions'])
    const groupedTransfers = await sql('SOURCE', `SELECT b.out_dept_code,b.out_dept_name,COUNT(DISTINCT b.In_Hospital_ID) FROM ${transferJoin} WHERE ${transferCondition} GROUP BY b.out_dept_code,b.out_dept_name`, ['code','name','transfers'])
    for (const row of transferDepartments) row.transfers = groupedTransfers.find(item => item.code === row.code && item.name === row.name)?.transfers || '0'
    const surgery = await sql('SOURCE', `SELECT COUNT(*),SUM(SURGERY_CLASSFY='2') FROM vmq_surgeryinfo WHERE SURGERYSTARTTIME >= '${start}' AND SURGERYSTARTTIME < '${end}'`, ['total','emergency'])
    oracle[tag] = { start, end, granularity: periods.find(period => period[0] === tag)[3], ba: ba[0], departments, transfer: transfer[0], transferDepartments, surgery: surgery[0] }
    console.log(tag, JSON.stringify({ ba: ba[0], transfer: transfer[0], surgery: surgery[0], departments: departments.length, transferDepartments: transferDepartments.length }))
    await save('source-oracle', oracle)
  }
}
if (mode === 'matrix') {
  const definition = JSON.parse(await readFile(`${directory}/dashboard.json`))
  const metricWidgets = definition.version.widgets.filter(widget => widget.indicatorVersionId)
  const catalog = JSON.parse(await readFile(`${directory}/catalog.json`))
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`))
  for (const [tag, start, end, granularity] of periods) await run(`matrix-${tag}`, async () => {
    const result = expandDashboardResponse(await api('/analysis/dashboards/1189225114584501123/query', { periodStart:start, periodEnd:end, granularity, responseFormat:'COLUMNAR', widgetCodes:metricWidgets.map(widget => widget.code) }))
    await save(`dashboard-${tag}`, result)
    console.log(tag, Object.fromEntries(Object.entries(result.widgets).map(([id,x]) => [id, { status:x.status, rows:x.rows?.length, message:x.message }])))
    for (const widget of metricWidgets) {
      const data = result.widgets[widget.code]
      const configured = catalog.find(item => item.version.id === widget.indicatorVersionId)
      if (!data || data.status !== 'READY') {
        const storedPeriod = configured?.periods?.some(period => period.periodStart.slice(0,10) === start && period.periodEnd.slice(0,10) === end)
        check(`${tag}-${widget.code}-availability`, !storedPeriod || tag === 'May', {status:data?.status,message:data?.message,storedPeriod}); continue
      }
      if (tag === 'JanFeb' && widget.type !== 'LINE') {
        check(`${tag}-${widget.code}-not-an-interval-result`, data.rows.every(row => row.periodStart !== `${start}T00:00:00` || row.periodEnd !== `${end}T00:00:00`), {rows:data.rows.length})
        continue
      }
      if (tag === 'May') check(`${tag}-${widget.code}-not-fabricated`, !data.rows.some(row => Number(row.value) > 0), data.rows)
      const key = catalog.find(item => item.version.id === widget.indicatorVersionId)?.key
      if (!['mortality','transfer','tcm','emergency'].includes(key) || widget.type === 'LINE') continue
      const expected = oracle[tag]
      for (const [index,row] of data.rows.entries()) {
        let source
        if (widget.type === 'KPI') source = key === 'transfer' ? expected.transfer : key === 'emergency' ? expected.surgery : expected.ba
        else {
          const code = row.out_dept_code ?? row.OUT_DEPT_CODE ?? row['科室']
          const sourceRows = (key === 'transfer' ? expected.transferDepartments : expected.departments).filter(item => String(item.code) === String(code))
          const rawName = row.OUT_DEPT_NAME ?? row.out_dept_name ?? row['科室名称']
          source = sourceRows.find(item => item.name === rawName) || (sourceRows.length === 1 ? sourceRows[0] : null)
          if (!source && sourceRows.length > 1 && key !== 'transfer') source = Object.fromEntries(Object.keys(sourceRows[0]).filter(k => !['code','name'].includes(k)).map(k => [k, sourceRows.reduce((sum,item) => sum + Number(item[k]),0)]))
        }
        if (!source) { check(`${tag}-${key}-${index}-source-member`, false, { row }); continue }
        const numerator = key === 'mortality' ? source.deaths : key === 'transfer' ? source.transfers : key === 'tcm' ? source.chineseCost : source.emergency
        const denominator = key === 'mortality' ? source.discharged : key === 'transfer' ? source.admissions : key === 'tcm' ? source.drugCost : source.total
        const value = Number(denominator) === 0 ? null : Number(numerator)/Number(denominator)
        const ok = near(row.value,value,1e-8) && (row.numeratorValue == null || near(row.numeratorValue,numerator,0.005)) && (row.denominatorValue == null || near(row.denominatorValue,denominator,0.005))
        check(`${tag}-${key}-${widget.type}-${index}-source-value`, ok, {row,expected:{numerator,denominator,value}})
      }
    }
  })
  for (const item of catalog.filter(item => item.version.status === 'PUBLISHED')) {
    const analysis = JSON.parse(await readFile(`${directory}/analysis-${item.key}.json`))
    for (const point of analysis.trend) {
      const source = Object.values(oracle).find(period => period.start === point.periodStart.slice(0,10) && period.end === point.periodEnd.slice(0,10))
      const expected = item.key === 'mortality' ? Number(source.ba.deaths)/Number(source.ba.discharged) : item.key === 'transfer' ? Number(source.transfer.transfers)/Number(source.transfer.admissions) : item.key === 'tcm' ? Number(source.ba.chineseCost)/Number(source.ba.drugCost) : item.key === 'emergency' ? Number(source.surgery.emergency)/Number(source.surgery.total) : Number(source.ba.male)/Number(source.ba.discharged)
      check(`trend-${item.key}-${source.start}-oracle`, near(point.value,expected,1e-8), {point,expected})
    }
  }
}
if (mode === 'year-transfer-oracle') {
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`))
  const numerators = await sql('SOURCE', "SELECT b.out_dept_code,b.out_dept_name,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON b.In_Hospital_ID=t.In_Hospital_ID WHERE b.in_date>='2025-01-01' AND b.in_date<'2026-01-01' AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48 GROUP BY b.out_dept_code,b.out_dept_name", ['code','name','transfers'])
  for (const row of oracle.Year2025.transferDepartments) row.transfers = numerators.find(item => item.code === row.code && item.name === row.name)?.transfers || '0'
  await save('source-oracle',oracle)
}
if (mode === 'warnings') {
  const rules = JSON.parse(await readFile(`${directory}/rules.json`)).records.filter(rule => rule.code.includes('_R4_'))
  const allEvents = []
  for (let page = 1; page <= 30; page++) {
    const result = await api(`/analysis/warnings?page=${page}&size=100`)
    allEvents.push(...result.records)
    if (result.records.length < 100) break
  }
  await save('all-events', allEvents)
  const results = await sql('PLATFORM', "SELECT r.id,r.dimension_snapshot_json,r.result_value,r.numerator_value,r.denominator_value,r.calculation_period_start,r.calculation_period_end,JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.targetCode')) FROM rsl_indicator_result r JOIN job_calc_target t ON t.id=r.calc_target_id JOIN rsl_result_set s ON s.id=r.result_set_id WHERE s.calculation_batch_id=102027642463210782 AND r.indicator_version_id=102027642463201863 AND r.calculation_period_start='2026-04-01 00:00:00' AND r.calculation_period_end='2026-05-01 00:00:00'", ['id','dimensions','value','numerator','denominator','start','end','target'])
  for (const row of results) row.dimensions = JSON.parse(row.dimensions)
  await save('warning-results', results)
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`)).Apr
  const compare = (condition, value) => {
    if (condition.logic === 'AND') return condition.children.every(child => compare(child,value))
    if (condition.logic === 'OR') return condition.children.some(child => compare(child,value))
    if (condition.logic === 'NOT') return !compare(condition.children[0],value)
    const t = Number(condition.threshold), x = Number(value)
    return { GT: x>t, GTE:x>=t, LT:x<t, LTE:x<=t, EQ:x===t, NE:x!==t }[condition.operator]
  }
  for (const rule of rules) {
    const scope = rule.version.scopePolicy.resultScope
    const eligible = results.filter(row => {
      const dimensions = Object.keys(row.dimensions)
      if (scope.mode === 'MAIN' && dimensions.length !== 0) return false
      if (scope.mode === 'GROUPED') {
        if (row.target !== scope.targetCode) return false
        if (JSON.stringify(dimensions.map(key => key.toUpperCase()).sort()) !== JSON.stringify([...scope.dimensions].sort())) return false
        for (const [key,values] of Object.entries(scope.members || {})) if (!values.includes(String(row.dimensions[key] ?? row.dimensions[key.toLowerCase()]))) return false
      }
      return row.value !== null && compare(rule.version.condition,row.value)
    })
    const events = allEvents.filter(event => event.warningRuleVersionId === rule.version.id)
    const expected = eligible.map(row => row.id).sort(), actual = events.map(event => event.indicatorResultId).sort()
    check(`warning-${rule.code}-complete-no-duplicates`, JSON.stringify(expected) === JSON.stringify(actual), {expected,actual})
    for (const event of events) {
      const row = results.find(row => row.id === event.indicatorResultId)
      const context = event.comparisonContext
      check(`event-${event.id}-frozen-result`, row && near(row.value,event.actualValue,1e-10) && JSON.stringify(row.dimensions) === JSON.stringify(context.dimensionSnapshot) && event.periodStart.replace('T',' ') === row.start.slice(0,19) && event.periodEnd.replace('T',' ') === row.end.slice(0,19), {event,row})
      check(`event-${event.id}-condition`, compare(context.condition,event.actualValue), context)
      const code = row.dimensions.out_dept_code ?? row.dimensions.OUT_DEPT_CODE
      const source = code == null ? oracle.ba : oracle.departments.find(item => item.code === code)
      check(`event-${event.id}-source-oracle`, source && near(event.actualValue,Number(source.male)/Number(source.discharged),1e-8), {eventId:event.id,source,actual:event.actualValue})
    }
  }
}
if (mode === 'arithmetic') {
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`)).Jan
  const results = await sql('PLATFORM', "SELECT r.id,r.dimension_snapshot_json,r.result_value,r.calculation_period_start,r.calculation_period_end,JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.targetCode')),s.calculation_batch_id FROM rsl_indicator_result r JOIN job_calc_target t ON t.id=r.calc_target_id JOIN rsl_result_set s ON s.id=r.result_set_id WHERE r.indicator_version_id=102027642463192691 AND r.calculation_period_start='2026-01-01 00:00:00' AND r.calculation_period_end='2026-02-01 00:00:00'", ['id','dimensions','value','start','end','target','batchId'])
  const daily = {}
  for (const department of ['', '5']) daily[department] = await sql('SOURCE', `SELECT DATE(out_date),SUM(total_cost),SUM(drug_cost),SUM(material_cost),COUNT(DISTINCT VISIT_ID) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' ${department ? `AND out_dept_code='${department}'` : ''} GROUP BY DATE(out_date)`, ['day','totalCost','drugCost','materialCost','visits'])
  for (const row of results) {
    const dimensions = JSON.parse(row.dimensions)
    const runtimeDepartment = row.batchId === '102027642463199612' ? '5' : ''
    const code = dimensions.dept_code || runtimeDepartment
    const source = dimensions.time_day ? daily[runtimeDepartment].find(item => item.day === dimensions.time_day) : code ? oracle.departments.find(item => item.code === code) : oracle.ba
    if (!source) { check(`arithmetic-${row.id}-source`,false,row); continue }
    const expected = Math.round((Number(source.totalCost) - (Number(source.drugCost) + Number(source.materialCost))) / Number(source.visits) * 10000) / 100
    check(`arithmetic-${row.id}-four-ops-source`,near(row.value,expected,0.005),{...row,source,expected})
  }
  await save('arithmetic-results', results)
}
if (mode === 'adhoc') {
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`))
  for (const [tag,start,end] of periods.filter(period => ['Jan','Q1','JanFeb','May'].includes(period[0]))) {
    for (const [key,id] of [['transfer','102027642461313071'],['tcm','102027642462358159'],['arithmetic','102027642463192691']]) await run(`adhoc-${tag}-${key}`, async () => {
      const result = await api(`/indicator-versions/${id}/query`, {periodStart:`${start}T00:00:00`,periodEnd:`${end}T00:00:00`,parameters:{},summaryOnly:true})
      await save(`adhoc-${tag}-${key}`,result)
      const source = oracle[tag]
      const expected = tag === 'May' ? null : key === 'transfer' ? Number(source.transfer.transfers)/Number(source.transfer.admissions) : key === 'tcm' ? Number(source.ba.chineseCost)/Number(source.ba.drugCost) : Math.round((Number(source.ba.totalCost)-Number(source.ba.drugCost)-Number(source.ba.materialCost))/Number(source.ba.visits)*10000)/100
      console.log(tag,key,JSON.stringify(result).slice(0,1600))
      check(`adhoc-${tag}-${key}-source`, result.rows.length <= 1 && (result.rows.length === 0 ? expected === null : near(result.rows[0].value,expected,1e-8)), {result,expected})
    })
  }
  for (const department of ['5','9012','__NO_SUCH_DEPT__']) await run(`adhoc-dept-${department}`, async () => {
    const result = await api('/indicator-versions/102027642463192691/query', {periodStart:'2026-01-01T00:00:00',periodEnd:'2026-02-01T00:00:00',parameters:{department},summaryOnly:true})
    await save(`adhoc-dept-${department}`,result)
    const source = oracle.Jan.departments.find(item => item.code === department)
    const expected = source ? Math.round((Number(source.totalCost)-Number(source.drugCost)-Number(source.materialCost))/Number(source.visits)*10000)/100 : null
    check(`adhoc-${department}-source`, result.rows.length <= 1 && (result.rows.length === 0 ? expected === null : near(result.rows[0].value,expected,0.005)), {result,expected})
  })
  const narrowed = await api('/indicator-versions/102027642461313071/query', {periodStart:'2026-01-01T00:00:00',periodEnd:'2026-04-01T00:00:00',parameters:{startDate:'2026-02-01 00:00:00',endDate:'2026-03-01 00:00:00'},summaryOnly:true})
  check('adhoc-period-intersect-parameters',near(narrowed.rows[0]?.value,Number(oracle.Feb.transfer.transfers)/Number(oracle.Feb.transfer.admissions),1e-8),narrowed)
  for (const [name,body,message] of [
    ['unknown-param',{parameters:{unknown:'x'}},/未声明参数/],
    ['bad-date',{parameters:{startDate:'2026-99-01'}},/日期|时间|格式|DATETIME/],
    ['reverse-period',{periodStart:'2026-02-01T00:00:00',periodEnd:'2026-01-01T00:00:00'},/周期|开始|结束/]
  ]) {
    try { await api('/indicator-versions/102027642461313071/query',{periodStart:'2026-01-01T00:00:00',periodEnd:'2026-02-01T00:00:00',parameters:{},summaryOnly:true,...body}); check(`adhoc-reject-${name}`,false,'unexpected success') }
    catch(error) { check(`adhoc-reject-${name}`,message.test(error.message),error.message) }
  }
}
if (mode === 'drill-oracle') {
  const catalog = JSON.parse(await readFile(`${directory}/catalog.json`))
  for (const tag of ['Jan','Q1']) {
    const board = JSON.parse(await readFile(`${directory}/dashboard-${tag}.json`))
    const [,start,end] = periods.find(period => period[0] === tag)
    for (const [key,widgetId,codes] of [['transfer','dashboard-widget-1791798674947-4',['11','9012']],['tcm','dashboard-widget-1791875881995-2',['9012','5']]]) {
      const widget = board.widgets[widgetId]
      const path = catalog.find(item => item.key === key).version.drillConfig.drillPaths.find(path => path.pathCode !== 'TIME')
      for (const code of codes) await run(`drill-${tag}-${key}-${code}`,async () => {
        const parent = widget.rows.find(row => String(row.out_dept_code ?? row['科室']) === code)
        assert.ok(parent)
        const context = parent.drillContext
        const navigation = projectedDrillNavigation(parent,path,context)
        const payload = {pathCode:path.pathCode,...navigation.initialNavigation,filters:navigation.filters,snapshotId:context.snapshotId,pageNum:1,pageSize:200}
        delete payload.label
        const drill = await api(`/analysis/results/${context.resultId}/drill/search`,payload)
        await save(`drill-${tag}-${key}-${code}`,{payload,drill})
        let source
        if (key === 'tcm') source = await sql('SOURCE',`SELECT out_dept_name,attending_doctor,attending_doctor_name,SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' AND out_dept_code='${code}' GROUP BY out_dept_name,attending_doctor,attending_doctor_name`,['deptName','doctor','doctorName','numerator','denominator'])
        else {
          source = await sql('SOURCE',`SELECT b.out_dept_name,b.AttendingDoctor,b.AttendingDoctorName,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b WHERE b.in_date>='${start}' AND b.in_date<'${end}' AND b.out_dept_code='${code}' GROUP BY b.out_dept_name,b.AttendingDoctor,b.AttendingDoctorName`,['deptName','doctor','doctorName','denominator'])
          const numbers = await sql('SOURCE',`SELECT b.out_dept_name,b.AttendingDoctor,b.AttendingDoctorName,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON b.In_Hospital_ID=t.In_Hospital_ID WHERE b.in_date>='${start}' AND b.in_date<'${end}' AND b.out_dept_code='${code}' AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48 GROUP BY b.out_dept_name,b.AttendingDoctor,b.AttendingDoctorName`,['deptName','doctor','doctorName','numerator'])
          for (const row of source) row.numerator = numbers.find(item => item.deptName === row.deptName && item.doctor === row.doctor && item.doctorName === row.doctorName)?.numerator || '0'
        }
        const identities = new Set()
        check(`drill-${tag}-${key}-${code}-complete`,drill.records.length === source.length,{actual:drill.records.length,expected:source.length})
        for (const row of drill.records) {
          const d = row.dimensions
          const doctor = d.attending_doctor ?? d['医生'], name = d.attending_doctor_name ?? d['医生名称'], deptName = d.out_dept_name ?? d['科室名称']
          const match = source.find(item => item.doctor === doctor && item.doctorName === name && item.deptName === deptName)
          const expected = match && Number(match.denominator) ? Number(match.numerator)/Number(match.denominator) : null
          check(`drill-${tag}-${key}-${code}-${row.resultId}-source`, Boolean(match) && near(row.numeratorValue,match.numerator,0.005) && near(row.denominatorValue,match.denominator,0.005) && near(row.indicatorValue,expected,1e-8),{row,match,expected})
          identities.add(JSON.stringify([doctor,name,deptName]))
        }
        check(`drill-${tag}-${key}-${code}-unique`,identities.size === drill.records.length,{identities:identities.size,rows:drill.records.length})
      })
    }
  }
}
if (mode === 'filters') {
  const oracle = JSON.parse(await readFile(`${directory}/source-oracle.json`))
  const cases = [
    ['mortality','dashboard-widget-1790681694636-1','OUT_DEPT_CODE',['5','22'],'KPI'],
    ['mortality','dashboard-widget-1790681712300-4','OUT_DEPT_CODE',['5','22'],'BAR'],
    ['tcm','dashboard-widget-1791798624163-1','科室',['5','9012'],'KPI'],
    ['tcm','dashboard-widget-1791875881995-2','科室',['5','9012'],'PIE'],
    ['transfer','dashboard-widget-1791798674947-4','OUT_DEPT_CODE',['11','9012'],'PIE']
  ]
  for (const tag of ['Jan','Q1']) for (const [key,widgetId,field,codes,type] of cases) await run(`filters-${tag}-${key}-${type}`,async () => {
    const [,start,end,granularity] = periods.find(period => period[0] === tag)
    const response = expandDashboardResponse(await api('/analysis/dashboards/1189225114584501123/query',{periodStart:start,periodEnd:end,granularity,filters:{[field]:codes},widgetCodes:[widgetId],responseFormat:'COLUMNAR'}))
    const result = response.widgets[widgetId]
    await save(`filtered-${tag}-${key}-${type}`,result)
    const sources = (key === 'transfer' ? oracle[tag].transferDepartments : oracle[tag].departments).filter(item => codes.includes(item.code))
    check(`filters-${tag}-${key}-${type}-ready`,result.status === 'READY',{status:result.status,message:result.message})
    for (const [index,row] of result.rows.entries()) {
      const code = row.out_dept_code ?? row['科室']
      const rows = type === 'KPI' ? sources : sources.filter(item => item.code === code && (key !== 'transfer' || item.name === row.OUT_DEPT_NAME))
      const numerator = rows.reduce((sum,x)=>sum+Number(key === 'mortality' ? x.deaths : key === 'tcm' ? x.chineseCost : x.transfers),0)
      const denominator = rows.reduce((sum,x)=>sum+Number(key === 'mortality' ? x.discharged : key === 'tcm' ? x.drugCost : x.admissions),0)
      check(`filters-${tag}-${key}-${type}-${index}-source`,rows.length > 0 && near(row.numeratorValue,numerator,0.005) && near(row.denominatorValue,denominator,0.005) && near(row.value,denominator ? numerator/denominator : null,1e-8),{row,numerator,denominator})
    }
    if (type === 'KPI') {
      const comparison = result.timeComparison
      check(`filters-${tag}-${key}-comparison-current`, comparison && near(comparison.current.value,result.rows[0]?.value,1e-8) && comparison.current.periodStart.slice(0,10) === start && comparison.current.periodEnd.slice(0,10) === end,comparison)
      const baseline = comparison?.previousPeriod || comparison?.previousMonth
      if (baseline) {
        const sqlCodes = codes.map(code=>`'${code}'`).join(',')
        const cols = key === 'mortality' ? "SUM(out_status='4'),COUNT(*)" : 'SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost)'
        const [source] = await sql('SOURCE',`SELECT ${cols} FROM vmq_basicinformationba WHERE out_date>='${baseline.periodStart.slice(0,10)}' AND out_date<'${baseline.periodEnd.slice(0,10)}' AND out_dept_code IN (${sqlCodes})`,['numerator','denominator'])
        check(`filters-${tag}-${key}-baseline-source`,near(baseline.value,Number(source.numerator)/Number(source.denominator),1e-8),{baseline,source})
        const expected = Number(baseline.value) === 0 ? null : (Number(comparison.current.value)-Number(baseline.value))/Math.abs(Number(baseline.value))*100
        const relative = (comparison.periodOverPeriod || comparison.monthOverMonth)?.relativeChangePercent
        check(`filters-${tag}-${key}-relative-change`,near(relative,expected,0.00001),{relative,expected})
      }
    }
  })
  const empty = expandDashboardResponse(await api('/analysis/dashboards/1189225114584501123/query',{periodStart:'2026-01-01',periodEnd:'2026-02-01',granularity:'MONTHLY',filters:{'科室':['__NO_SUCH_DEPT__']},widgetCodes:['dashboard-widget-1791875881995-2'],responseFormat:'COLUMNAR'})).widgets['dashboard-widget-1791875881995-2']
  check('filter-nonexistent-member-not-unfiltered',empty.rows.length === 0,{status:empty.status,rows:empty.rows})
}
if (mode === 'clinical-boundaries') {
  const rows = await sql('SOURCE', "SELECT month,SUM(truncated_hour),SUM(exact_48h),SUM(truncated_hour=1 AND exact_48h=0) FROM (SELECT DATE_FORMAT(b.in_date,'%Y-%m') month,b.In_Hospital_ID,MAX(TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48) truncated_hour,MAX(t.In_Dept_Date<=DATE_ADD(b.In_Date,INTERVAL 48 HOUR)) exact_48h FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON b.In_Hospital_ID=t.In_Hospital_ID WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-04-01' AND t.In_Dept_Date>=b.In_Date GROUP BY DATE_FORMAT(b.in_date,'%Y-%m'),b.In_Hospital_ID) eligibility GROUP BY month", ['month','truncatedHourCount','exact48HoursCount','over48Only'])
  await save('clinical-48h-boundary',rows)
  console.log(rows)
  for (const row of rows) check(`clinical-${row.month}-within-exact-48h`,row.truncatedHourCount === row.exact48HoursCount,row)
  const types = await sql('SOURCE', "SELECT t.change_type,t.change_type_num,COUNT(*),MIN(TIMESTAMPDIFF(SECOND,b.In_Date,t.In_Dept_Date)),MAX(TIMESTAMPDIFF(SECOND,b.In_Date,t.In_Dept_Date)) FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON b.In_Hospital_ID=t.In_Hospital_ID WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-04-01' AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48 GROUP BY t.change_type,t.change_type_num", ['type','typeCode','rows','minSeconds','maxSeconds'])
  await save('clinical-transfer-types',types)
  console.log(types)
  const duration = await sql('SOURCE', "SELECT COUNT(*),MIN(closest_seconds),MAX(closest_seconds) FROM (SELECT DATE_FORMAT(b.in_date,'%Y-%m') month,b.In_Hospital_ID,MAX(TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48) truncated_hour,MAX(t.In_Dept_Date<=DATE_ADD(b.In_Date,INTERVAL 48 HOUR)) exact_48h,MIN(TIMESTAMPDIFF(SECOND,b.In_Date,t.In_Dept_Date)) closest_seconds FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON b.In_Hospital_ID=t.In_Hospital_ID WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-04-01' AND t.In_Dept_Date>=b.In_Date GROUP BY DATE_FORMAT(b.in_date,'%Y-%m'),b.In_Hospital_ID) eligibility WHERE truncated_hour=1 AND exact_48h=0", ['count','minSeconds','maxSeconds'])
  await save('clinical-48h-overrun',duration)
  console.log(duration)
  const top = await api('/indicator-versions/102027642460514841')
  const factors = []
  for (const factor of top.formulaDefinition.factors) factors.push(await api(`/factor-versions/${factor.factorVersionId}`))
  await save('transfer-kpi-definition',{version:top,factors})
  console.log(JSON.stringify({top:top.formulaDefinition,factors:factors.map(factor=>({id:factor.id,dsl:factor.dsl}))}))
}
if (mode === 'grains') {
  for (const [name,code,diagnosis] of [['exact-existing','823','Z94.400'],['exact-absent','0850','R10.402'],['department-only','11','']]) await run(`grain-${name}`,async () => {
    const query = new URLSearchParams({indicatorVersionId:'102027642461313071',periodStart:'2026-01-01',periodEnd:'2026-04-01',granularity:'MONTHLY',sections:'TREND',grainSelection:'EXACT','filter.OUT_DEPT_CODE':code})
    if(diagnosis) query.set('filter.IN_ICD10',diagnosis)
    let response
    try { response = await api(`/analysis/indicators/102027642461313070/analysis?${query}`) }
    catch(error) {
      if(name !== 'department-only') throw error
      check('grain-partial-selection-rejected',error.message.includes('组合粒度字段必须全部选择'),error.message)
      return
    }
    await save(`grain-${name}`,response)
    const constraint = `b.out_dept_code='${code}' ${diagnosis ? `AND b.in_icd10='${diagnosis}'` : ''}`
    const source = await sql('SOURCE',`SELECT DATE_FORMAT(b.in_date,'%Y-%m'),COUNT(DISTINCT b.In_Hospital_ID),COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM vmq_inpatienttransferdetail t WHERE t.In_Hospital_ID=b.In_Hospital_ID AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48) THEN b.In_Hospital_ID END) FROM vmq_basicinformationzy b WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-04-01' AND ${constraint} GROUP BY DATE_FORMAT(b.in_date,'%Y-%m')`, ['month','denominator','numerator'])
    check(`grain-${name}-points`,response.trend.length===source.length,{actual:response.trend.length,source})
    for (const row of response.trend) {
      const match = source.find(item=>item.month===row.periodStart.slice(0,7))
      const expected = Number(match?.numerator)/Number(match?.denominator)
      check(`grain-${name}-${row.periodStart}-value`,match && near(row.value,expected,1e-8)&&near(row.numeratorValue,match.numerator,0.001)&&near(row.denominatorValue,match.denominator,0.001),{row,match,expected})
    }
    if(!source.length) check(`grain-${name}-empty-not-zero`,response.dataAvailable===false && response.trend.length===0,response)
  })
}
await save(`${mode}-summary`, { base, checks, calls })
console.log(JSON.stringify({ mode, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length, calls: calls.length, directory }))
if (checks.some(check => !check.passed)) process.exitCode = 1

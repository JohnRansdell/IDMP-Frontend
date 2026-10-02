import { api, check, finish, run, save } from './system-test-client.mjs'
import { db } from './system-db.mjs'

await run('database-health', async () => {
  const health = await db('PLATFORM', "SELECT JSON_OBJECT('running',SUM(COMMAND!='Sleep'),'total',COUNT(*),'longRunning',SUM(COMMAND!='Sleep' AND TIME>10)) FROM information_schema.PROCESSLIST")
  await save('database-health', health); console.log(health)
})
const specs = [
  { key: 'transfer', id: '102027642461313070', version: '102027642461313071', n: "SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-02-01' AND t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48", d: "SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-02-01'" },
  { key: 'mortality', id: '102027642460761108', version: '102027642460761114', n: "SELECT COUNT(*) FROM vmq_basicinformationba b WHERE b.out_date>='2026-01-01' AND b.out_date<'2026-02-01' AND b.out_status='4'", d: "SELECT COUNT(*) FROM vmq_basicinformationba b WHERE b.out_date>='2026-01-01' AND b.out_date<'2026-02-01'" },
  { key: 'emergency', id: '102027642460335204', version: '102027642460335206', n: "SELECT COUNT(*) FROM vmq_surgeryinfo b WHERE b.SurgeryStartTime>='2026-01-01' AND b.SurgeryStartTime<'2026-02-01' AND b.surgery_classfy='2'", d: "SELECT COUNT(*) FROM vmq_surgeryinfo b WHERE b.SurgeryStartTime>='2026-01-01' AND b.SurgeryStartTime<'2026-02-01'" }
]
function verify(name, row, truth) {
  check(`${name}-numerator`, Number(row?.numeratorValue)===truth.n, { actual: row?.numeratorValue, expected: truth.n })
  check(`${name}-denominator`, Number(row?.denominatorValue)===truth.d, { actual: row?.denominatorValue, expected: truth.d })
  check(`${name}-ratio`, Math.abs(Number(row?.value??row?.valueDecimal)-truth.n/truth.d)<1e-8, { actual: row?.value??row?.valueDecimal, expected: truth.n/truth.d })
}
for (const spec of specs) await run(spec.key, async () => {
  const truth = (await db('SOURCE', `SELECT JSON_OBJECT('n',(${spec.n}),'d',(${spec.d}))`))[0]
  await save(`truth-${spec.key}`, truth)
  const analysis = await api('GET', `/analysis/indicators/${spec.id}/analysis?indicatorVersionId=${spec.version}&periodStart=2026-01-01&periodEnd=2026-01-31&granularity=MONTHLY`)
  await save(`analysis-${spec.key}`,analysis)
  verify(`formal-${spec.key}`,analysis.overview,truth)
  const query = await api('POST', `/indicator-versions/${spec.version}/query`, { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', summaryOnly: true, parameters: {} })
  await save(`query-${spec.key}`,query)
  const result = query.results?.records?.[0] || query.rows?.[0] || query.result || query.overview || query
  console.log(`${spec.key} query shape ${JSON.stringify(query).slice(0,700)}`)
  verify(`instant-${spec.key}`,result,truth)
  const overview = analysis.overview
  if (overview?.resultId) {
    const factors = await api('GET', `/analysis/results/${overview.resultId}/factors`)
    await save(`lineage-${spec.key}`,factors)
    check(`lineage-${spec.key}`,Boolean(factors))
  }
  if (spec.key==='mortality'||spec.key==='transfer') {
    const options = await api('GET', `/analysis/indicators/${spec.id}/grain-options?indicatorVersionId=${spec.version}&fieldCode=OUT_DEPT_CODE&periodStart=2026-01-01&periodEnd=2026-01-31&limit=10`)
    await save(`department-options-${spec.key}`, options)
    const department = options?.[0]?.value || options?.[0]?.code
    if (department) {
      const filtered = await api('GET', `/analysis/indicators/${spec.id}/analysis?indicatorVersionId=${spec.version}&periodStart=2026-01-01&periodEnd=2026-01-31&filter.OUT_DEPT_CODE=${encodeURIComponent(department)}`)
      await save(`department-analysis-${spec.key}`, filtered)
      check(`department-ranking-${spec.key}`, (filtered.dimensionComparison||[]).every(row=>Object.keys(row.dimensions||{}).length<10))
    }
    const context = analysis.overview?.drillContext
    if(context?.resultId||overview?.resultId) {
      const drill = await api('POST',`/analysis/results/${context?.resultId||overview.resultId}/drill/search`,{snapshotId:context?.snapshotId||overview.snapshotId,currentLevel:'HOSPITAL',parentKeys:{},filters:{},pageNum:1,pageSize:100})
      await save(`department-drill-${spec.key}`,drill)
      console.log(`${spec.key} drill shape ${JSON.stringify(drill).slice(0,500)}`)
    }
  }
})
await run('dynamic-patient-name',async()=>{
  const n="SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='2025-12-04' AND b.in_date<'2026-02-13' AND b.name LIKE CONCAT('%','张','%') AND t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48"
  const d="SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b WHERE b.in_date>='2025-12-04' AND b.in_date<'2026-02-13' AND b.name LIKE CONCAT('%','张','%')"
  const truth=(await db('SOURCE',`SELECT JSON_OBJECT('n',(${n}),'d',(${d}))`))[0]
  const query=await api('POST','/indicator-versions/102027642461313071/query',{periodStart:'2025-12-04T00:00:00',periodEnd:'2026-02-13T00:00:00',parameters:{patientName:'张'},summaryOnly:true})
  await save('dynamic-patient-name',{truth,query})
  verify('dynamic-patient-name',query.results?.records?.[0]||query.rows?.[0]||query.result||query.overview||query,truth)
})
await finish()

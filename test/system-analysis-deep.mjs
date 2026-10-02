import { readFile } from 'node:fs/promises'
import { api, check, finish, run, save, parseJson, tag } from './system-test-client.mjs'
import { db } from './system-db.mjs'
const id='102027642461313070',version='102027642461313071'
const analysis=parseJson(await readFile('.tmp/system-test-20261002/DATA/analysis-transfer.json','utf8'))
await run('grain-exact',async()=>{
  const sample=analysis.dimensionComparison.find(r=>r.dimensions.out_dept_code&&r.dimensions.in_icd10)
  const dept=sample.dimensions.out_dept_code,disease=sample.dimensions.in_icd10
  const parameters=new URLSearchParams({indicatorVersionId:version,periodStart:'2026-01-01',periodEnd:'2026-01-31',grainSelection:'EXACT','filter.OUT_DEPT_CODE':dept,'filter.IN_ICD10':disease})
  const filtered=await api('GET',`/analysis/indicators/${id}/analysis?${parameters}`)
  const q=v=>"'"+v.replaceAll("'","''")+"'"
  const condition=`b.in_date>='2026-01-01' AND b.in_date<'2026-02-01' AND b.out_dept_code=${q(dept)} AND b.in_icd10=${q(disease)}`
  const truth=(await db('SOURCE',`SELECT JSON_OBJECT('n',(SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE ${condition} AND t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48),'d',(SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b WHERE ${condition}))`))[0]
  await save('grain-exact',{dept,disease,truth,filtered})
  check('grain-exact-source',Number(filtered.overview?.numeratorValue)===truth.n&&Number(filtered.overview?.denominatorValue)===truth.d,{overview:filtered.overview,truth})
  const options=await api('GET',`/analysis/indicators/${id}/grain-options?indicatorVersionId=${version}&fieldCode=IN_ICD10&filter.OUT_DEPT_CODE=${dept}&periodStart=2026-01-01&periodEnd=2026-01-31&limit=50`)
  await save('grain-options-linked',options)
  check('grain-option-no-null',options.length>0&&options.every(r=>r.value!=='null'&&r.value!==null),options)
  const partial=await api('GET',`/analysis/indicators/${id}/analysis?indicatorVersionId=${version}&grainSelection=EXACT&filter.OUT_DEPT_CODE=${dept}`,undefined,{allowError:true})
  check('partial-grain-rejected',partial.http===400,partial)
})
await run('department-doctor',async()=>{
  const ranking=analysis.departmentComparison
  check('one-row-per-department',new Set(ranking.map(r=>r.dimensions.out_dept_code)).size===ranking.length,{rows:ranking.length})
  const dept=ranking.find(r=>r.dimensions.out_dept_code==='4')||ranking[0]
  const drill=await api('POST',`/analysis/results/${dept.resultId}/drill/search`,{snapshotId:dept.snapshotId,currentLevel:'ATTENDING_DOCTOR',parentKeys:{hospital_code:'DEFAULT_HOSPITAL',out_dept_code:dept.dimensions.out_dept_code},filters:{},pageNum:1,pageSize:100})
  await save('doctor-drill',drill)
  check('doctor-level',drill.records.length>0&&drill.records.every(r=>r.levelCode==='ATTENDING_DOCTOR'&&r.dimensions.out_dept_code===dept.dimensions.out_dept_code),drill.records.slice(0,2))
  check('drill-breadcrumb',drill.breadcrumb.length>=1&&drill.breadcrumb.every(b=>b.resultId&&b.snapshotId),drill.breadcrumb)
  const doctors=await db('SOURCE',"SELECT JSON_OBJECT('doctor',b.AttendingDoctor,'d',COUNT(DISTINCT b.in_hospital_id)) FROM vmq_basicinformationzy b WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-02-01' AND b.out_dept_code='4' GROUP BY b.AttendingDoctor")
  await save('doctor-source-truth',doctors)
  check('doctor-denominators-source',doctors.every(d=>drill.records.some(r=>r.dimensions.attending_doctor===d.doctor&&Number(r.denominatorValue)===d.d)),{doctors,records:drill.records.map(r=>({dimensions:r.dimensions,d:r.denominatorValue}))})
  const lineage=await api('GET',`/analysis/results/${dept.resultId}/factors`)
  await save('department-lineage',lineage)
  check('department-lineage',!!lineage,lineage)
  const mismatch=await api('POST',`/analysis/results/${dept.resultId}/drill/search`,{snapshotId:'102027642460335710',currentLevel:'OUT_DEPT'}, {allowError:true})
  check('snapshot-mismatch-rejected',mismatch.http>=400&&mismatch.http<500,mismatch)
})
await run('zero-dynamic',async()=>{
  const result=await api('POST',`/indicator-versions/${version}/query`,{periodStart:'2026-01-01T00:00:00',periodEnd:'2026-01-02T00:00:00',summaryOnly:true,parameters:{patientName:'不存在的患者_系统测试_179093'}})
  await save('zero-dynamic',result)
  const row=result.rows[0]
  check('zero-denominator-not-infinity',row?.denominatorValue===0&&(row?.value===null||row?.value===0),result)
})
await run('optional-predicate-only',async()=>{
  const result=await api('POST','/sql-imports',{sql:"SELECT COUNT(*) cnt FROM vmq_surgeryinfo b WHERE [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]]",definitionType:'SQL'},{headers:{'Idempotency-Key':`optional-${tag}-${Date.now()}`}})
  await save('optional-only-parsed',result)
  check('optional-only-no-1eq1',result.status==='AWAITING_METADATA',result.status)
  await api('POST',`/sql-imports/${result.importId}/abandon`,{reason:'可选条件解析测试完成'})
})
await finish()

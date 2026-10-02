import { api, check, calls, finish, run, save, pause } from './system-test-client.mjs'
const samples=[]
const endpoints=[
 {name:'indicator-list',method:'GET',path:'/indicators?page=1&size=20',budget:2000},
 {name:'factor-list',method:'GET',path:'/factors?page=1&size=20',budget:2000},
 {name:'analysis-transfer',method:'GET',path:'/analysis/indicators/102027642461313070/analysis?indicatorVersionId=102027642461313071&periodStart=2026-01-01&periodEnd=2026-01-31&granularity=MONTHLY',budget:5000},
 {name:'availability-transfer',method:'GET',path:'/indicator-versions/102027642461313071/available-period',budget:5000},
 {name:'dashboard-quality',method:'POST',path:'/analysis/dashboards/1189225114584501123/query',body:{periodStart:'2026-01-01',periodEnd:'2026-01-31',granularity:'MONTHLY'},budget:5000}
]
for(const endpoint of endpoints)for(const concurrency of [1,2]) {
  const round=[]
  for(let i=0;i<3;i++) {
    const values=await Promise.all(Array.from({length:concurrency},async()=>{
      const start=performance.now()
      try {
        const data=await api(endpoint.method,endpoint.path,endpoint.body,{timeout:40000})
        const ms=Math.round(performance.now()-start)
        const signature=JSON.stringify(endpoint.name==='dashboard-quality'?Object.values(data.widgets).map(w=>({status:w.status,values:w.rows?.map(r=>({value:r.value,n:r.numeratorValue,d:r.denominatorValue}))})):endpoint.name==='analysis-transfer'?data.overview:endpoint.name==='availability-transfer'?data: data.records?.map(r=>r.id))
        const sample={name:endpoint.name,concurrency,ms,ok:true,signature};samples.push(sample);round.push(sample)
        return data
      }catch(error){const sample={name:endpoint.name,concurrency,ms:Math.round(performance.now()-start),ok:false,error:error.message};samples.push(sample);round.push(sample);return null}
    }))
    if(values.some(v=>v===null))break
    await pause(200)
  }
  check(`stability-${endpoint.name}-c${concurrency}`,round.every(r=>r.ok),round.filter(r=>!r.ok))
  check(`consistency-${endpoint.name}-c${concurrency}`,new Set(round.filter(r=>r.ok).map(r=>r.signature)).size===1)
  const times=round.map(r=>r.ms).sort((a,b)=>a-b)
  const p50=times[Math.ceil(times.length*.5)-1],p95=times[Math.ceil(times.length*.95)-1]
  check(`latency-${endpoint.name}-c${concurrency}`,p95<=endpoint.budget,{samples:times.length,p50,p95,max:times.at(-1),budget:endpoint.budget})
  console.log(JSON.stringify({endpoint:endpoint.name,concurrency,p50,p95,max:times.at(-1)}))
  if(round.some(r=>!r.ok))break
}
await save('samples',samples)
await finish()

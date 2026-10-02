import { spawn } from 'node:child_process'
import { api, check, evidence, finish, run, save } from './system-test-client.mjs'
const code='EDITOR_FT_'+Date.now()
let id
await run('dashboard-draw-placement',async()=>{
  const schema={code,name:'系统完整测试鼠标画框看板 '+code,type:'CUSTOM',layout:{columns:24,rowHeight:60,gap:12},widgets:['a','b'].map((code,index)=>({code,title:'独立测试组件 '+code,type:'KPI_CARD',dataSourceCode:'DASHBOARD_EMERGENCY_SURGERY_RATE_20260922',indicatorVersionId:'102027642460335206',position:{x:index*6,y:0,w:6,h:4},fieldBindings:{value:'value'},query:{resultShape:'OVERVIEW'}}))}
  const created=await api('POST','/analysis/dashboards',schema);id=created.dashboard.id
  await save('created',created)
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['test/dashboard-golden-path.e2e.js'],{windowsHide:true,env:{...process.env,VITE_DASHBOARD_PREVIEW_MODE:'0',DASHBOARD_PLACEMENT_ONLY:'1',IDMP_GOLDEN_DASHBOARD:id,DASHBOARD_VISUAL_DIR:evidence}})
    let text='';child.stdout.on('data',d=>{text+=d;process.stdout.write(d)});child.stderr.on('data',d=>{text+=d;process.stderr.write(d)})
    child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(new Error(text.slice(-2000))))
  })
  await save('editor-result',{output});check('dashboard-draw-placement',true)
})
if(id)await run('editor-test-cleanup',async()=>{
  await api('DELETE',`/analysis/dashboards/${id}`);check('editor-test-cleanup',true)
})
await finish()

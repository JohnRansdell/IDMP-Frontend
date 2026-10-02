import { api, run, save, finish, check } from './system-test-client.mjs'
import { db } from './system-db.mjs'
await run('processlist',async()=>save('processlist',await db('PLATFORM',"SELECT JSON_OBJECT('id',ID,'time',TIME,'command',COMMAND,'state',STATE) FROM information_schema.PROCESSLIST")))
await run('availability-isolated',async()=>{
  const value=await api('GET','/indicator-versions/102027642461313071/available-period')
  await save('availability',value);check('availability-isolated',true)
})
await finish()

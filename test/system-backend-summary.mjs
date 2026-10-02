import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from './system-test-client.mjs'
const exec=promisify(execFile)
const {stdout}=await exec('ssh',['-T','-o','BatchMode=yes','lab-server',"sed -n '/Tests run:/p' /tmp/idmp-full-system-test-20261002.log"],{windowsHide:true})
const summary=stdout.split('\n').filter(line=>!line.includes('-- in')&&/Tests run:/.test(line)).map(line=>{
  const [tests,failures,errors,skipped]=[...line.matchAll(/(?:Tests run|Failures|Errors|Skipped): (\d+)/g)].map(m=>Number(m[1]))
  return {tests,failures,errors,skipped}
})
const totals=summary.reduce((a,b)=>({tests:a.tests+b.tests,failures:a.failures+b.failures,errors:a.errors+b.errors,skipped:a.skipped+b.skipped}),{tests:0,failures:0,errors:0,skipped:0})
await save('backend-tests',{summary,totals,lines:stdout.split('\n').filter(line=>/Skipped: [1-9]|Errors: [1-9]/.test(line))})
console.log(totals)

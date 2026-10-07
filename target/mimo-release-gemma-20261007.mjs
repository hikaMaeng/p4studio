import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/hika0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const out=path.resolve('test/20261007/mimo-load-fix');await fs.mkdir(out,{recursive:true});
const base='http://localhost:43120';
const get=async()=>{const r=await fetch(base+'/api/model-deployments');if(!r.ok)throw Error('HTTP '+r.status);return(await r.json()).deployments;};
const before=await get();await fs.writeFile(out+'/before.json',JSON.stringify(before,null,2));
const ids=['8b92b1f1-4aff-450c-a1ac-108f70a50488','0a0d5643-a54c-44e4-b1df-1c6e5dc07ec5','474d014a-6193-4fa8-a86c-a9b73597bc5c'];
const report={testedUrl:base+'/models',mode:'scenario',action:'normal unload of three previously test-loaded Gemma deployments',startedAt:new Date().toISOString(),status:'running',results:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.HEADLESS_BROWSER_EXECUTABLE});
const context=await browser.newContext({viewport:{width:1550,height:1000}});await context.tracing.start({screenshots:true,snapshots:true});const page=await context.newPage();
try {
 await page.goto(report.testedUrl,{waitUntil:'domcontentloaded'});
 for(const id of ids){const d=before.find(d=>d.id===id);if(d.sessionProof)throw Error('Session now present; cannot reclaim test-only load: '+d.name);
  const row=page.getByRole('article',{name:d.name,exact:true});await row.waitFor({state:'visible',timeout:30000});
  await row.getByRole('button',{name:'모델 언로딩',exact:true}).click({timeout:30000});console.log(JSON.stringify({event:'unload-clicked',name:d.name}));
 }
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){const records=await get();report.results=ids.map(id=>{const d=records.find(d=>d.id===id);return{id,name:d.name,status:d.status,error:d.error,reports:d.reports};});await fs.writeFile(out+'/unload-report.json',JSON.stringify(report,null,2));
  if(report.results.every(d=>d.status==='unloaded'&&d.reports.every(r=>r.resourceState==='absent')))break;
  if(report.results.some(d=>['failed','unknown'].includes(d.status)))throw Error(JSON.stringify(report.results));
  await new Promise(r=>setTimeout(r,1500));
 }
 if(!report.results.every(d=>d.status==='unloaded'&&d.reports.every(r=>r.resourceState==='absent')))throw Error('UNLOAD not proven');
 report.status='passed';
}catch(e){report.status='failed';report.exception=e.stack;console.log(e.stack);}
finally{await page.screenshot({path:out+'/after-unload.png',fullPage:true});await context.tracing.stop({path:out+'/unload-trace.zip'});report.finishedAt=new Date().toISOString();await fs.writeFile(out+'/unload-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({status:report.status,report:out+'/unload-report.json'}));}

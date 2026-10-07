import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/hika0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const base='http://localhost:43120';
const out=path.resolve('test/20261007/mimo-load-fix/verification');
await fs.mkdir(out,{recursive:true});
const get=async()=>{const r=await fetch(base+'/api/model-deployments');if(!r.ok)throw Error('HTTP '+r.status);return (await r.json()).deployments;};
const before=await get();
await fs.writeFile(out+'/before.json',JSON.stringify(before,null,2));
const selected=before.filter(d=>d.id==='09b02f0b-b28b-491c-bdd7-d3264698a217');
const report={mode:'scenario',testedUrl:base+'/models',startedAt:new Date().toISOString(),status:'running',models:[],pageErrors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.HEADLESS_BROWSER_EXECUTABLE});
const context=await browser.newContext({viewport:{width:1550,height:1000}});
await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
try {
  const response=await page.goto(report.testedUrl,{waitUntil:'domcontentloaded'});
  if(response.status()!==200)throw Error('UI HTTP '+response.status());
  for(const d of selected){
    const row=page.getByRole('article',{name:d.name,exact:true});
    await row.waitFor({state:'visible',timeout:30000});
    const current=(await get()).find(x=>x.id===d.id);
    const item={id:d.id,name:d.name,status:'pending',before:current.status};
    report.models.push(item);
    if(['loaded','ready'].includes(current.status))item.alreadyLoaded=true;
    else {
      await row.getByRole('button',{name:'모델 로딩',exact:true}).click({timeout:30000});
      console.log(JSON.stringify({event:'load-clicked',name:d.name}));
    }
  }
  const deadline=Date.now()+20*60*1000;
  let last='';
  while(Date.now()<deadline){
    const records=await get();
    await fs.writeFile(out+'/current.json',JSON.stringify(records,null,2));
    for(const item of report.models){
      const d=records.find(x=>x.id===item.id);
      item.deploymentStatus=d.status;item.error=d.error;item.loadGeneration=d.loadGeneration;item.reports=d.reports;
      if(['loaded','ready'].includes(d.status)&&d.reports.length===d.stages.length&&d.reports.every(r=>r.loadOutcome==='succeeded'))item.status='passed';
      else if(['failed','unknown'].includes(d.status)||(d.error&&d.reports.some(r=>r.loadOutcome==='failed')&&d.reports.every(r=>r.resourceState==='absent'||!r.loadRequested)))item.status='failed';
    }
    const state=JSON.stringify(report.models.map(i=>({name:i.name,status:i.deploymentStatus,result:i.status,error:i.error})));
    if(state!==last){console.log(state);last=state;}
    await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));
    if(report.models.every(i=>i.status!=='pending'))break;
    await new Promise(r=>setTimeout(r,2500));
  }
  for(const item of report.models){
    if(item.status==='pending')item.status='timeout';
    if(item.status==='passed')await page.getByRole('article',{name:item.name,exact:true}).getByTestId('model-row-status').filter({hasText:/적재됨|준비/}).waitFor({state:'visible',timeout:30000});
    item.visibleStatus=await page.getByRole('article',{name:item.name,exact:true}).getByTestId('model-row-status').innerText();
  }
  report.status=report.models.every(i=>i.status==='passed')?'passed':'failed';
}catch(e){report.status='failed';report.exception=e.stack;console.log(e.stack);}
finally {
  report.screenshot=out+'/models.png';
  await page.screenshot({path:report.screenshot,fullPage:true}).catch(()=>{});
  await context.tracing.stop({path:out+'/trace.zip'});
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));
  await browser.close();
  console.log(JSON.stringify({status:report.status,report:out+'/report.json'}));
}


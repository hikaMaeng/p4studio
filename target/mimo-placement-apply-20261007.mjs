import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {deploymentInputSchema,validateDeploymentLoad} from '../packages/studio_domain/dist/common/index.js';
const base='http://localhost:43120/api/model-deployments',id='09b02f0b-b28b-491c-bdd7-d3264698a217';
const input=deploymentInputSchema.parse(JSON.parse(await fs.readFile('test/20261007/mimo-load-fix/placement-candidate.json','utf8')));
validateDeploymentLoad(input);
for(const [file,index] of [['m42-candidate-memory-probe.log',2],['gb10-candidate-memory-probe.log',3]]){
 const log=await fs.readFile('test/20261007/mimo-load-fix/'+file,'utf8');
 const plan=JSON.parse(log.split('\n').find(l=>l.startsWith('MEMORY_PLAN ')).slice('MEMORY_PLAN '.length));
 assert(plan.complete&&plan.fits_current_free);assert.equal(plan.max_physical_result_bytes,JSON.parse(input.stages[index].loadOptionsJson).resource_profile.max_physical_result_bytes);
 assert.equal(plan.layer_default_devices[0].layer,input.stages[index].layerStart);
 assert.equal(plan.layer_default_devices.at(-1).layer+1,input.stages[index].layerEnd);
}
const record=(await(await fetch(base)).json()).deployments.find(d=>d.id===id);
assert(record.reports.every(r=>r.resourceState==='absent'));
await fs.writeFile('test/20261007/mimo-load-fix/placement-before.json',JSON.stringify(record,null,2));
const response=await fetch(base+'/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const body=await response.json();assert(response.ok,JSON.stringify(body));
await fs.writeFile('test/20261007/mimo-load-fix/placement-after.json',JSON.stringify(body,null,2));console.log(JSON.stringify({saved:true,cuts:input.stages.map(s=>[s.layerStart,s.layerEnd])}));

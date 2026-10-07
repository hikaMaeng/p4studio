import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deploymentInputSchema,validateDeploymentLoad} from '../packages/studio_domain/dist/common/index.js';
const base='http://localhost:43120/api/model-deployments';
const records=(await(await fetch(base)).json()).deployments;
const record=records.find(d=>d.id==='09b02f0b-b28b-491c-bdd7-d3264698a217');
assert.equal(record.status,'failed');assert(record.reports.every(r=>!r.loadRequested||r.resourceState==='absent'));
const input=deploymentInputSchema.parse(record);
const options=JSON.parse(input.stages[0].loadOptionsJson);
for(const stage of input.stages){const v=JSON.parse(stage.loadOptionsJson);assert.equal(v.sequence_capacity,options.sequence_capacity);assert.equal(v.context_size,options.context_size);assert.equal(v.n_batch,options.n_batch);assert.equal(v.n_ubatch,options.n_ubatch);}
input.sequenceCapacity=options.sequence_capacity;input.contextSize=options.context_size;input.nBatch=options.n_batch;input.nUbatch=options.n_ubatch;
validateDeploymentLoad(input);
await fs.writeFile('test/20261007/mimo-load-fix/metadata-before.json',JSON.stringify(record,null,2));
const fresh=(await(await fetch(base)).json()).deployments.find(d=>d.id===record.id);assert.equal(fresh.updatedAt,record.updatedAt);
const response=await fetch(base+'/'+record.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
const body=await response.json();assert(response.ok,JSON.stringify(body));
await fs.writeFile('test/20261007/mimo-load-fix/metadata-after.json',JSON.stringify(body,null,2));
console.log(JSON.stringify({saved:true,sequenceCapacity:input.sequenceCapacity,contextSize:input.contextSize,nBatch:input.nBatch,nUbatch:input.nUbatch}));

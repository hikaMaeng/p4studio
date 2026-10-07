import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {deploymentInputSchema,validateDeploymentLoad} from '../packages/studio_domain/dist/common/index.js';
const record=(await(await fetch('http://localhost:43120/api/model-deployments')).json()).deployments.find(d=>d.id==='09b02f0b-b28b-491c-bdd7-d3264698a217');
assert(record.reports.every(r=>r.resourceState==='absent'));
const input=deploymentInputSchema.parse(record);
const mid=input.stages[2],tail=input.stages[3];
mid.layerEnd=24;tail.layerStart=24;
mid.planText=mid.planText.replace('--layer-end 22','--layer-end 24').replace('--kv-layer-end 22','--kv-layer-end 24').replace('--expect-layer-device 15:22:CUDA0','--expect-layer-device 15:24:CUDA0');
tail.planText=tail.planText.replace('--layer-begin 22','--layer-begin 24').replace('--kv-layer-begin 22','--kv-layer-begin 24').replace('--expect-layer-device 22:48:CUDA0','--expect-layer-device 24:48:CUDA0');
for(const stage of [mid,tail]){
 const excluded=Array.from({length:48},(_,i)=>i).filter(i=>i<stage.layerStart||i>=stage.layerEnd).join('|');
 stage.planText=stage.planText.replace(/--override-tensor\s+"[^"]*"/g,'').replace(/\s+/g,' ').trim();
 stage.planText+=' --override-tensor "blk\\.('+excluded+')\\..*=CPU"';
}
mid.planText+=' --override-tensor "blk\\.(15|16|17)\\.ffn_(gate|up|down)_exps\\.weight=CPU"';
validateDeploymentLoad(input);
await fs.writeFile('test/20261007/mimo-load-fix/placement-candidate.json',JSON.stringify(input,null,2));console.log(JSON.stringify({cuts:input.stages.map(s=>[s.layerStart,s.layerEnd]),savedToStudio:false}));

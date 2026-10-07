import {connect} from 'node:net';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {encodeAgentInspectionRequest,decodeAgentInspectionResponse,finishP4ConnectionFrame,P4FrameReader,frameP4Event,decodeP4Event} from '@p4studio/p4-protocol';
const phase=process.argv[2];
const result=await new Promise(resolve=>{
 const address='tcp://192.168.0.17:52000',id=randomUUID(),reader=new P4FrameReader();let snapshot,rawPayload,done=false;
 const socket=connect({host:'192.168.0.17',port:52000});
 const timer=setTimeout(()=>end({error:'timeout'}),15000);
 function end(extra){if(done)return;done=true;clearTimeout(timer);if(!socket.destroyed)socket.resetAndDestroy();resolve({address,...extra});}
 socket.once('connect',()=>socket.write(frameP4Event(encodeAgentInspectionRequest({agentAddress:address,correlationId:id,channel:`tuf-reset-${randomUUID()}`}))));
 socket.on('data',chunk=>{try{for(const frame of reader.push(chunk,true)){
  if(frame.length===0)end({snapshot,rawPayload,ack:true});
  else {rawPayload=JSON.parse(new TextDecoder().decode(decodeP4Event(frame).payload));snapshot=decodeAgentInspectionResponse(frame,id);socket.write(finishP4ConnectionFrame());}
 }}catch(error){end({error:String(error)});}});
 socket.once('error',error=>end({error:String(error)}));socket.once('close',()=>end({snapshot,error:'closed without ACK'}));
});
writeFileSync(new URL(`inspect-${phase}.json`,import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({address:result.address,ack:result.ack,error:result.error,nodes:result.snapshot?.nodes,broker:result.snapshot?.broker}));
if(result.error||!result.ack)process.exitCode=1;
if(phase==='after'&&result.snapshot?.nodes?.length!==0)process.exitCode=1;

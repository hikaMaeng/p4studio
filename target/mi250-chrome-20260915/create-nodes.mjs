import net from 'node:net';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { encodeP4Event,decodeP4Event,frameP4Event,P4FrameReader,sameEndpoint } from '@p4studio/p4-protocol';
const operation=randomUUID(),outer={kind:'outer',address:'tcp://127.0.0.1:42010',channel:operation,generation:1};
const socket=net.connect(42010,'127.0.0.1');
await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject)});
const reader=new P4FrameReader(),pending=new Map(),receipts=[];
socket.on('data',chunk=>{for(const frame of reader.push(chunk)){const e=decodeP4Event(frame);pending.get(e.causationId)?.(e)}});
let sequence=0;
try {
 for(let i=0;i<4;i++) {
  const event={eventId:randomUUID(),correlationId:operation,causationId:null,source:outer,target:{kind:'agent',address:`tcp://127.0.0.1:${i<2?42011:42012}`},returnRoute:outer,class:0,sequence:++sequence,deadline:Date.now()+15000,adapterKind:null,contentType:'application/vnd.p4.node.create-v3+json',payload:new TextEncoder().encode(JSON.stringify({node_id:`step37-s${i}`,node_generation:1,adapter_kind:'llamacpp'}))};
  const reply=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CREATE completion unknown')),15000);pending.set(event.eventId,e=>{clearTimeout(timer);resolve(e)});socket.write(frameP4Event(encodeP4Event(event)))});
  const payload=JSON.parse(new TextDecoder().decode(reply.payload));
  if(!sameEndpoint(reply.source,event.target)||!sameEndpoint(reply.target,outer)||reply.correlationId!==operation||reply.contentType!=='application/vnd.p4.node.result-v3+json'||!payload.ok)throw Error(JSON.stringify({reply,payload}));
  receipts.push({...reply,payload}); console.log(`step37-s${i} CREATE ok`);
 }
} finally {socket.end();await writeFile(new URL('./create-receipts.json',import.meta.url),JSON.stringify(receipts,null,2))}

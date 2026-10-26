import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadModule} from './helpers/load-ts.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
const promptModule=loadModule('lib/captions/prompt.ts');
const {CAPTION_COUNT}=loadModule('lib/captions/validation.ts');
const app=CAPTION_COUNT===3?'main':'admin';
const ID='44444444-4444-4444-8444-444444444444',USER='11111111-1111-4111-8111-111111111111';
function runtimeDB(){
 const log=[];const requests=[],responses=[];
 const tables={
 caption_lab_mix:[{chain_id:ID,weight:1,enabled:true,caption_lab_chains:{application:app,enabled:true}}],
 caption_lab_steps:[{id:ID,position:1,model_id:ID,system_template:promptModule.SYSTEM_INSTRUCTION,user_template:promptModule.buildUserPrompt({context:null,tone:null,perspective:'student'}).split('\n')[0]+'\n{{perspective}}\n{{tone}}\n{{context}}',caption_lab_models:{model_key:'gemini-3.8-flash',active:true,caption_lab_providers:{slug:'google-gemini',active:true}}}],
 };
 const db={from(table){const ops=[];const query={};for(const op of ['select','eq','order','insert','upsert','update','in'])query[op]=(...args)=>{ops.push([op,...args]);log.push([table,op,...args]);return query;};const result=()=>{
  const insert=ops.find(o=>o[0]==='insert');
  if(table==='caption_lab_images')return {data:{id:ID,state:'available'},error:null};
  if(table==='caption_lab_requests'){if(insert)requests.push(insert[1]);return {data:{id:ID},error:null};}
  if(table==='caption_lab_responses'){if(insert)responses.push(insert[1]);return {data:null,error:null};}
  if(table==='ai_captions')return {data:[{id:ID}],error:null};
  return {data:tables[table]??[],error:null};
 };query.single=async()=>result();query.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return query;}};
 return {db,log,requests,responses,tables};
}
const runtime=()=>loadModule('lib/captions/runtime.ts',{'server-only':{}});
const gemini=loadModule('lib/captions/gemini.ts');
const input={path:USER+'/'+ID+'.png',mimeType:'image/png',bytes:20};
const options={context:'Test photo',tone:'dry',perspective:'professor'};
test('runtime stores exact executed prompts and links request, provider attempts, model and captions',async()=>{
 const t=runtimeDB();const execution=await runtime().beginGeneration(t.db,USER,app,input,options,'gemini-3.8-flash');
 let sent;
 const payload={candidates:[{finishReason:'STOP',content:{parts:[{text:'hidden reasoning must never be stored',thought:true},{text:JSON.stringify({alt_text:'A test image.',captions:['Short caption one.','Short caption two.','Short caption three.'].slice(0,CAPTION_COUNT)})}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:8,totalTokenCount:20,other:'secret'}};
 await gemini.generateCaptions({prompt:execution.prompt,image:new Uint8Array([1]),mimeType:'image/png'},{apiKey:'fixture-key',model:'gemini-3.8-flash',fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify(payload));},onAttempt:execution.onAttempt});
 await execution.finish([ID]);
 assert.equal(t.requests.length,1);assert.equal(t.requests[0].requester_id,USER);assert.equal(t.requests[0].application,app);assert.equal(t.requests[0].perspective,'professor');assert.equal(t.requests[0].tone,'dry');
 assert.equal(t.requests[0].prompt_snapshot.systemInstruction,sent.systemInstruction.parts[0].text);assert.equal(t.requests[0].prompt_snapshot.userPrompt,sent.contents[0].parts[1].text);
 assert.equal(t.responses.length,1);assert.equal(t.responses[0].request_id,ID);assert.equal(t.responses[0].status,'succeeded');assert.deepEqual(plain(t.responses[0].usage),{promptTokenCount:12,candidatesTokenCount:8,totalTokenCount:20});
 const logs=JSON.stringify([t.requests,t.responses]);assert.doesNotMatch(logs,/hidden reasoning|fixture-key|inlineData|Authorization/);assert.match(t.responses[0].output.text,/Short caption/);
 assert.ok(t.log.some(c=>c[0]==='ai_captions'&&c[1]==='update'&&c[2].generation_request_id===ID));
});
test('failed provider attempts and bounded retries are recorded without provider error bodies',async()=>{
 const t=runtimeDB();const execution=await runtime().beginGeneration(t.db,USER,app,input,options,'gemini-3.8-flash');
 await assert.rejects(gemini.generateCaptions({prompt:execution.prompt,image:new Uint8Array([1]),mimeType:'image/png'},{apiKey:'fixture-key',model:'gemini-3.8-flash',retryDelayMs:0,attempts:99,fetchImpl:async()=>new Response('Authorization: fixture-key',{status:503}),onAttempt:execution.onAttempt}),e=>e.code==='http_503');
 await execution.finish([],'http_503');assert.deepEqual(t.responses.map(r=>r.attempt),[1,2]);assert.ok(t.responses.every(r=>r.status==='failed'&&r.error_code==='http_503'&&r.output===null&&r.usage===null));assert.doesNotMatch(JSON.stringify(t.responses),/Authorization|fixture-key/);assert.ok(t.log.some(c=>c[0]==='caption_lab_requests'&&c[1]==='update'&&c[2].status==='failed'));
});
test('inactive or unsupported runtime catalogs fail before any request/provider call',async()=>{
 const t=runtimeDB();t.tables.caption_lab_steps[0].caption_lab_models.active=false;await assert.rejects(runtime().beginGeneration(t.db,USER,app,input,options,'gemini-3.8-flash'),/configured active Gemini model/);assert.equal(t.requests.length,0);
});

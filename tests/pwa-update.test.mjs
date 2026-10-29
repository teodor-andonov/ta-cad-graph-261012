import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MessageChannel} from 'node:worker_threads';

const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const client=await readFile(new URL('../pwa-update.js',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));

async function harness(answers=[true],sourceInScope=true){
  const listeners=new Map(),messages=[],deleted=[];
  const scope='https://example.org'+manifest.id;
  let activated=0;
  const windows=answers.map((answer,i)=>({url:scope+'?tab='+i,postMessage(message,ports){
    messages.push(message.type);
    if(message.type==='TA_UPDATE_PREPARE'&&answer!==null){ports[0].postMessage({ready:answer});ports[0].close();}
  }}));
  windows.push({url:'https://example.org/unrelated-app/',postMessage(){throw Error('Contacted a different app');}});
  const self={registration:{scope},location:{origin:'https://example.org'},
    addEventListener:(type,fn)=>listeners.set(type,fn),
    clients:{matchAll:async()=>windows,claim:async()=>{}},
    skipWaiting:async()=>{activated++;}};
  const caches={open:async()=>({addAll:async()=>{}}),keys:async()=>[],delete:async key=>deleted.push(key)};
  new Function('self','caches','MessageChannel','setTimeout','clearTimeout',sw.replace(/^import .*\r?\n/gm,''))(
    self,caches,MessageChannel,(fn,ms)=>setTimeout(fn,Math.min(ms,30)),clearTimeout);
  let install;
  listeners.get('install')({waitUntil:p=>install=p});await install;
  assert.equal(activated,0,'install must wait instead of silently taking over');
  let pending,response;
  listeners.get('message')({data:{type:'TA_UPDATE_APPLY'},source:{url:sourceInScope?scope:'https://example.org/other/'},ports:[{postMessage:value=>response=value}],waitUntil:p=>pending=p});
  await pending;
  return {activated,response,messages};
}
test('update applies only when all same-app windows are ready',async()=>{
  const result=await harness([true,true]);
  assert.equal(result.activated,1);
  assert.deepEqual(result.response,{accepted:true});
  assert.equal(result.messages.filter(x=>x==='TA_UPDATE_PREPARE').length,2);
});
test('dirty window blocks activation and releases prepared windows',async()=>{
  const result=await harness([true,false]);
  assert.equal(result.activated,0);
  assert.deepEqual(result.response,{accepted:false});
  assert.equal(result.messages.filter(x=>x==='TA_UPDATE_CANCEL').length,2);
});
test('old or unresponsive windows fail closed',async()=>{
  const result=await harness([null]);
  assert.equal(result.activated,0);
  assert.deepEqual(result.response,{accepted:false});
});
test('an unrelated app cannot activate this worker',async()=>{
  const result=await harness([true],false);
  assert.equal(result.activated,0);
  assert.deepEqual(result.response,{accepted:false});
});
test('client retains user choice and uses an app-specific safety guard',()=>{
  assert.match(client,/window\.taPwaCanUpdate/);
  assert.match(client,/Update now/);
  assert.match(client,/'Later'/);
  assert.match(client,/updatefound/);
  assert.match(client,/controllerchange/);
  assert.doesNotMatch(client,/visibilityState[^\n]+location.reload/);
});

test('update controls cannot collide with application selectors',()=>{
  const ids=[...client.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(ids.length>=8);
  assert.ok(ids.every(id=>id.startsWith('ta-pwa-')));
});

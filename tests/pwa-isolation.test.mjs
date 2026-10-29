import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
const worker=await readFile(new URL('../sw.js',import.meta.url),'utf8');

test('TaCodegraph has a stable app-specific identity and concise names',()=>{
  assert.equal(manifest.id,'/ta-cad-graph-261012/');
  assert.equal(manifest.name,'TaCodegraph');
  assert.equal(manifest.short_name,'TaCodegraph');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
});

test('activation preserves every other app cache and the current shell',async()=>{
  const listeners=new Map(),deleted=[];
  const current=worker.match(/const CACHE='([^']+)'/)[1];
  const foreign=['graphic-pad:https://example.org/261028_gaphic-pad/:old','sourcebook-shell-old','mindmap-shell-old','ta-svg-viewer-261012-shell-v5','ta-svg-viewer-261012-inbox-v1','unrelated'];
  const caches={keys:async()=>[current,'cad-graph-shell-old',...foreign],delete:async key=>deleted.push(key)};
  const self={addEventListener:(event,fn)=>listeners.set(event,fn),clients:{claim:async()=>{}},registration:{scope:'https://example.org/ta-cad-graph-261012/'},location:{origin:'https://example.org'}};
  new Function('self','caches',worker)(self,caches);
  let pending;
  listeners.get('activate')({waitUntil:promise=>pending=promise});
  await pending;
  assert.deepEqual(deleted,['cad-graph-shell-old']);
  let handled=false;
  listeners.get('fetch')({request:{method:'GET',url:'https://example.org/261025-2132_sourcebook/'},respondWith:()=>handled=true});
  assert.equal(handled,false,'requests to another app are not intercepted');
});

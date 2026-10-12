const $ = id => document.getElementById(id);
const state = {worker:null,graph:null,rawFiles:[],project:'',file:'*',rank:'depth',selected:null,trace:true,
  layout:null,scale:1,tx:0,ty:0,request:0,panning:false,drag:null};
const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_W=194, NODE_H=63, RANK_GAP=265, ROW_GAP=88, MARGIN=96;

const makeSvg = (tag, attrs={}, text=null) => {
  const el=document.createElementNS(SVG_NS,tag);
  Object.entries(attrs).forEach(([name,value])=>el.setAttribute(name,String(value)));
  if(text!==null)el.textContent=String(text);
  return el;
};
const clean = text => (text ?? '').toString();
const cut = (str, n) => clean(str).length > n ? clean(str).slice(0,n-1)+'…' : clean(str);
const childrenBy = graph => {
  const children=new Map(); graph.nodes.forEach(n=>children.set(n.id,[]));
  graph.edges.forEach(e=>children.get(e.source)?.push(e.target)); return children;
};
const parentsBy = graph => {
  const parents=new Map(); graph.nodes.forEach(n=>parents.set(n.id,[]));
  graph.edges.forEach(e=>parents.get(e.target)?.push(e.source)); return parents;
};
function upstream(id){
  if(!state.graph||!id)return new Set();
  const parents=parentsBy(state.graph), visited=new Set(), todo=[id];
  while(todo.length){const current=todo.pop();if(visited.has(current))continue;visited.add(current);todo.push(...(parents.get(current)||[]));}
  return visited;
}
function distances(id){
  const dist=new Map(); if(!state.graph||!id)return dist;
  const children=childrenBy(state.graph), queue=[id];dist.set(id,0);
  for(let i=0;i<queue.length;i++)for(const v of children.get(queue[i])||[])if(!dist.has(v)){dist.set(v,dist.get(queue[i])+1);queue.push(v);}
  return dist;
}
function rankOf(n, selectedDistances){
  if(state.rank==='from_selected')return selectedDistances.get(n.id)??null;
  return n[state.rank]??0;
}
function visibleNodes(){
  if(!state.graph)return [];
  let nodes=state.graph.nodes;
  if(state.file!=='*'){
    const own=nodes.filter(n=>n.file===state.file), ownIds=new Set(own.map(n=>n.id));
    const context=new Set();state.graph.edges.forEach(e=>{if(ownIds.has(e.target))context.add(e.source);});
    nodes=nodes.filter(n=>ownIds.has(n.id)||context.has(n.id));
  }
  return nodes.slice(0,520);
}
function graphLayout(){
  let nodes=visibleNodes(), dist=distances(state.selected), depths=new Map();
  nodes=nodes.filter(n=>rankOf(n,dist)!==null);
  for(const n of nodes){const rank=rankOf(n,dist);if(!depths.has(rank))depths.set(rank,[]);depths.get(rank).push(n);}
  const ranks=[...depths.keys()].sort((a,b)=>a-b);
  const nodeMap=new Map(nodes.map(n=>[n.id,n]));
  const parentMap=parentsBy(state.graph);
  for(const rank of ranks){
    const arr=depths.get(rank);
    arr.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.id.localeCompare(b.id));
    // Barycentric order to minimise crossings across successive ranks.
    if(rank!==ranks[0])arr.sort((a,b)=>{
      function centroid(n){const refs=parentMap.get(n.id)||[], pos=refs.map(x=>nodeMap.get(x)).filter(x=>x&&rankOf(x,dist)<rank)
        .map(x=>depths.get(rankOf(x,dist)).indexOf(x));return pos.length?pos.reduce((x,y)=>x+y,0)/pos.length:Infinity;}
      return centroid(a)-centroid(b) || a.file.localeCompare(b.file)||a.line-b.line;
    });
  }
  const maxRows=Math.max(1,...ranks.map(r=>depths.get(r).length));
  const positions=new Map();
  ranks.forEach((rank,i)=>{
    const group=depths.get(rank);const height=(group.length-1)*ROW_GAP;
    group.forEach((n,j)=>positions.set(n.id,{x:MARGIN+i*RANK_GAP,y:MARGIN+54+((maxRows-1)*ROW_GAP-height)/2+j*ROW_GAP,rank}));
  });
  return {nodes,positions,ranks,depths,width:MARGIN*2+Math.max(0,ranks.length-1)*RANK_GAP+NODE_W,
    height:MARGIN*2+(maxRows-1)*ROW_GAP+NODE_H+54,dist};
}
function draw(){
  $('edgeLayer').replaceChildren();$('nodeLayer').replaceChildren();
  if(!state.graph){return;}
  const layout=graphLayout();state.layout=layout;
  const {positions,ranks,depths}=layout;
  const root=makeSvg('g');
  for(let i=0;i<ranks.length;i++){
    const rank=ranks[i], x=MARGIN+i*RANK_GAP;
    root.append(makeSvg('line',{class:'rank-guide',x1:x-18,x2:x-18,y1:46,y2:layout.height-45}));
    const caption=state.rank==='depth'?'STAGE':state.rank==='min_depth'?'DISTANCE':'STEPS';
    root.append(makeSvg('text',{class:'rank-label',x,y:54},`${caption} ${String(rank).padStart(2,'0')}`));
  }
  $('edgeLayer').append(root);
  const high=state.trace&&state.selected?upstream(state.selected):null;
  const edgeFragment=document.createDocumentFragment();
  for(const edge of state.graph.edges){
    const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;
    const x1=a.x+NODE_W,y1=a.y+NODE_H/2,x2=b.x,y2=b.y+NODE_H/2;
    const bend=Math.max(35,Math.abs(x2-x1)*0.46);
    const path=makeSvg('path',{d:`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`,
      class:'edge-path'+(high?(high.has(edge.source)&&high.has(edge.target)?' focus':' faded'):'')});
    edgeFragment.append(path);
  }
  $('edgeLayer').append(edgeFragment);
  const fragment=document.createDocumentFragment();
  for(const node of layout.nodes){
    const p=positions.get(node.id);if(!p)continue;
    // Explicitly assign ancestors/faded; keep selected legible.
    const cls='graph-node kind-'+node.kind+(node.id===state.selected?' selected':'')+
      (high?(high.has(node.id)?(node.id===state.selected?'':' ancestor'):' faded'):'');
    const group=makeSvg('g',{class:cls,transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':node.name+' — '+node.file});
    group.append(makeSvg('rect',{class:'node-box',rx:7,width:NODE_W,height:NODE_H}));
    group.append(makeSvg('text',{class:'node-kicker',x:12,y:16},node.kind.toUpperCase()));
    group.append(makeSvg('text',{class:'node-title',x:12,y:36},cut(node.name,27)));
    group.append(makeSvg('text',{class:'node-op',x:12,y:52},cut(node.operation||node.expression||node.scope,31)));
    group.addEventListener('click',()=>selectNode(node.id));
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(node.id);}});
    fragment.append(group);
  }
  $('nodeLayer').append(fragment);
  $('rankSummary').textContent=`${layout.nodes.length} VISIBLE NODES · ${ranks.length} LEVELS`;
  applyView();
}
function applyView(){$('viewport').setAttribute('transform',`translate(${state.tx} ${state.ty}) scale(${state.scale})`);}
function fit(){
  if(!state.layout)return;
  const surface=$('graphSurface'),w=surface.clientWidth,h=surface.clientHeight;
  const ww=state.layout.width+40, hh=state.layout.height+80;
  state.scale=Math.max(.13,Math.min(1.35,(w-40)/ww,(h-30)/hh));
  state.tx=(w-state.layout.width*state.scale)/2;
  state.ty=(h-state.layout.height*state.scale)/2;
  applyView();
}
function zoom(mult, x=$('graphSurface').clientWidth/2,y=$('graphSurface').clientHeight/2){
  const scale=Math.max(.12,Math.min(3,state.scale*mult)),ratio=scale/state.scale;
  state.tx=x-(x-state.tx)*ratio;state.ty=y-(y-state.ty)*ratio;state.scale=scale;applyView();
}
function pick(id){return state.graph?.nodes.find(n=>n.id===id);}
function selectNode(id){
  state.selected=id;state.trace=true;
  $('inspectorEmpty').classList.add('hidden');$('inspectorContent').classList.remove('hidden');
  const node=pick(id);if(!node)return;
  $('nodeKind').textContent=node.kind.toUpperCase();$('nodeName').textContent=node.name;
  $('nodeRank').textContent=state.rank==='from_selected'?'0':clean(node[state.rank]);
  $('nodeLine').textContent=node.line||'—';$('nodeSource').textContent=`${node.file}  /  ${node.scope}`;
  $('nodeExpression').textContent=node.expression||'(implicit source / function argument)';
  const parents=parentsBy(state.graph), children=childrenBy(state.graph);
  showDeps('upstreamList','upstreamCount',parents.get(id)||[]);
  showDeps('downstreamList','downstreamCount',children.get(id)||[]);
  $('traceButton').textContent='Show full graph';
  if(state.rank==='from_selected'){draw();fit();}else draw();
}
function showDeps(containerId,countId,ids){
  $(countId).textContent=ids.length;
  $(containerId).replaceChildren();
  if(!ids.length){const no=document.createElement('span');no.textContent='None';no.style.color='#647473';$(containerId).append(no);return;}
  for(const id of ids){const n=pick(id);if(!n)continue;const btn=document.createElement('button');btn.textContent=`↗ ${cut(n.name,23)}`;btn.title=n.file+' / '+n.scope;btn.addEventListener('click',()=>{
    if(state.file!=='*'&&state.file!==n.file){state.file='*';showFiles();}
    selectNode(id);
  });$(containerId).append(btn);}
}
function showFiles(){
  const list=$('fileList');list.replaceChildren();
  if(!state.graph)return;
  const counts=new Map();state.graph.files.forEach(f=>counts.set(f,0));state.graph.nodes.forEach(n=>counts.set(n.file,(counts.get(n.file)||0)+1));
  const entries=[['*','All Python files',state.graph.nodes.length],...[...counts].map(([path,count])=>[path,path,count])];
  for(const [id,label,count] of entries){
    const btn=document.createElement('button');btn.className='file-item'+(state.file===id?' active':'');btn.title=label;
    const ico=document.createElement('span');ico.className='file-icon';ico.textContent=id==='*'?'▦':'◇';
    const name=document.createElement('span');name.className='filename';name.textContent=label;
    const amount=document.createElement('span');amount.className='file-qty';amount.textContent=count;
    btn.append(ico,name,amount);btn.addEventListener('click',()=>{state.file=id;showFiles();draw();fit();});list.append(btn);
  }
  $('fileCount').textContent=state.graph.files.length;
}
let currentWorker=null;
function ensureWorker(){
  if(!currentWorker){currentWorker=new Worker('./worker.js');
    currentWorker.onmessage=({data})=>{
      if(data.type==='status'){$('progressText').textContent=data.text;return;}
      if(data.id!==state.request)return;
      $('progress').classList.add('hidden');
      if(data.type==='error'){alert(`Analysis failed: ${data.message}\n\nCheck connectivity for the first Python runtime download.`);return;}
      state.graph=data.graph;state.selected=null;state.file='*';state.rank='depth';
      document.querySelectorAll('[data-rank]').forEach(b=>b.classList.toggle('active',b.dataset.rank==='depth'));
      $('projectName').textContent=state.project;
      $('projectTitle').textContent=state.project;
      $('projectMeta').textContent=`${state.graph.meta.files} Python files · ${state.rawFiles.length} selected`;
      $('graphStats').textContent=`${state.graph.meta.nodes} nodes / ${state.graph.meta.edges} links`;
      $('exportButton').disabled=false;
      $('emptyState').classList.add('hidden');
      $('inspectorEmpty').classList.remove('hidden');$('inspectorContent').classList.add('hidden');
      $('warningsCount').textContent=state.graph.meta.warning_count;
      $('warningsButton').disabled=false;$('warningsList').replaceChildren();
      for(const w of state.graph.warnings){const el=document.createElement('div');el.textContent='! '+w;$('warningsList').append(el);}
      $('warningsList').classList.add('hidden');showFiles();draw();fit();
      if(state.graph.nodes.length>520)$('rankSummary').textContent+=' · FILTER FILES TO VIEW MORE';
    };
    currentWorker.onerror=e=>{$('progress').classList.add('hidden');alert('Python worker error: '+e.message);};
  }
  return currentWorker;
}
async function analyse(files, project){
  if(!files.length){alert('No .py files were found.');return;}
  state.rawFiles=files;state.project=project;
  $('progress').classList.remove('hidden');$('progressText').textContent='Preparing analysis…';
  ensureWorker().postMessage({type:'analyze',id:++state.request,files});
}
function usable(path){return path.endsWith('.py')&&!path.split('/').some(part=>['.git','__pycache__','.venv','venv','env','node_modules','site-packages','build','dist','.mypy_cache'].includes(part));}
async function openFolder(){
  if(window.showDirectoryPicker){
    try{const root=await showDirectoryPicker({mode:'read'});const files=[];
      async function walk(handle,prefix='',depth=0){if(depth>14)throw new Error('Folder nesting limit exceeded');
        for await(const [name,item] of handle.entries()){
          const path=prefix+name;
          if(item.kind==='directory'&&!['.git','__pycache__','.venv','venv','env','node_modules','site-packages','build','dist','.mypy_cache'].includes(name))await walk(item,path+'/',depth+1);
          else if(item.kind==='file'&&usable(path)){const f=await item.getFile();if(f.size<=750000)files.push({path,content:await f.text()});}
        }
      }
      await walk(root);await analyse(files,root.name);return;
    }catch(e){if(e.name==='AbortError')return;console.warn('Directory picker failed; using fallback',e);}
  }
  $('folderInput').click();
}
async function handleFiles(fileList,individual=false){
  const all=[...fileList], files=[];
  for(const f of all){const path=(individual?f.name:(f.webkitRelativePath||f.name));if(usable(path)&&f.size<=750000)files.push({path,content:await f.text()});}
  if(!files.length){alert('No supported Python files found.');return;}
  let prefix='';if(!individual){prefix=files[0].path.split('/')[0];if(files.every(f=>f.path.startsWith(prefix+'/')))files.forEach(f=>f.path=f.path.slice(prefix.length+1));}
  await analyse(files,prefix||'Selected Python files');
}
async function loadExample(){
  try{const paths=['examples/parameters.py','examples/geometry.py'];const files=await Promise.all(paths.map(async path=>{
    const res=await fetch('./'+path);if(!res.ok)throw Error(`Could not load ${path}`);
    return {path:path.slice(9),content:await res.text()};
  })); await analyse(files,'Example / wall + window');
  }catch(e){alert('Example unavailable: '+e.message);}
}
function download(filename,content,type='text/plain'){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportMermaid(){
  const g=state.graph;if(!g)return '';
  const lines=['flowchart LR'];
  for(const node of g.nodes){const label=(node.name+'\\n'+node.file).replaceAll('"',"'").replaceAll('<','(').replaceAll('>',')');lines.push(`  ${node.id}["${label}"]`);}
  for(const edge of g.edges)lines.push(`  ${edge.source} --> ${edge.target}`);
  lines.push('  classDef input fill:#d9eadf,stroke:#549b83');
  for(const n of g.nodes.filter(n=>n.kind==='input'))lines.push(`  class ${n.id} input`);
  return lines.join('\n')+'\n';
}
function exportData(){
  if(!state.graph)return;
  const json=JSON.stringify(state.graph,null,2), mermaid=exportMermaid();
  // One click downloads both formats with distinct filenames.
  download('cad-graph.json',json,'application/json');
  setTimeout(()=>download('cad-graph.mmd',mermaid),200);
}
function setupInteractions(){
  $('folderButton').onclick=$('emptyFolder').onclick=openFolder;
  $('filesButton').onclick=()=>$('filesInput').click();
  $('folderInput').onchange=e=>handleFiles(e.target.files).then(()=>e.target.value='');
  $('filesInput').onchange=e=>handleFiles(e.target.files,true).then(()=>e.target.value='');
  $('demoButton').onclick=$('emptyDemo').onclick=loadExample;
  $('fitButton').onclick=$('resetView').onclick=fit;
  $('zoomIn').onclick=()=>zoom(1.2);$('zoomOut').onclick=()=>zoom(1/1.2);
  $('exportButton').onclick=exportData;
  $('warningsButton').onclick=()=>$('warningsList').classList.toggle('hidden');
  $('traceButton').onclick=()=>{state.trace=!state.trace;$('traceButton').textContent=state.trace?'Show full graph':'Trace upstream ↖';draw();};
  document.querySelectorAll('[data-rank]').forEach(btn=>btn.onclick=()=>{
    if(btn.dataset.rank==='from_selected'&&!state.selected){alert('Select a node first to calculate distances from it.');return;}
    state.rank=btn.dataset.rank;document.querySelectorAll('[data-rank]').forEach(b=>b.classList.toggle('active',b===btn));
    draw();fit();if(state.selected)$('nodeRank').textContent=state.rank==='from_selected'?'0':pick(state.selected)[state.rank];
  });
  const svg=$('graphSvg');
  svg.addEventListener('wheel',e=>{if(!state.graph)return;e.preventDefault();const r=svg.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||!state.graph||e.target.closest('.graph-node'))return;state.drag={x:e.clientX,y:e.clientY,tx:state.tx,ty:state.ty};svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');});
  svg.addEventListener('pointermove',e=>{if(!state.drag)return;state.tx=state.drag.tx+e.clientX-state.drag.x;state.ty=state.drag.ty+e.clientY-state.drag.y;applyView();});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(ev,()=>{state.drag=null;svg.classList.remove('dragging');});
  window.addEventListener('resize',()=>{if(state.graph)fit();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.graph){state.selected=null;state.trace=false;$('inspectorEmpty').classList.remove('hidden');$('inspectorContent').classList.add('hidden');if(state.rank==='from_selected'){state.rank='depth';document.querySelector('[data-rank="depth"]').click();}else draw();}});
}
setupInteractions();
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

/* Classic worker: real Python AST is parsed by Pyodide. Never executes user source. */
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let initialization = null;
async function ensureEngine() {
  if (!initialization) initialization = (async () => {
    self.postMessage({type:'status', text:'Loading Python runtime (first use may take a moment)…'});
    importScripts(PYODIDE_INDEX + 'pyodide.js');
    const pyodide = await loadPyodide({indexURL:PYODIDE_INDEX});
    self.postMessage({type:'status', text:'Loading dependency analyser…'});
    const response = await fetch('./analyzer.py');
    if (!response.ok) throw new Error('Could not load analyzer.py');
    const source = await response.text();
    pyodide.globals.set('_analyzer_source', source);
    pyodide.runPython("import types\n_analyser_module = types.ModuleType('cad_graph_analyzer')\nexec(_analyzer_source, _analyser_module.__dict__)\nanalyze_project = _analyser_module.analyze_project");
    pyodide.globals.delete('_analyzer_source');
    return pyodide;
  })().catch(e => {initialization = null; throw e;});
  return initialization;
}
self.onmessage = async event => {
  const {type, id, files} = event.data;
  if (type !== 'analyze') return;
  try {
    const engine = await ensureEngine();
    self.postMessage({type:'status', text:'Analysing Python dependencies…'});
    engine.globals.set('_source_files_json', JSON.stringify(files));
    const result = engine.runPython('import json\njson.dumps(analyze_project(json.loads(_source_files_json)))');
    engine.globals.delete('_source_files_json');
    self.postMessage({type:'result', id, graph:JSON.parse(result)});
  } catch (error) {
    self.postMessage({type:'error', id, message:error?.message || String(error)});
  }
};

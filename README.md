# CAD Graph

**A local-first, Python-only code dependency explorer for CAD-as-code projects.**

Load a directory of `.py` files; the PWA analyses their source code (without executing it) and produces an interactive graph of parameters, assignments, geometry operations, returns and their dependencies. It is a companion to Build123d / OCP / Python CAD projects — **it does not need to install those libraries** or run your model.

## Use

1. Visit the hosted GitHub Pages URL and choose **Open folder** (Chrome/Edge support native directory selection). Safari/Firefox and browsers without the File System Access API get a directory-input fallback.
2. Inspect the graph and switch between **prerequisite depth** (longest dependency chain), **shortest path** (fewest prerequisite edges), and **from selection** (BFS distance, outgoing, from a selected node).
3. Choose individual Python files in the left sidebar to reduce large graphs; external dependencies are shown for context.
4. Click any node to inspect the original expression, file/line, and upstream/downstream nodes. Select **Export** to download the JSON and Mermaid representations.
5. Install the web app through your browser's **Install** / **Add to Home screen** menu.

**Privacy:** Source is read in the browser, processed in a local Pyodide Web Worker, and never uploaded to a server. Your code is not sent to GitHub. The Python runtime downloads from jsDelivr on first run. The app shell is service-worker cached for offline reuse. The large Python runtime is cached as browser conditions allow, but **full offline analysis is not guaranteed**; initial runtime download requires internet.

## Analysis scope / known limitations

- Python AST analysis, not execution or tracing. Only `.py` files.
- Recursively discovers project files and excludes `.git`, virtual environments, `node_modules`, `__pycache__` and build directories.
- Tracks straightforward assignments, variable reads, function arguments/returns, static calls to functions in the project, and simple `from module import variable` references across files.
- Versioned reassignments, so `a = a + 1` references the previous `a` node.
- Handles files with syntax errors independently; exposes warnings.
- Ignores control-flow details (`for`, `if`, `with BuildPart`, comprehensions in control-flow, dynamic imports), mutating methods, attribute/subscript assignments, and method bodies of nested classes/functions. Imported calls are linked at a **definition level**, not precisely instantiated for each invocation. This is not equivalent to a complete execution dependency graph.
- Limits: 250 files, 1500 analysed nodes; viewer shows up to 520 nodes at once. For bigger projects, select a smaller folder or one file in the sidebar.

For geometry provenance in real CAD systems, the next major step is runtime tracing or explicit provenance instrumentation in Build123d/OCP, augmenting rather than replacing this static model.

## Local development

Run any local static server (file:// doesn't reliably support Workers/Service Workers):

```bash
python -m http.server 8000
```

Then open http://localhost:8000. No npm, build or Python packages required for the web app.

To run the standalone analyzer tests (requires local Python 3.10+):

```bash
python -m unittest -v test_analyzer
```

## GitHub Pages deployment

For [`teodor-andonov/ta-cad-graph-261012`](https://github.com/teodor-andonov/ta-cad-graph-261012), open **Settings → Pages → Build and deployment → Source → GitHub Actions**. The provided `.github/workflows/deploy.yml` deploys the static site automatically on pushes to `main`. The intended GitHub Pages address is `https://teodor-andonov.github.io/ta-cad-graph-261012/` (available after a successful deployment). HTTPS is necessary for the folder picker and installable PWA.

Private repositories may require plan-specific Pages permissions; a public repo is easiest. **Do not commit any private CAD source files**; use the app's folder picker locally instead.

## Design principle

`Python source → Python AST → dependency graph (JSON) → interactive visual layout / Mermaid export`

The code remains the source of truth. Graph structure is derived data. Future refinements can attach richer semantics (geometry types, operation families, explicit geometry lineage, data collections) without introducing a new CAD authoring DSL.

## License

MIT; see LICENSE.

## Deployment updates

The GitHub Pages site is deployed by `.github/workflows/deploy.yml` on every push to `main`. Check [GitHub Actions](https://github.com/teodor-andonov/ta-cad-graph-261012/actions/workflows/deploy.yml) for the test and deployment results. On Android, folder selection may vary by browser; for initial validation, try the bundled example first.

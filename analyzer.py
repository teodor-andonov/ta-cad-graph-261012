"""Source-only, project-wide Python dependency mapping. Runs in CPython or Pyodide.

Not an interpreter or a runtime execution tracer. It cannot infer dynamic dependencies.
"""
from __future__ import annotations
import ast
from collections import defaultdict, deque
from pathlib import PurePosixPath

IGNORE_DIRS = {'.git', '__pycache__', '.venv', 'venv', 'env', 'node_modules', 'site-packages', 'build', 'dist', '.mypy_cache'}
MAX_FILES = 250
MAX_NODES = 1500


def path_to_module(path):
    result = path[:-3].replace('/', '.')
    return result[:-9] if result.endswith('.__init__') else result


def read_names(expr):
    """Dependencies including call arguments, but not bare global function names."""
    seen = []
    class Visitor(ast.NodeVisitor):
        def visit_Name(self, item):
            if isinstance(item.ctx, ast.Load):
                seen.append(item.id)
        def visit_Call(self, item):
            if isinstance(item.func, ast.Attribute):
                self.visit(item.func.value)
            elif not isinstance(item.func, ast.Name):
                self.visit(item.func)
            for arg in item.args:
                self.visit(arg)
            for kw in item.keywords:
                self.visit(kw.value)
    Visitor().visit(expr)
    return list(dict.fromkeys(seen))


def calls(expr):
    names = []
    for item in ast.walk(expr):
        if isinstance(item, ast.Call):
            fn = item.func
            if isinstance(fn, ast.Name):
                names.append(fn.id)
            elif isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name):
                names.append(f'{fn.value.id}.{fn.attr}')
    return list(dict.fromkeys(names))


def operation(expr):
    cs = calls(expr)
    if cs:
        return ', '.join(c + '()' for c in cs[:2])
    if isinstance(expr, ast.BinOp):
        return type(expr.op).__name__
    return type(expr).__name__


def analyze_project(files):
    """Accept [{path, content}]; return nodes, edges, warnings, files and meta.

    Links are lexical/provisional: module-level assignments, function arguments,
    cross-module `from x import y`, and resolved static function calls.
    Control-flow and mutating builder operations are intentionally NOT inferred.
    """
    normalized = []
    for f in files:
        path = str(f.get('path', '')).replace('\\', '/').lstrip('/')
        if not path.endswith('.py') or any(seg in IGNORE_DIRS for seg in path.split('/')):
            continue
        if not path or '..' in path.split('/') or len(str(f.get('content', ''))) > 750000:
            continue
        normalized.append({'path': path, 'content': str(f.get('content', ''))})
    normalized.sort(key=lambda f: f['path'])
    if len(normalized) > MAX_FILES:
        raise ValueError(f'Maximum {MAX_FILES} Python files per scan (selected {len(normalized)}).')

    nodes, edges, warnings, parsed = [], [], [], {}
    modules = {path_to_module(f['path']): f['path'] for f in normalized}
    aliases = {}
    module_defs = defaultdict(dict)
    function_outputs = {}
    scopes = []
    unresolved = []
    edge_keys = set()

    def new_node(name, kind, path, scope, line, expr='', op=''):
        if len(nodes) >= MAX_NODES:
            raise ValueError(f'Graph exceeds {MAX_NODES} nodes. Select a smaller project.')
        uid = 'n' + str(len(nodes) + 1)
        node = dict(id=uid, name=name, kind=kind, file=path, scope=scope,
                    line=line, expression=expr[:1500], operation=op,
                    depth=0, min_depth=0, depends_on=[])
        nodes.append(node)
        return uid

    def connect(a, b):
        if a == b or a is None or b is None or (a, b) in edge_keys:
            return
        edge_keys.add((a, b))
        edges.append({'source': a, 'target': b})
        nodes[int(b[1:])-1]['depends_on'].append(a)

    def imports_for(path, tree):
        current = path_to_module(path)
        if path.endswith('/__init__.py'):
            package = current
        else:
            package = current.rpartition('.')[0]
        mapping = {}
        for stmt in tree.body:
            if isinstance(stmt, ast.Import):
                for a in stmt.names:
                    mapping[a.asname or a.name.split('.')[0]] = ('module', a.name)
            elif isinstance(stmt, ast.ImportFrom):
                if stmt.level:
                    parts = package.split('.') if package else []
                    base = '.'.join(parts[:max(0, len(parts) - stmt.level + 1)] + ([stmt.module] if stmt.module else []))
                else:
                    base = stmt.module or ''
                for a in stmt.names:
                    if a.name != '*':
                        mapping[a.asname or a.name] = ('symbol', base, a.name)
        return mapping

    # Parse all first; invalid files must not block valid siblings.
    for file in normalized:
        try:
            parsed[file['path']] = ast.parse(file['content'], filename=file['path'])
        except SyntaxError as ex:
            warnings.append(f"{file['path']}:{ex.lineno}: {ex.msg}; skipped file")
    for path, tree in parsed.items():
        aliases[path] = imports_for(path, tree)

    # Seed local roots and assignments in each scope, preserving reassignment versions.
    def scan_scope(path, label, statements, args=()):
        source = next(f['content'] for f in normalized if f['path'] == path)
        active = {}
        names_seen = defaultdict(int)
        is_module = label == '<module>'
        scope_key = (path, label)
        scopes.append(scope_key)

        def node_for(name, kind, stmt, value=None, extra=None):
            names_seen[name] += 1
            shown = name + (f' [{names_seen[name]}]' if names_seen[name] > 1 else '')
            line = getattr(stmt, 'lineno', 0)
            segment = (ast.get_source_segment(source, value) if value else '') or ''
            uid = new_node(shown, kind, path, label, line, segment, operation(value) if value else '')
            # Dependencies resolved after all module scopes exist, so globals work.
            if value is not None:
                for dep in read_names(value):
                    if dep in active:
                        connect(active[dep], uid)
                    else:
                        unresolved.append((uid, path, label, dep))
                for call in calls(value):
                    unresolved.append((uid, path, label, '@call:' + call))
            for dep in extra or ():
                if dep in active:
                    connect(active[dep], uid)
            active[name] = uid
            if is_module:
                module_defs[path][name] = uid
            return uid

        for arg in args:
            node_for(arg.arg, 'input', arg)

        for stmt in statements:
            if isinstance(stmt, ast.Assign):
                if all(isinstance(t, ast.Name) for t in stmt.targets):
                    for t in stmt.targets:
                        kind = 'parameter' if isinstance(stmt.value, ast.Constant) else 'operation'
                        node_for(t.id, kind, stmt, stmt.value)
                else:
                    warnings.append(f'{path}:{stmt.lineno}: destructuring/attribute assignment not tracked')
            elif isinstance(stmt, ast.AnnAssign):
                if isinstance(stmt.target, ast.Name) and stmt.value is not None:
                    node_for(stmt.target.id, 'parameter' if isinstance(stmt.value, ast.Constant) else 'operation', stmt, stmt.value)
                elif stmt.value is not None:
                    warnings.append(f'{path}:{stmt.lineno}: attribute assignment not tracked')
            elif isinstance(stmt, ast.AugAssign):
                if isinstance(stmt.target, ast.Name):
                    node_for(stmt.target.id, 'operation', stmt, stmt.value, [stmt.target.id])
                else:
                    warnings.append(f'{path}:{stmt.lineno}: in-place mutation not tracked')
            elif isinstance(stmt, ast.Return) and stmt.value is not None:
                node_for('return', 'output', stmt, stmt.value)
            elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                pass
            elif isinstance(stmt, (ast.Import, ast.ImportFrom, ast.Pass, ast.Global, ast.Nonlocal)):
                pass
            elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                pass
            elif isinstance(stmt, (ast.Expr, ast.For, ast.While, ast.If, ast.With, ast.Try, ast.Match)):
                warnings.append(f'{path}:{stmt.lineno}: {type(stmt).__name__} effects/control-flow not tracked')

        if not is_module:
            outputs = [uid for name, uid in active.items() if name == 'return']
            # scope function output can be passed to downstream call-sites
            if outputs:
                function_outputs[scope_key] = outputs[-1]

    for f in normalized:
        path = f['path']
        tree = parsed.get(path)
        if not tree:
            continue
        scan_scope(path, '<module>', tree.body)
        for statement in tree.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                fnargs = [*statement.args.posonlyargs, *statement.args.args, *statement.args.kwonlyargs]
                scan_scope(path, statement.name, statement.body, fnargs)
            elif isinstance(statement, ast.ClassDef):
                for method in statement.body:
                    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        fnargs = [*method.args.posonlyargs, *method.args.args, *method.args.kwonlyargs]
                        scan_scope(path, statement.name + '.' + method.name, method.body, fnargs)

    def resolve_symbol(path, symbol):
        # Symbol in local module or import target. Functions resolve to their return node.
        if symbol in module_defs[path]:
            return module_defs[path][symbol]
        if (path, symbol) in function_outputs:
            return function_outputs[(path, symbol)]
        origin = aliases.get(path, {}).get(symbol)
        if not origin:
            return None
        if origin[0] == 'symbol':
            target = modules.get(origin[1])
            if target:
                return module_defs[target].get(origin[2]) or function_outputs.get((target, origin[2]))
        return None

    for uid, path, scope, symbol in unresolved:
        if symbol.startswith('@call:'):
            fn = symbol[6:]
            if '.' in fn:
                prefix, member = fn.split('.', 1)
                origin = aliases.get(path, {}).get(prefix)
                if origin and origin[0] == 'module':
                    imported = modules.get(origin[1])
                    if imported:
                        connect(function_outputs.get((imported, member)), uid)
                # Don't infer arbitrary attribute method calls (could be CAD operation).
            else:
                resolved = resolve_symbol(path, fn)
                if resolved and nodes[int(resolved[1:])-1]['kind'] == 'output':
                    connect(resolved, uid)
        else:
            resolved = resolve_symbol(path, symbol)
            connect(resolved, uid)

    # Kahn topological ranking: shortest and LONGEST prerequisite depth.
    adj = defaultdict(list)
    indegree = {n['id']: 0 for n in nodes}
    for e in edges:
        indegree[e['target']] += 1
        adj[e['source']].append(e['target'])
    queue = deque(k for k, d in indegree.items() if d == 0)
    processed = 0
    while queue:
        nid = queue.popleft()
        processed += 1
        current = nodes[int(nid[1:]) - 1]
        for target in adj[nid]:
            child = nodes[int(target[1:]) - 1]
            child['depth'] = max(child['depth'], current['depth'] + 1)
            child['min_depth'] = min(child['min_depth'], current['min_depth'] + 1) if child['depends_on'] and child['min_depth'] else current['min_depth'] + 1
            indegree[target] -= 1
            if not indegree[target]:
                queue.append(target)
    if processed < len(nodes):
        warnings.append('Static cross-function dependency cycle detected. Cyclic depths are approximate.')
    if len(warnings) > 120:
        warnings = warnings[:120] + ['Additional warnings omitted.']
    return {'meta': {'analyser': 'AST static v1', 'files': len(parsed), 'nodes': len(nodes), 'edges': len(edges),
                     'warning_count': len(warnings), 'limits': {'files': MAX_FILES, 'nodes': MAX_NODES}},
            'nodes': nodes, 'edges': edges, 'warnings': warnings, 'files': sorted(parsed)}


if __name__ == '__main__':
    import json, sys
    paths = sys.argv[1:]
    result = analyze_project([{'path': p, 'content': open(p, encoding='utf8').read()} for p in paths])
    print(json.dumps(result, indent=2))

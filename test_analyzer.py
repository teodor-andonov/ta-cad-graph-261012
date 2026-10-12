import unittest
from pathlib import Path
from analyzer import analyze_project

ROOT = Path(__file__).parent

class GraphTest(unittest.TestCase):
    def test_two_files_and_imports(self):
        files = [{'path': p.name, 'content': p.read_text()} for p in (ROOT/'examples').glob('*.py')]
        g = analyze_project(files)
        self.assertEqual(g['meta']['files'], 2)
        self.assertTrue(len(g['nodes']) > 15)
        self.assertEqual(len(g['edges']), len(set((e['source'],e['target']) for e in g['edges'])))
        result = next(n for n in g['nodes'] if n['name']=='result')
        self.assertGreater(result['depth'], 1)
        wall_width = next(n for n in g['nodes'] if n['name']=='wall_width')
        wall = next(n for n in g['nodes'] if n['name']=='wall' and n['scope']=='<module>')
        self.assertTrue(any(e['source']==wall_width['id'] and e['target']==wall['id'] for e in g['edges']))
        return_nodes = [n for n in g['nodes'] if n['name']=='return' and n['file']=='geometry.py']
        self.assertEqual(len(return_nodes), 2)
        self.assertTrue(any(e['source']==return_nodes[0]['id'] and e['target']==wall['id'] for e in g['edges']))

    def test_syntax_error_is_isolated(self):
        g = analyze_project([{'path': 'good.py', 'content': 'a = 1\nb = a + 2'}, {'path': 'bad.py', 'content': 'oops = ('}])
        self.assertEqual(g['meta']['files'], 1)
        self.assertTrue(any('bad.py' in w for w in g['warnings']))

    def test_reassignment_versioning(self):
        g = analyze_project([{'path':'x.py','content':'a=1\na=a+1\nb=a'}])
        self.assertEqual([n['name'] for n in g['nodes']], ['a','a [2]','b'])
        self.assertEqual(g['nodes'][1]['depends_on'], ['n1'])

if __name__ == '__main__': unittest.main()

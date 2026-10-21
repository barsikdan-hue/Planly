"""Code packaging only here; actual permission probe runs in root CI fixture."""
import importlib.util
from pathlib import Path
import types
import unittest


def load():
    path = Path(__file__).with_name('owned_capability.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('owned_capability', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Inputs(unittest.TestCase):
    def test_probe_requires_explicit_reviewed_source_bytes_and_owned_marker(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'build_probe', None)), 'Owned preflight capability probe is missing')
        sources = {name: Path(__file__).with_name(name + '.py').read_bytes() for name in ('copy_observation', 'fd_pin')}
        code = m.build_probe(sources, 42, 123, 4, (1, 2), '/run/planly-a1-reuse-65f401ba-1c86-4c39-b7b7-a1d0fb23d71d')
        self.assertLessEqual(len(code.encode()), 65536)
        compile(code, '<owned-probe-fixture>', 'exec')
        with self.assertRaises(m.Incomplete):
            m.build_probe(sources, True, 123, 4, (1, 2), '/run/foreign')
        with self.assertRaises(m.Incomplete):
            m.build_probe(dict(sources, foreign=b''), 42, 123, 4, (1, 2), '/run/foreign')


if __name__ == '__main__':
    unittest.main()

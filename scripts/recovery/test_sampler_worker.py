"""No external dispatch: code packaging and own-process startup fixtures only."""
import importlib.util
import json
from pathlib import Path
import types
import unittest


def load():
    path = Path(__file__).with_name('sampler_worker.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('sampler_worker', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def config():
    run = '65f401ba-1c86-4c39-b7b7-a1d0fb23d71d'
    return dict(schema=1, runId=run, daemonPid=42, daemonStart=123,
                storePath='/tmp/owned-fixture', storeDevice=1, storeInode=2,
                nativeConfigId='sha256:' + 'a' * 64,
                runtimeRoot='/run/planly-a1-reuse-' + run,
                daemonVersion='29.9.1', daemonCommit='b26fb77')


class Packaging(unittest.TestCase):
    def test_code_contains_exact_reviewed_modules_and_fits_existing_child_cap(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'build_code', None)), 'Actual sampler worker bootstrap is missing')
        sources = {name: Path(__file__).with_name(name + '.py').read_bytes() for name in m.MODULES}
        code = m.build_code(sources, config())
        self.assertLessEqual(len(code.encode('utf8')), 65536)
        self.assertIn(config()['runtimeRoot'], code)
        compile(code, '<synthetic-bootstrap>', 'exec')
        with self.assertRaises(m.Incomplete):
            m.build_code(dict(sources, unexpected=b'import os'), config())
        with self.assertRaises(m.Incomplete):
            m.build_code(dict(sources, copy_sampler=b'x' * 65536), config())

    def test_unmatched_build_unbounded_or_noncanonical_identity_is_refused(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'validate_config', None)), 'Closed sampler config is missing')
        m.validate_config(config())
        for key, value in [('schema', True), ('daemonPid', True), ('daemonStart', 0), ('storePath', '/tmp/../x'),
                           ('daemonCommit', 'unknown'), ('runtimeRoot', '/run/foreign'), ('extra', 'field')]:
            with self.subTest(key=key), self.assertRaises(m.Incomplete):
                m.validate_config(dict(config(), **{key: value}))

    def test_start_frame_requires_same_run_finite_absolute_window_and_one_message(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'parse_start', None)), 'Closed START handshake is missing')
        row = dict(kind='START', runId=config()['runId'], start=10.0, deadline=70.0)
        self.assertEqual(m.parse_start(json.dumps(row).encode() + b'\n', config()['runId'], 10.1), row)
        for change in [dict(deadline=70.00001), dict(deadline=float('nan')), dict(runId='foreign'), dict(extra=True)]:
            with self.subTest(change=change), self.assertRaises(m.Incomplete):
                m.parse_start(json.dumps(dict(row, **change)).encode() + b'\n', config()['runId'], 10.1)
        with self.assertRaises(m.Incomplete):
            m.parse_start(b'{"kind":"START","kind":"START"}\n', config()['runId'], 10.1)


if __name__ == '__main__':
    unittest.main()

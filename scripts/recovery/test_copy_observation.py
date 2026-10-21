"""Synthetic, local-only tests. No Docker, SSH, credentials or saved VPS data."""
import copy
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest

HERE = Path(__file__).parent


def load():
    path = HERE / 'copy_observation.py'
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('copy_observation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample(start, end, position, size=8192):
    return dict(start=start, end=end, pid=42, processStart=123,
                source=dict(device=1, inode=100, position=position, size=size),
                destination=dict(device=1, inode=101, position=position, size=position))


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.m = load()

    def compare(self, *args):
        fn = getattr(self.m, 'compare', None)
        self.assertTrue(callable(fn), 'Observation comparison is not implemented')
        return fn(*args)

    def test_measured_pair_advance_has_a_bounded_interval_and_no_causal_verdict(self):
        result = self.compare(sample(1, 1.1, 1024), sample(3, 3.1, 5120), 0, 60)
        self.assertEqual(result['status'], 'PAIR_OFFSETS_ADVANCED')
        self.assertEqual(result['offsetDeltaBytes'], 4096)
        self.assertAlmostEqual(result['intervalSecondsMin'], 1.9)
        self.assertAlmostEqual(result['intervalSecondsMax'], 2.1)
        self.assertEqual(result['rootCause'], 'NOT_PROVEN')

    def test_zero_delta_never_means_kernel_stall(self):
        result = self.compare(sample(1, 1.1, 1024), sample(3, 3.1, 1024), 0, 60)
        self.assertEqual(result['status'], 'NO_OFFSET_ADVANCE_OBSERVED')
        self.assertEqual(result['rootCause'], 'NOT_PROVEN')

    def test_fd_reuse_new_process_file_shrink_or_disagreeing_offsets_are_inconclusive(self):
        for key, value in [('pid', 43), ('processStart', 124),
                           ('destination.inode', 102), ('source.device', 2),
                           ('source.size', 9000), ('source.position', 6000),
                           ('destination.position', 100), ('destination.size', 100)]:
            after = sample(3, 3.1, 5120)
            target = after
            parts = key.split('.')
            for part in parts[:-1]:
                target = target[part]
            target[parts[-1]] = value
            with self.subTest(key=key):
                self.assertEqual(self.compare(sample(1, 1.1, 1024), after, 0, 60)['status'], 'INCONCLUSIVE')

    def test_missing_overlap_late_nan_and_boolean_measurements_are_refused(self):
        cases = [(None, sample(3, 3.1, 5120)),
                 (sample(1, 4, 1024), sample(3, 3.1, 5120)),
                 (sample(1, 1.1, 1024), sample(59, 61, 5120)),
                 (sample(float('nan'), 1.1, 1024), sample(3, 3.1, 5120))]
        boolean = sample(1, 1.1, 1024)
        boolean['source']['position'] = True
        cases.append((boolean, sample(3, 3.1, 5120)))
        for before, after in cases:
            with self.subTest(before=before):
                self.assertEqual(self.compare(before, after, 0, 60)['status'], 'INCONCLUSIVE')


class ProcFixtureTests(unittest.TestCase):
    def fixture(self, root):
        proc = root / '42'
        (proc / 'fdinfo').mkdir(parents=True)
        (proc / 'fd').mkdir()
        (proc / 'stat').write_text('42 (fixture) ' + ' '.join(['S'] + ['0'] * 18 + ['123']))
        for fd, position, size in [(3, 1024, 8192), (4, 1024, 1024)]:
            (proc / 'fd' / str(fd)).write_bytes(b'x' * size)
            (proc / 'fdinfo' / str(fd)).write_text(f'pos: {position}\nflags: 0100000\n')

    def test_reads_only_metadata_and_refuses_missing_owner_or_process_drift(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'observe', None)), 'Metadata observer is missing')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            # Ownership is an independent prerequisite, not a boolean in a JSON grant.
            result = m.observe(42, 123, 3, 4, lambda: None, proc_root=root)
            self.assertEqual(result['source']['position'], 1024)
            self.assertEqual(result['source']['size'], 8192)
            self.assertNotIn('contents', result['source'])
            for pid, start, owner in [(True, 123, lambda: None), (42, 124, lambda: None), (42, 123, None)]:
                with self.subTest(pid=pid, start=start), self.assertRaises(m.Incomplete):
                    m.observe(pid, start, 3, 4, owner, proc_root=root)
            def refuse():
                raise m.Incomplete('OWNER_NOT_PROVEN')
            with self.assertRaises(m.Incomplete):
                m.observe(42, 123, 3, 4, refuse, proc_root=root)
            def drift():
                (root / '42' / 'stat').write_text('42 (replacement) ' + ' '.join(['S'] + ['0'] * 18 + ['124']))
            with self.assertRaises(m.Incomplete):
                m.observe(42, 123, 3, 4, drift, proc_root=root)

    def test_proc_parsers_handle_spaces_and_parentheses_in_comm_and_reject_duplicate_positions(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'process_start', None)), 'Bounded proc parsers are missing')
        fields = ['S'] + ['0'] * 18 + ['123'] + ['0'] * 8
        self.assertEqual(m.process_start('42 (name ) with spaces) ' + ' '.join(fields)), 123)
        self.assertEqual(m.fd_position('pos:\t4096\nflags:\t0100001\nmnt_id:\t1\nino:\t9\n'), 4096)
        for raw in ('pos: 1\npos: 2\n', 'pos: -1\n', 'flags: 0\n', 'pos: NaN\n'):
            with self.subTest(raw=raw), self.assertRaises(m.Incomplete):
                m.fd_position(raw)


@unittest.skipUnless(sys.platform == 'linux', 'Requires real Linux procfs and copy_file_range; run in dedicated CI')
class LinuxCopyTests(unittest.TestCase):
    def test_real_nil_offset_copy_advances_the_observed_pair(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'observe', None)), 'Metadata observer is missing')
        pid = os.getpid()
        start = m.process_start(Path(f'/proc/{pid}/stat').read_text())
        with tempfile.TemporaryDirectory() as directory:
            with open(Path(directory) / 'source', 'w+b') as src, open(Path(directory) / 'target', 'w+b') as dst:
                src.write(b'x' * 16384)
                src.flush()
                src.seek(0)
                window = time.monotonic()
                self.assertEqual(os.copy_file_range(src.fileno(), dst.fileno(), 1024), 1024)
                # This is our own process and our own two still-open fixture FDs.
                def owner():
                    if os.getpid() != pid or src.closed or dst.closed:
                        raise m.Incomplete('FIXTURE_OWNER_LOST')
                before = m.observe(pid, start, src.fileno(), dst.fileno(), owner)
                self.assertEqual(os.copy_file_range(src.fileno(), dst.fileno(), 4096), 4096)
                after = m.observe(pid, start, src.fileno(), dst.fileno(), owner)
                result = m.compare(before, after, window, window + 60)
                self.assertEqual(result['status'], 'PAIR_OFFSETS_ADVANCED')
                self.assertEqual(result['offsetDeltaBytes'], 4096)


if __name__ == '__main__':
    unittest.main()

"""Only synthetic layouts and owned children; no Docker or server access."""
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import types
import unittest
from unittest import mock

import test_fd_pin
import test_vfs_source


def load():
    path = Path(__file__).with_name('copy_sampler.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('copy_sampler', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Inputs(unittest.TestCase):
    def test_only_known_64_bit_null_offset_copy_calls_are_candidates(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'copy_fds', None)), 'Actual bounded sampler is missing')
        raw = '326 0x3 0x0 0x4 0x0 0x1000 0x0 0x123 0x456\n'
        self.assertEqual(m.copy_fds(raw, 'x86_64'), (3, 4))
        for absent in ('running\n', '-1 0x123 0x456\n', raw.replace('326', '0', 1), raw.replace('0x0', '0x1', 1)):
            self.assertIsNone(m.copy_fds(absent, 'x86_64'))
        with self.assertRaises(m.Incomplete):
            m.copy_fds(raw, 'aarch64')
        with self.assertRaises(m.Incomplete):
            m.copy_fds('326 ' + 'x' * 8192, 'x86_64')

    def test_packet_cap_does_not_truncate_json_into_apparent_success(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'packet', None)), 'Closed packet framing is missing')
        self.assertEqual(json.loads(m.packet({'status': 'NOT_OBSERVED'})), {'status': 'NOT_OBSERVED'})
        with self.assertRaises(m.Incomplete):
            m.packet({'raw': 'x' * 4096})
        with self.assertRaises(m.Incomplete):
            m.packet({'time': float('nan')})


@unittest.skipUnless(sys.platform == 'linux', 'Real held-FD sampler integration runs in Linux CI')
class LinuxSampler(unittest.TestCase):
    def test_real_pair_keeps_its_offsets_when_target_reopens_and_closes_all_holds(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'Sampler', None)), 'Actual bounded sampler is missing')
        fixture = test_vfs_source.LinuxSource()
        source_module = test_vfs_source.load()
        with fixture.fixture() as (root, fd, identity, config, leaf, layer):
            # All data mutations are confined to this disposable fixture.
            (leaf / 'payload').chmod(0o600)
            with source_module.source_root(fd, identity, config, lambda: None) as source:
                child = None
                pidfd = procfd = None
                try:
                    # Graph baseline precedes the introduced init root.
                    with m.Sampler(source, lambda: None) as sampler:
                        dest = root / 'vfs/dir' / ('a' * 64 + '-init')
                        dest.mkdir()
                        (dest / 'payload').write_bytes(b'y' * 12)
                        child = subprocess.Popen([sys.executable, '-B', '-c', test_fd_pin.CHILD,
                                                  str(leaf / 'payload'), str(dest / 'payload')],
                                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                                 text=True, bufsize=1)
                        def command(value=None):
                            if value:
                                child.stdin.write(value + '\n'); child.stdin.flush()
                            self.assertTrue(select.select([child.stdout], [], [], 5)[0])
                            return json.loads(child.stdout.readline())
                        fds = command()
                        pidfd = os.pidfd_open(child.pid)
                        procfd = os.open('/proc/' + str(child.pid), os.O_RDONLY | os.O_DIRECTORY)
                        start = m.resources.parse_stat(m.resources._text_at(procfd, 'stat'))['start']
                        def owner():
                            if child.poll() is not None or select.select([pidfd], [], [], 0)[0]:
                                raise m.Incomplete('FIXTURE_OWNER_LOST')
                        sampler.bind(child.pid, pidfd, procfd, start, owner)
                        command('move')
                        begin = time.monotonic(); end = begin + 2
                        # Only syscall metadata is synthetic. Files, task identity,
                        # graph binding, pidfd_getfd and resource reads are real.
                        with mock.patch.object(m, '_syscall_pair', return_value=tuple(fds)):
                            first = sampler.sample(begin, end)
                            command('reopen')
                            second = sampler.sample(begin, end)
                        self.assertEqual(first['copy']['status'], 'PINNED_BASELINE')
                        self.assertEqual(first['copy']['binding']['phase'], 'NATIVE_TO_INIT')
                        self.assertEqual(second['copy']['observation']['source']['position'], 5)
                        self.assertEqual(second['copy']['comparison']['status'], 'NO_OFFSET_ADVANCE_OBSERVED')
                        self.assertEqual(second['copy']['targetContinuity'], 'NOT_ESTABLISHED')
                        self.assertEqual(second['rootCause'], 'NOT_PROVEN')
                        self.assertLessEqual(len(m.packet(second)), 4096)
                        self.assertIsNone(sampler.pair)
                        held = sampler.graph.nodes['a' * 64 + '-init'][0]
                    with self.assertRaises(OSError):
                        os.fstat(held)
                finally:
                    if child is not None:
                        if child.poll() is None:
                            child.stdin.write('quit\n'); child.stdin.flush()
                        child.communicate(timeout=5)
                    for owned in (pidfd, procfd):
                        if owned is not None:
                            os.close(owned)

    def test_no_active_copy_is_explicit_and_ambiguity_fails_without_claiming_zero(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'Sampler', None)), 'Actual bounded sampler is missing')
        fixture = test_vfs_source.LinuxSource()
        with fixture.fixture() as (root, fd, identity, config, leaf, layer):
            with test_vfs_source.load().source_root(fd, identity, config, lambda: None) as source:
                pidfd = os.pidfd_open(os.getpid())
                procfd = os.open('/proc/self', os.O_RDONLY | os.O_DIRECTORY)
                try:
                    with m.Sampler(source, lambda: None) as sampler:
                        start = m.resources.parse_stat(m.resources._text_at(procfd, 'stat'))['start']
                        sampler.bind(os.getpid(), pidfd, procfd, start, lambda: None)
                        begin = time.monotonic()
                        with mock.patch.object(m, '_syscall_pair', return_value=None):
                            row = sampler.sample(begin, begin + 2)
                        self.assertEqual(row['copy'], {'status': 'NOT_OBSERVED'})
                        self.assertNotIn('offsetDeltaBytes', row)
                        (root / 'vfs/dir' / 'unrelated').mkdir()
                        with self.assertRaises(m.Incomplete):
                            sampler.sample(begin, begin + 2)
                finally:
                    os.close(pidfd); os.close(procfd)


if __name__ == '__main__':
    unittest.main()

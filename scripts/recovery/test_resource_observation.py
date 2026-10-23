"""Literal kernel-format fixtures and owned process metadata; no data-file reads."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest


def load():
    path = Path(__file__).with_name('resource_observation.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('resource_observation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stat_row(pid=42, start=123):
    fields = ['S'] + ['0'] * 21
    for index, value in [(7, '2'), (9, '1'), (11, '7'), (12, '3'), (19, str(start)), (21, '4')]:
        fields[index] = value
    return str(pid) + ' (fixture ) task) ' + ' '.join(fields)


IO = 'rchar: 10\nwchar: 20\nsyscr: 1\nsyscw: 2\nread_bytes: 30\nwrite_bytes: 40\ncancelled_write_bytes: 50\n'


class Formats(unittest.TestCase):
    def setUp(self):
        self.m = load()

    def test_stat_and_scheduler_fields_keep_their_documented_units(self):
        m = self.m
        self.assertTrue(callable(getattr(m, 'parse_stat', None)), 'Resource observation formats missing')
        self.assertEqual(m.parse_stat(stat_row()), {'id':42, 'start':123, 'userTicks':7, 'systemTicks':3,
                                                   'minorFaults':2, 'majorFaults':1, 'rssPages':4})
        self.assertEqual(m.parse_sched('123456 234567 5\n'), {'cpuNanoseconds':123456, 'runqueueNanoseconds':234567, 'timeslices':5})

    def test_io_cancellation_is_preserved_without_invented_net_io_and_malformed_data_is_refused(self):
        m = self.m
        self.assertTrue(callable(getattr(m, 'parse_io', None)), 'Resource observation formats missing')
        values = m.parse_io(IO)
        self.assertEqual(values['write_bytes'], 40)
        self.assertEqual(values['cancelled_write_bytes'], 50)
        self.assertNotIn('net_write_bytes', values)
        for raw in (IO + 'read_bytes: 99\n', IO.replace('30', '-30'), IO.replace('30', '9' * 5000), IO.replace('read_bytes: 30\n', '')):
            with self.subTest(raw_bytes=len(raw)), self.assertRaises(m.Incomplete):
                m.parse_io(raw)

    def test_block_gauge_and_cumulative_counters_are_distinct(self):
        m = self.m
        self.assertTrue(callable(getattr(m, 'parse_block', None)), 'Resource observation formats missing')
        values = m.parse_block('1 2 3 4 5 6 7 8 9 10 11 0 0 0 0 0 0\n')
        self.assertEqual(values['readsCompleted'], 1)
        self.assertEqual(values['readMilliseconds'], 4)
        self.assertEqual(values['writesCompleted'], 5)
        self.assertEqual(values['inflight'], 9)
        self.assertEqual(values['ioMilliseconds'], 10)
        self.assertEqual(values['weightedIoMilliseconds'], 11)


@unittest.skipUnless(sys.platform == 'linux', 'Held proc directory and filesystem observations require Linux CI')
class LinuxResources(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.assertTrue(callable(getattr(self.m, 'observe', None)), 'Held resource observer missing')

    def test_missing_optional_channel_is_not_zero_and_corrupt_identity_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'stat').write_text(stat_row())
            (root / 'io').write_text(IO)
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                values = self.m.observe(fd, 42, 123, lambda: None)
                self.assertEqual(values['io']['status'], 'OBSERVED')
                self.assertEqual(values['scheduler']['status'], 'UNAVAILABLE')
                self.assertNotIn('values', values['scheduler'])
                self.assertEqual(values['filesystem']['status'], 'NOT_REQUESTED')
                with self.assertRaises(self.m.Incomplete):
                    self.m.observe(fd, 42, 124, lambda: None)
            finally:
                os.close(fd)

    def test_source_filesystem_capacity_and_matching_device_counters_are_bracketed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'stat').write_text(stat_row())
            (root / 'io').write_text(IO)
            (root / 'schedstat').write_text('123456 234567 5\n')
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                major, minor = os.major(os.fstat(fd).st_dev), os.minor(os.fstat(fd).st_dev)
                device = root / 'sys/dev/block' / f'{major}:{minor}'
                device.mkdir(parents=True)
                (device / 'stat').write_text('1 2 3 4 5 6 7 8 9 10 11\n')
                values = self.m.observe(fd, 42, 123, lambda: None, filesystem_fd=fd, sys_root=root / 'sys')
                self.assertEqual(values['filesystem']['status'], 'OBSERVED')
                self.assertGreater(values['filesystem']['values']['availableBytes'], 0)
                if major:
                    self.assertEqual(values['device']['status'], 'OBSERVED')
                    self.assertEqual(values['device']['values']['inflight'], 9)
                else:
                    self.assertEqual(values['device']['status'], 'UNAVAILABLE')
                self.assertLessEqual(values['start'], values['end'])
            finally:
                os.close(fd)

    def test_real_own_proc_format_is_compatible_and_owner_refusal_never_collects(self):
        fd = os.open('/proc/self', os.O_RDONLY | os.O_DIRECTORY)
        try:
            start = self.m.parse_stat(Path('/proc/self/stat').read_text())['start']
            values = self.m.observe(fd, os.getpid(), start, lambda: None)
            self.assertEqual(values['process']['values']['id'], os.getpid())
            self.assertEqual(values['io']['status'], 'OBSERVED')
            def refuse():
                raise self.m.Incomplete('OWNER_NOT_PROVEN')
            with self.assertRaises(self.m.Incomplete):
                self.m.observe(fd, os.getpid(), start, refuse)
        finally:
            os.close(fd)


if __name__ == '__main__':
    unittest.main()

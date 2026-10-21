"""Private-pipe/deadline tests use only one own synthetic Python child."""
import importlib.util
from pathlib import Path
import sys
import time
import types
import unittest
from unittest.mock import patch


def load():
    path = Path(__file__).with_name('owned_worker.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('owned_worker', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Inputs(unittest.TestCase):
    def test_unbounded_or_noncode_input_does_not_launch(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'OwnedWorker', None)), 'Independent observer worker is missing')
        for code in (None, b'bytes', '', 'x' * 65537):
            with self.subTest(code_type=type(code).__name__), self.assertRaises(m.Incomplete):
                m.OwnedWorker(code)


@unittest.skipUnless(sys.platform == 'linux', 'Real Linux pipes/pidfd child cleanup are tested in dedicated CI')
class LinuxWorker(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.assertTrue(callable(getattr(self.m, 'OwnedWorker', None)), 'Independent observer worker is missing')

    def test_a_silent_observer_cannot_extend_the_controller_deadline(self):
        worker = self.m.OwnedWorker('import time; time.sleep(30)')
        try:
            started = time.monotonic()
            with self.assertRaises(self.m.Incomplete):
                worker.read_line(started + .05)
            self.assertLess(time.monotonic() - started, 1.5)
        finally:
            self.assertEqual(worker.close(.1), 'PASS')
        self.assertIsNotNone(worker.process.poll())

    def test_response_prefix_survives_bound_refusal_and_owned_child_is_reaped(self):
        worker = self.m.OwnedWorker("import sys,time; sys.stdout.write('x'*20000); sys.stdout.flush(); time.sleep(30)")
        try:
            with self.assertRaises(self.m.Incomplete):
                worker.read_line(time.monotonic() + 2)
            self.assertGreater(len(worker.stdout), 0)
            self.assertLessEqual(len(worker.stdout), 262144)
        finally:
            self.assertEqual(worker.close(.1), 'PASS')
        self.assertIsNotNone(worker.process.poll())

    def test_only_the_owned_worker_ignoring_term_gets_one_kill_and_is_reaped(self):
        worker = self.m.OwnedWorker("import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print('READY',flush=True); time.sleep(30)")
        try:
            self.assertEqual(worker.read_line(time.monotonic() + 2), b'READY\n')
        finally:
            self.assertEqual(worker.close(.05), 'PASS')
        self.assertEqual(worker.signals, ['TERM', 'KILL'])
        self.assertIsNotNone(worker.process.poll())

    def test_messages_round_trip_without_inheriting_application_environment(self):
        worker = self.m.OwnedWorker("import os,sys; print(','.join(sorted(os.environ)),flush=True); print(sys.stdin.buffer.readline().decode().strip(),flush=True)")
        try:
            keys = worker.read_line(time.monotonic() + 2).decode().strip().split(',')
            self.assertTrue(set(keys) <= {'PATH','LANG','LC_CTYPE','PYTHONDONTWRITEBYTECODE'})
            worker.send(b'fixture-only\n', time.monotonic() + 2)
            self.assertEqual(worker.read_line(time.monotonic() + 2), b'fixture-only\n')
        finally:
            self.assertEqual(worker.close(.1), 'PASS')

    def test_exit_between_poll_and_pidfd_metadata_is_reaped_without_identity_fallback(self):
        # Model the actual kernel race with our own child: pidfd becomes
        # readable after poll but before its Pid metadata is inspected.
        worker = self.m.OwnedWorker("import time; print('READY',flush=True); time.sleep(30)")
        worker.read_line(time.monotonic() + 2)
        original_target = self.m._target
        def exiting(pidfd):
            import select
            worker.process.terminate()  # only our fixture's retained Popen child
            self.assertTrue(select.select([pidfd], [], [], 2)[0])
            return original_target(pidfd)
        try:
            with patch.object(self.m, '_target', side_effect=exiting):
                self.assertEqual(worker.close(.1), 'PASS')
        finally:
            worker.process.wait(timeout=2)
            if not worker.closed:
                worker.close(.1)


if __name__ == '__main__':
    unittest.main()

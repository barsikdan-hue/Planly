"""Original command semantics with own disposable Python commands, never Docker."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import types
import unittest
from unittest import mock

from owned_worker import OwnedWorker

RUN = '65f401ba-1c86-4c39-b7b7-a1d0fb23d71d'
OBSERVER = "import json,sys,time\nprint('READY',flush=True)\nr=json.loads(input())\nt=time.monotonic()\nprint(json.dumps(dict(kind='SAMPLE',runId=r['runId'],index=1,start=t,end=time.monotonic())),flush=True)\ntime.sleep(60)\n"


def load():
    path = Path(__file__).with_name('node_observation.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('node_observation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Inputs(unittest.TestCase):
    def test_unbounded_window_is_rejected_before_a_command_is_started(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'NodeObservation', None)), 'Node/sampler integration is missing')
        state = m.NodeObservation(None, RUN)
        for timeout in (0, 60.001, float('nan'), True):
            with self.subTest(timeout=timeout), self.assertRaises(m.Incomplete):
                state.wait([], None, {}, lambda *_: None, timeout=timeout)


class Completeness(unittest.TestCase):
    def fixture(self, mode):
        class Worker:
            cursor, stdout_total = 0, 0
            stdout, stderr, stream_error = b'', b'', None
            process = types.SimpleNamespace(poll=lambda: None)
            def send(self, raw, _):
                request = json.loads(raw)
                count = 0 if mode == 'silent' else 1 if mode == 'partial' else 7
                duration = request['deadline'] - request['start']
                rows = []
                for index, offset in enumerate((0, 20, 40, 45, 50, 55, 58)[:count], 1):
                    when = request['start'] + duration * ((58.1 if mode == 'catchup' else offset + .01) / 60)
                    end = when + duration / 10000
                    if mode == 'slow' and index == 2:
                        end = request['start'] + duration * (41 / 60)
                    rows.append(json.dumps(dict(kind='SAMPLE', runId=request['runId'], index=index, start=when, end=end)).encode() + b'\n')
                self.stdout = b''.join(rows); self.stdout_total = len(self.stdout)
            def drain_available(self):
                pass
            def close(self):
                return 'PASS'
        return Worker()

    def test_full_command_timeout_needs_every_due_sample_even_when_cleanup_passes(self):
        m = load()
        for mode in ('silent', 'partial', 'catchup', 'slow'):
            with self.subTest(mode=mode):
                state = m.NodeObservation(self.fixture(mode), RUN)
                with self.assertRaises(subprocess.TimeoutExpired):
                    state.wait([sys.executable, '-c', 'import time;time.sleep(2)'], None, os.environ.copy(), lambda *_: None, timeout=.12)
                self.assertEqual(state.cleanup, 'PASS')
                self.assertTrue(state.hold_required, 'Reaping is not observation completeness: ' + mode)
                self.assertEqual(state.observation_status, 'INCOMPLETE')
                self.assertTrue(state.missing_slots or state.late_slots)

    def test_complete_window_and_fast_unobserved_result_are_distinct(self):
        m = load()
        state = m.NodeObservation(self.fixture('complete'), RUN)
        with self.assertRaises(subprocess.TimeoutExpired):
            state.wait([sys.executable, '-c', 'import time;time.sleep(2)'], None, os.environ.copy(), lambda *_: None, timeout=.12)
        self.assertFalse(state.hold_required)
        self.assertEqual(state.observation_status, 'COMPLETE_WINDOW')
        self.assertEqual(state.missing_slots + state.late_slots, [])
        fast = m.NodeObservation(self.fixture('silent'), RUN)
        result = fast.wait([sys.executable, '-c', 'pass'], None, os.environ.copy(), lambda *_: None, timeout=3)
        self.assertEqual(result.returncode, 0)
        self.assertFalse(fast.hold_required)
        self.assertEqual(fast.observation_status, 'NOT_OBSERVED')


@unittest.skipUnless(sys.platform == 'linux', 'Owned subprocess wait integration runs in Linux CI')
class LinuxNode(unittest.TestCase):
    def worker(self, code=OBSERVER):
        worker = OwnedWorker(code)
        self.addCleanup(worker.close)
        self.assertEqual(worker.read_line(time.monotonic() + 3), b'READY\n')
        return worker

    def test_one_command_one_stdin_and_fast_finish_skip_profile_then_reap_observer(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'NodeObservation', None)), 'Node/sampler integration is missing')
        worker = self.worker()
        state = m.NodeObservation(worker, RUN)
        calls = []
        native = subprocess.Popen
        def launch(*args, **kwargs):
            calls.append(args[0])
            return native(*args, **kwargs)
        profile = mock.Mock()
        with mock.patch.object(m.subprocess, 'Popen', side_effect=launch):
            result = state.wait([sys.executable, '-c', 'import sys,time;raw=sys.stdin.buffer.read();time.sleep(.08);sys.stdout.buffer.write(raw)'],
                                b'one-input', {'LANG': 'C'}, profile, timeout=.8)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result.stdout, b'one-input')
        profile.assert_not_called()
        self.assertEqual(state.cleanup, 'PASS')
        self.assertFalse(state.hold_required)
        self.assertIn(b'"kind": "SAMPLE"', state.raw)
        self.assertIsNotNone(worker.process.poll())

    def test_deadline_remains_original_and_primary_timeout_keeps_received_bytes(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'NodeObservation', None)), 'Node/sampler integration is missing')
        state = m.NodeObservation(self.worker(), RUN)
        profile_calls = []
        def profile(child, deadline):
            self.assertIsNone(child.poll())
            self.assertLess(time.monotonic(), deadline)
            profile_calls.append(child.pid)
        before = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired) as caught:
            state.wait([sys.executable, '-u', '-c', "import time;print('AVAILABLE_PREFIX',flush=True);time.sleep(60)"],
                       None, {'LANG': 'C'}, profile, timeout=.3)
        self.assertEqual(caught.exception.timeout, .3)
        self.assertEqual(caught.exception.output, b'AVAILABLE_PREFIX\n')
        self.assertEqual(len(profile_calls), 1)
        self.assertLess(time.monotonic() - before, 2.5)
        self.assertEqual(state.cleanup, 'PASS')
        self.assertIsNotNone(state.child.poll())

    def test_sampler_failure_does_not_lose_successful_command_identity(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'NodeObservation', None)), 'Node/sampler integration is missing')
        worker = self.worker("import sys\nprint('READY',flush=True)\ninput()\nprint('MALFORMED_PACKET',flush=True)\nraise SystemExit(1)")
        state = m.NodeObservation(worker, RUN)
        result = state.wait([sys.executable, '-u', '-c', "import time;time.sleep(.12);print('SYNTHETIC_CONTAINER_ID')"],
                            None, {'LANG': 'C'}, lambda *_: None, timeout=.8)
        self.assertEqual(result.stdout, b'SYNTHETIC_CONTAINER_ID\n')
        self.assertTrue(state.hold_required)
        self.assertIn(b'MALFORMED_PACKET', state.raw)
        self.assertEqual(state.cleanup, 'PASS')


if __name__ == '__main__':
    unittest.main()

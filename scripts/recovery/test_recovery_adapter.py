"""Fresh interface fixtures only; no frozen source/runtime acceptance claim."""
import contextlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import types
import unittest

from copy_observation import Incomplete


def load():
    path = Path(__file__).with_name('recovery_adapter.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('recovery_adapter', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Adapter(unittest.TestCase):
    def test_probe_precedes_original_perform_and_unknown_cleanup_cannot_enter_frozen_cleanup(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'install', None)), 'Frozen-boundary adapter is missing')
        events = []
        class Restore:
            def create(self):
                events.append('CID_REGISTERED')
            def perform(self):
                self.create(); events.append('ORIGINAL_PERFORM')
            def cleanup(self):
                events.append('ORIGINAL_CLEANUP')
        original_create = Restore.create
        profile = types.SimpleNamespace(Hold=Incomplete, install_profile=lambda *_: events.append('OLD_INSTALL'))
        state = types.SimpleNamespace(preflight=lambda *_: events.append('PROBE'),
                                      cleanup_known=lambda: False, node_wait=lambda *_: None)
        m.install(profile, state)
        errors = []
        pstate = types.SimpleNamespace(fail=errors.append)
        parts = types.SimpleNamespace(candidate=types.SimpleNamespace(Restore=Restore))
        profile.install_profile(parts, None, pstate)
        self.assertIs(Restore.create, original_create)
        runner = Restore()
        runner.perform()
        self.assertEqual(events, ['OLD_INSTALL', 'PROBE', 'CID_REGISTERED', 'ORIGINAL_PERFORM'])
        with self.assertRaises(Incomplete):
            runner.cleanup()
        self.assertNotIn('ORIGINAL_CLEANUP', events)
        self.assertTrue(runner.cleanup_uncertain)
        self.assertEqual(len(errors), 1)
        state.cleanup_known = lambda: True
        runner.cleanup()
        self.assertEqual(events[-1], 'ORIGINAL_CLEANUP')

    def test_fresh_build_mismatch_stops_before_observer_or_node_command_and_no_env_enters_config(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'RunState', None)), 'Frozen-boundary run state is missing')
        events = []
        @contextlib.contextmanager
        def socket(_):
            events.append('SOCKET_BOUND'); yield lambda: events.append('SOCKET_RECHECK')
        runner = types.SimpleNamespace(daemon=types.SimpleNamespace(pid=42), daemon_start='123',
                                       runtime=PurePosixPath('/run/planly-a1-reuse-65f401ba-1c86-4c39-b7b7-a1d0fb23d71d'),
                                       run_id='65f401ba-1c86-4c39-b7b7-a1d0fb23d71d', store_root=PurePosixPath('/tmp/synthetic-owned-store'),
                                       reuse_plan={'nativeConfigByService': {'app': 'sha256:' + 'a' * 64}},
                                       env={'SYNTHETIC_SECRET': 'NEVER_COPY_INTO_OBSERVER'}, daemon_owned=lambda: events.append('OWNED'))
        version = {'Version': '29.9.1', 'GitCommit': 'unknown'}
        def docker(*args, **kwargs):
            self.assertEqual(args, ('version', '--format', '{{json .Server}}'))
            self.assertEqual(kwargs, {'timeout': 3})
            events.append('VERSION_READ')
            return types.SimpleNamespace(stdout=json.dumps(version).encode())
        runner.docker = docker
        state = m.RunState(dict(runId=runner.run_id, storeDevice=1, storeInode=2), {})
        profile = types.SimpleNamespace(held_socket=socket)
        with self.assertRaises(Incomplete):
            state.config_for(runner, profile)
        self.assertEqual(events.count('VERSION_READ'), 1)
        version['GitCommit'] = 'b26fb77'
        state = m.RunState(dict(runId=runner.run_id, storeDevice=1, storeInode=2), {})
        config = state.config_for(runner, profile)
        self.assertNotIn('env', config)
        self.assertNotIn('NEVER_COPY_INTO_OBSERVER', repr(config))
        self.assertEqual(config['daemonPid'], 42)
        self.assertEqual(config['nativeConfigId'], runner.reuse_plan['nativeConfigByService']['app'])


if __name__ == '__main__':
    unittest.main()

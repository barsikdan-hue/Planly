"""Fresh-interface hooks around frozen recovery; no dispatch or authority.

The private adapter must validate the exact fresh grant/source/history before
installing these hooks. It must retain the complete original C5/F17 absence,
preservation, image equality and acceptance chain, and propagate UNKNOWN cleanup
to its outer result. This module alone is NOT a recovery entry point.
"""
import os
from pathlib import Path
import subprocess
import re
import time

from copy_observation import Incomplete, process_start
from copy_envelope import parsed, _counts, need
import fd_pin
from node_observation import NodeObservation
from owned_capability import build_probe
from owned_worker import OwnedWorker
from sampler_worker import MODULES, build_code, validate_config


def install(profile, state):
    original = profile.install_profile
    def wrapped(parts, evidence, pstate):
        original(parts, evidence, pstate)
        cls = parts.candidate.Restore
        perform0, cleanup0 = cls.perform, cls.cleanup
        def perform(runner):
            state.preflight(runner, pstate, profile)
            return perform0(runner)
        def cleanup(runner):
            if not state.cleanup_known():
                runner.cleanup_started, runner.cleanup_uncertain = True, True
                error = profile.Hold('PROFILE_DIAGNOSTIC_INCOMPLETE')
                pstate.fail(error)
                raise error
            return cleanup0(runner)
        cls.perform, cls.cleanup = perform, cleanup
    profile.install_profile = wrapped
    profile.node_wait = lambda runner, args, data, pstate: state.node_wait(runner, args, data, pstate, profile)


class RunState:
    def __init__(self, gate, sources):
        self.gate, self.sources = gate, sources
        self.probe_status, self.probe_cleanup, self.runtime_cleanup = 'NOT_REACHED', 'NOT_STARTED', 'NOT_STARTED'
        self.probe_stdout = self.probe_stderr = self.ready_raw = self.runtime_stdout = self.runtime_stderr = b''
        self.hold_required, self.constructor_cleanup_unknown = False, False
        self.workers = []
        self.probe_count = self.node_count = self.version_reads = 0
        self.node, self.daemon_pid, self.daemon_start = None, None, None
        self.failures, self.failures_truncated = [], False

    def note(self, error, phase):
        self.hold_required = True
        known = (OSError, PermissionError, FileNotFoundError, FileExistsError, ProcessLookupError,
                 TimeoutError, subprocess.TimeoutExpired, ValueError, TypeError, KeyError, SyntaxError, MemoryError)
        label = type(error).__name__ if type(error) in known or type(error) is Incomplete else 'Hold' if type(error).__name__ == 'Hold' else 'UNKNOWN'
        value = {'class': label, 'code': 'UNKNOWN', 'phase': phase}
        if label in {'Hold', 'Incomplete'} and error.args and type(error.args[0]) is str and re.fullmatch('[A-Z0-9_]{1,100}', error.args[0]):
            value['code'] = error.args[0]
        if isinstance(error, OSError) and type(error.errno) is int and 0 <= error.errno <= 65535:
            value['errno'] = error.errno
        if value not in self.failures:
            if len(self.failures) < 8:
                self.failures.append(value)
            else:
                self.failures_truncated = True

    def cleanup_known(self):
        return (not self.constructor_cleanup_unknown and self.probe_cleanup != 'UNKNOWN'
                and self.runtime_cleanup != 'UNKNOWN'
                and (self.node is None or self.node.command_cleanup != 'UNKNOWN'))

    def worker(self, code, runner, role):
        need(len(self.workers) < 2, 'OWNED_OBSERVER_CHILD_BOUND')
        try:
            worker = OwnedWorker(code)
        except BaseException as error:
            self.constructor_cleanup_unknown |= bool(getattr(error, '_owned_observer_cleanup_unknown', False))
            if getattr(error, '_owned_observer_cleanup_unknown', False):
                if role == 'probe':
                    self.probe_cleanup = 'UNKNOWN'
                else:
                    self.runtime_cleanup = 'UNKNOWN'
            self.note(error, 'PROBE' if role == 'probe' else 'PREPARE')
            out, err = getattr(error, 'available_stdout', b''), getattr(error, 'available_stderr', b'')
            if role == 'probe':
                self.probe_stdout, self.probe_stderr = out[:4096], err[:65536]
            else:
                self.runtime_stdout, self.runtime_stderr = out[:32768], err[:65536]
            raise
        self.workers.append(worker)  # retained before metadata registration can fail
        try:
            pid = worker.process.pid
            need(fd_pin._target(worker.pidfd) == pid, 'OWNED_OBSERVER_REGISTRATION')
            start = process_start(fd_pin._text(Path('/proc') / str(pid) / 'stat'))
            runner.known_processes[pid] = str(start)
            return worker
        except BaseException:
            cleanup = worker.close()
            if role == 'probe':
                self.probe_cleanup = cleanup
                self.probe_stdout, self.probe_stderr = worker.stdout[:4096], worker.stderr[:65536]
            else:
                self.runtime_cleanup = cleanup
                self.runtime_stdout, self.runtime_stderr = worker.stdout[:32768], worker.stderr[:65536]
            raise

    def preflight(self, runner, pstate, profile):
        need(self.probe_count == 0, 'ONE_OWNED_CAPABILITY_PROBE')
        self.probe_count += 1
        worker, descriptor, primary, line = None, None, None, b''
        try:
            descriptor = os.open('/proc/self/exe', os.O_RDONLY | os.O_CLOEXEC)
            identity = os.fstat(descriptor)
            start = process_start(fd_pin._text(Path('/proc/self/stat')))
            code = build_probe({name: self.sources[name] for name in ('copy_observation', 'fd_pin')},
                               os.getpid(), start, descriptor, (identity.st_dev, identity.st_ino), str(runner.runtime))
            worker = self.worker(code, runner, 'probe')
            line = worker.read_line(time.monotonic() + 3)
            need(len(line) <= 4096 and parsed(line) == {'status': 'CAPABILITY_OBSERVED', 'fileDataReads': 0, 'duplicateAttempts': 1}, 'OWNED_CAPABILITY_PROBE_NO_GO')
            self.probe_status = 'CAPABILITY_OBSERVED'
        except BaseException as error:
            primary = error
        finally:
            if worker is not None:
                self.probe_cleanup = worker.close()
                self.probe_stdout, self.probe_stderr = worker.stdout[:4096], worker.stderr[:65536]
                if (worker.stdout_total != len(line) or worker.stderr_total or worker.stream_error or self.probe_cleanup != 'PASS'):
                    primary = primary or Incomplete('OWNED_PROBE_INCOMPLETE')
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except BaseException as error:
                    primary = primary or error
                    self.probe_cleanup = 'UNKNOWN'
        if primary is not None:
            self.probe_status, self.hold_required = 'INCOMPLETE', True
            self.note(primary, 'PROBE')
            pstate.fail(primary)
            raise profile.Hold('PROFILE_DIAGNOSTIC_INCOMPLETE') from primary

    def config_for(self, runner, profile):
        need(self.version_reads == 0 and runner.run_id == self.gate['runId'], 'ONE_FRESH_OWNED_BUILD_READ')
        self.version_reads += 1
        runner.daemon_owned()
        with profile.held_socket(runner) as recheck:
            recheck()
            raw = runner.docker('version', '--format', '{{json .Server}}', timeout=3).stdout
            need(type(raw) is bytes and len(raw) <= 16384, 'FRESH_BUILD_REPLY_BOUND')
            version = parsed(raw)
            need(type(version) is dict and version.get('Version') == '29.9.1' and version.get('GitCommit') == 'b26fb77', 'REVIEWED_DAEMON_MODEL_MISMATCH')
            recheck()
        runner.daemon_owned()
        config = dict(schema=1, runId=runner.run_id, daemonPid=runner.daemon.pid, daemonStart=int(runner.daemon_start),
                      storePath=str(runner.store_root), storeDevice=self.gate['storeDevice'], storeInode=self.gate['storeInode'],
                      nativeConfigId=runner.reuse_plan['nativeConfigByService']['app'], runtimeRoot=str(runner.runtime),
                      daemonVersion=version['Version'], daemonCommit=version['GitCommit'])
        validate_config(config)
        return config

    def node_wait(self, runner, args, data, pstate, profile):
        need(self.node_count == 0 and pstate.intercepts == 0 and self.probe_status == 'CAPABILITY_OBSERVED', 'ONE_PRECHECKED_NODE_INTERCEPT')
        self.node_count += 1
        pstate.intercepts, pstate.runner = 1, runner
        worker = None
        try:
            config = self.config_for(runner, profile)
            self.daemon_pid, self.daemon_start = config['daemonPid'], config['daemonStart']
            worker = self.worker(build_code({name: self.sources[name] for name in MODULES}, config), runner, 'runtime')
            self.ready_raw = worker.read_line(time.monotonic() + 30)
            need(len(self.ready_raw) <= 4096, 'READY_PACKET_BOUND')
            ready = parsed(self.ready_raw)
            need(type(ready) is dict and set(ready) == {'kind', 'runId', 'workload', 'rootCause'}
                 and ready['kind'] == 'READY' and ready['runId'] == runner.run_id and ready['rootCause'] == 'NOT_PROVEN', 'READY_SOURCE_BINDING')
            _counts(ready['workload'])
            self.node = NodeObservation(worker, runner.run_id)
            def fetch(child, deadline):
                try:
                    pstate.raw = profile.fetch_profile(runner, deadline, child, pstate)
                    pstate.status = 'COMPLETE'
                except BaseException as error:
                    if type(error) is profile.Hold and error.args == ('NODE_ALREADY_FINISHED',):
                        pstate.requests, pstate.status = 0, 'SKIPPED_FAST'
                        return
                    pstate.raw = getattr(error, '_profile_available', b'')[:4194304]
                    pstate.truncated = type(error) is profile.Hold and error.args == ('PROFILE_BODY_BOUND',)
                    pstate.fail(error)
                    self.note(error, 'PROFILE')
                    raise
            # EXACT frozen fetch_profile supplies its own3s bound; never use an
            # arbitrary callback here. Actual Node deadline is the default60.
            return self.node.wait(args, data, runner.env, fetch)
        except BaseException as error:
            if self.node is None:
                self.note(error, 'PREPARE')
                pstate.fail(error)
            raise
        finally:
            if worker is not None:
                self.runtime_cleanup = worker.close()
                self.runtime_stderr = worker.stderr[:65536]
                if self.node is None:
                    self.runtime_stdout = worker.stdout[:32768]
            if self.node is not None:
                pstate.stdout, pstate.stderr = self.node.stdout, self.node.command_stderr
                self.runtime_stdout, self.runtime_stderr = self.node.raw, self.node.stderr
                self.runtime_cleanup = self.node.cleanup
                if self.node.profile_status == 'SKIPPED_FAST':
                    pstate.status = 'SKIPPED_FAST'
                self.hold_required |= self.node.hold_required
                for code in self.node.secondary:
                    self.note(Incomplete(code), 'NODE')
            if not self.cleanup_known():
                self.note(Incomplete('OWNED_OBSERVER_CLEANUP_UNKNOWN'), 'CLEANUP')
            if self.hold_required:
                pstate.fail(profile.Hold('PROFILE_DIAGNOSTIC_INCOMPLETE'))

    def entries(self):
        return dict(READY=self.ready_raw[:4096], SAMPLES=self.runtime_stdout[:32768], OBSERVER_STDERR=self.runtime_stderr[:65536],
                    PROBE_STDOUT=self.probe_stdout[:4096], PROBE_STDERR=self.probe_stderr[:65536])

    def safe(self, profile_status='NOT_REACHED'):
        node = self.node
        status = node.observation_status if node is not None else 'INCOMPLETE' if self.hold_required else 'NOT_REACHED'
        cleanup = self.runtime_cleanup
        return dict(status=status, rootCause='NOT_PROVEN', probeStatus=self.probe_status, probeCleanup=self.probe_cleanup,
                    observerCleanup=cleanup, commandCleanup=node.command_cleanup if node else 'NOT_STARTED', profileStatus=profile_status,
                    requestStart=node.request_start if node else None, requestDeadline=node.request_deadline if node else None,
                    commandObservedEnd=node.command_observed_end if node else None, windowExpired=node.window_expired if node else False,
                    missingSlots=node.missing_slots if node else [], lateSlots=node.late_slots if node else [],
                    afterCommandSlots=node.after_command_slots if node else [], holdRequired=bool(self.hold_required),
                    daemonPid=self.daemon_pid, daemonStart=self.daemon_start,
                    failures=list(self.failures), failuresTruncated=self.failures_truncated)

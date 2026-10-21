"""One command, original absolute deadline/profile trigger, isolated observer.

No admission/dispatch hook is installed here. A reviewed outer adapter must
validate READY before launch, register returned CID BEFORE any diagnostic HOLD,
and propagate uncertain observer cleanup through frozen restore cleanup. The
command uses existing Popen.communicate semantics; retained response prefixes
are bounded, this is not a new claim about its internal memory buffering.
"""
import json
import math
import subprocess
import time

from copy_observation import Incomplete


class NodeObservation:
    def __init__(self, worker, run_id):
        self.worker, self.run_id, self.used, self.child = worker, run_id, False, None
        self.cursor = worker.cursor if worker is not None else 0
        self.raw, self.stderr, self.stdout, self.command_stderr = b'', b'', b'', b''
        self.cleanup, self.command_cleanup, self.hold_required = 'NOT_STARTED', 'NOT_STARTED', False
        self.secondary, self.profile_status = [], 'NOT_REACHED'
        self.request_start = self.request_deadline = self.command_observed_end = None
        self.window_expired, self.observation_status = False, 'NOT_REACHED'
        self.missing_slots, self.late_slots, self.after_command_slots = [], [], []

    def completeness(self, rows):
        if self.request_start is None:
            return
        offsets = (0, 20, 40, 45, 50, 55, 58)
        duration = self.request_deadline - self.request_start
        due = [self.request_start + duration * (offset / 60) for offset in offsets]
        cutoff = min(self.request_deadline, self.command_observed_end)
        expected = set(range(1, 8)) if self.window_expired else {i for i, when in enumerate(due, 1) if when < cutoff}
        valid = set()
        for row in rows:
            index = row['index']
            begin, end = row.get('start'), row.get('end')
            if (not all(type(value) in (int, float) and math.isfinite(value) for value in (begin, end))
                    or not due[index - 1] <= begin <= end <= self.request_deadline
                    or (index < 7 and end >= due[index])):
                self.late_slots.append(index)
            elif end > cutoff:
                self.after_command_slots.append(index)
            else:
                valid.add(index)
        self.missing_slots = sorted(expected - valid)
        # A command observed finished before the second scheduled point may
        # finish before the first snapshot. Explicitly unobserved is allowed;
        # cleanup alone can never satisfy a full/partial diagnostic window.
        fast = not self.window_expired and cutoff < due[1]
        if self.late_slots or (self.missing_slots and not fast):
            self.observation_status = 'INCOMPLETE'
            self.fail('SAMPLE_WINDOW_INCOMPLETE')
        else:
            self.observation_status = ('COMPLETE_WINDOW' if self.window_expired else
                                       'OBSERVED_UNTIL_COMMAND_END' if valid else 'NOT_OBSERVED')

    def fail(self, code):
        self.hold_required = True
        if code not in self.secondary:
            self.secondary.append(code)

    def drain(self):
        try:
            self.worker.drain_available()
        except BaseException:
            self.fail('SAMPLER_IPC_INCOMPLETE')

    def finish(self):
        try:
            # Preserve received bytes before JSON validation. close also keeps
            # available pipe prefixes after TERM/KILL and bounded reaping.
            prior_exit = self.worker.process.poll()
            self.cleanup = self.worker.close()
            if prior_exit is not None and prior_exit != 0:
                self.fail('SAMPLER_EXIT_FAILURE')
        except BaseException:
            self.cleanup = 'UNKNOWN'
        finally:
            self.raw = self.worker.stdout[self.cursor:][:32768]
            self.stderr = self.worker.stderr[:65536]
        if self.cleanup != 'PASS':
            self.fail('SAMPLER_CLEANUP_UNKNOWN')
        if self.stderr or self.worker.stdout_total - self.cursor > 32768 or self.worker.stream_error:
            self.fail('SAMPLER_STREAM_INCOMPLETE')
        try:
            lines = self.raw.splitlines(keepends=True)
            rows = []
            if len(lines) > 7:
                raise Incomplete('SAMPLE_COUNT_BOUND')
            for index, raw in enumerate(lines, 1):
                if not raw.endswith(b'\n') or len(raw) > 4096:
                    raise Incomplete('SAMPLE_PACKET_INCOMPLETE')
                value = json.loads(raw)
                if (type(value) is not dict or value.get('kind') != 'SAMPLE'
                        or value.get('runId') != self.run_id or value.get('index') != index):
                    raise Incomplete('SAMPLE_SEQUENCE_INCOMPLETE')
                rows.append(value)
            self.completeness(rows)
        except (ValueError, UnicodeError, Incomplete):
            self.observation_status = 'INCOMPLETE'
            self.fail('SAMPLER_PROTOCOL_INCOMPLETE')

    def wait(self, args, data, env, profile, *, timeout=60):
        if type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 60:
            raise Incomplete('ORIGINAL_NODE_DEADLINE_REQUIRED')
        if self.used or self.worker is None or not callable(profile):
            raise Incomplete('ONE_PREPARED_OBSERVER_AND_COMMAND_REQUIRED')
        self.used = True
        latest_out = latest_err = b''
        try:
            self.child = subprocess.Popen(args, stdin=subprocess.PIPE if data is not None else None,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            start = time.monotonic()
            deadline = start + timeout
            self.request_start, self.request_deadline = start, deadline
            try:
                message = dict(kind='START', runId=self.run_id, start=start, deadline=deadline)
                self.worker.send(json.dumps(message, separators=(',', ':'), allow_nan=False).encode('ascii') + b'\n', min(deadline, start + .25))
            except BaseException:
                self.fail('SAMPLER_START_INCOMPLETE')
            first = True
            for offset in (20, 40, 45, 50, 55, 58, 60):
                checkpoint = start + timeout * (offset / 60)
                remaining = checkpoint - time.monotonic()
                if remaining > 0:
                    try:
                        out, err = self.child.communicate(input=data if first else None, timeout=remaining)
                        self.command_observed_end = time.monotonic()
                        self.stdout, self.command_stderr = out[:32768], err[:32768]
                        if len(out) > 32768 or len(err) > 32768:
                            self.fail('PRIMARY_STREAM_BOUND')
                        self.command_cleanup = 'PASS'
                        if self.profile_status == 'NOT_REACHED':
                            self.profile_status = 'SKIPPED_FAST'
                        return subprocess.CompletedProcess(args, self.child.returncode, out, err)
                    except subprocess.TimeoutExpired as error:
                        latest_out = error.output if type(error.output) is bytes else latest_out
                        latest_err = error.stderr if type(error.stderr) is bytes else latest_err
                    finally:
                        first = False
                self.drain()
                if offset == 45 and self.child.poll() is None:
                    try:
                        if time.monotonic() >= deadline:
                            raise Incomplete('NO_LATE_PROFILE')
                        profile(self.child, deadline)
                        self.profile_status = 'COMPLETE'
                    except BaseException:
                        self.profile_status = 'INCOMPLETE'
                        self.fail('PROFILE_DIAGNOSTIC_INCOMPLETE')
            raise subprocess.TimeoutExpired(args, timeout, output=latest_out[:32768], stderr=latest_err[:32768])
        except BaseException as primary:
            if isinstance(primary, subprocess.TimeoutExpired):
                self.window_expired = True
                primary.timeout = timeout
                self.stdout = primary.output if type(primary.output) is bytes else b''
                self.command_stderr = primary.stderr if type(primary.stderr) is bytes else b''
            if self.child is not None:
                try:
                    if self.child.poll() is None:
                        self.child.kill()  # only this unreaped Popen command
                    self.child.wait(timeout=1)
                    self.command_cleanup = 'PASS'
                except BaseException:
                    self.command_cleanup = 'UNKNOWN'
                    self.fail('COMMAND_CLEANUP_UNKNOWN')
            raise
        finally:
            if self.command_observed_end is None:
                self.command_observed_end = time.monotonic()
            self.finish()

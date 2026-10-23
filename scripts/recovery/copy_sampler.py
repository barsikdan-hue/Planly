"""Request-file metadata sampler. Inert import; caller supplies admission.

All reads are non-atomic. A retained description is continuous; its relationship
to a later target FD/syscall is NOT established. No root-cause or whole-image
throughput conclusion follows from these samples. Run in OwnedWorker so a
blocked kernel metadata operation cannot block the controller's Node deadline.
"""
import contextlib
import json
import math
import os
import platform
import re
import select
import time

from copy_observation import Incomplete, compare
import fd_pin
from layer_binding import request_layers
import resource_observation as resources


def packet(value):
    try:
        raw = json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii') + b'\n'
    except (ValueError, TypeError, UnicodeError) as error:
        raise Incomplete('SAMPLE_JSON_REQUIRED') from error
    if len(raw) > 4096:
        raise Incomplete('SAMPLE_PACKET_BOUND')
    return raw


def copy_fds(raw, architecture):
    # Linux v6.8 arch/x86/entry/syscalls/syscall_64.tbl:326/common.
    # A different architecture/model must be reviewed, never guessed.
    if architecture != 'x86_64':
        raise Incomplete('REVIEWED_SYSCALL_ARCH_REQUIRED')
    if type(raw) is not str or len(raw) > 8192:
        raise Incomplete('SYSCALL_METADATA_BOUND')
    fields = raw.split()
    if fields == ['running'] or (fields and fields[0] == '-1'):
        return None
    if not fields or fields[0] != '326':
        return None
    if len(fields) != 9 or any(not re.fullmatch(r'0x[0-9a-fA-F]{1,16}', part) for part in fields[1:]):
        raise Incomplete('SYSCALL_METADATA_FORMAT')
    args = [int(part, 16) for part in fields[1:7]]
    if args[1] or args[3] or args[5] or not args[4]:
        return None
    if args[0] == args[2] or max(args[0], args[2]) > 2147483647:
        raise Incomplete('COPY_FD_IDENTITIES')
    return args[0], args[2]


def _syscall_pair(taskfd):
    return copy_fds(resources._text_at(taskfd, 'syscall'), platform.machine())


class Sampler:
    """At most seven samples and one held pair, scoped by exclusive caller gate.

    Construction captures the root baseline BEFORE command admission. bind()
    accepts only an already owned daemon and held proc directory/pidfd. It does
    not discover/adopt a daemon, authorize a create or weaken the build gate.
    """
    def __init__(self, source, verify_request):
        self.source, self.request_owner = source, verify_request
        self.stack, self.graph, self.pair = contextlib.ExitStack(), None, None
        self.pid = self.pidfd = self.procfd = self.start = self.owner = None
        self.calls, self.acquisitions, self.closed = 0, 0, False
        self.last_frame = None

    def __enter__(self):
        self.graph = self.stack.enter_context(request_layers(self.source, self.request_owner))
        return self

    def bind(self, pid, pidfd, procfd, start, owner):
        if (self.owner is not None or not callable(owner)
                or not all(type(v) is int and v >= 0 for v in (pid, pidfd, procfd, start)) or not pid or not start):
            raise Incomplete('OWNED_SAMPLER_BINDING_REQUIRED')
        self.pid, self.pidfd, self.procfd, self.start, self.owner = pid, pidfd, procfd, start, owner
        self.check()

    def check(self):
        if self.closed or self.graph is None or self.owner is None:
            raise Incomplete('SAMPLER_NOT_BOUND')
        self.request_owner()
        self.owner()
        if fd_pin._target(self.pidfd) != self.pid or select.select([self.pidfd], [], [], 0)[0]:
            raise Incomplete('SAMPLER_PIDFD_IDENTITY_LOST')
        row = resources.parse_stat(resources._text_at(self.procfd, 'stat'))
        if row['id'] != self.pid or row['start'] != self.start:
            raise Incomplete('SAMPLER_PROC_IDENTITY_LOST')

    def _candidates(self, deadline):
        until = min(deadline, time.monotonic() + 0.25)
        taskroot = os.open('task', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.procfd)
        found = []
        try:
            names = []
            with os.scandir(taskroot) as entries:
                for entry in entries:
                    if len(names) >= 512 or not re.fullmatch('[0-9]{1,10}', entry.name):
                        raise Incomplete('OWNED_TASK_BOUND')
                    names.append(entry.name)
            for name in names:
                if time.monotonic() >= until:
                    raise Incomplete('OWNED_TASK_SCAN_DEADLINE')
                taskfd = None
                try:
                    taskfd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=taskroot)
                    row = resources.parse_stat(resources._text_at(taskfd, 'stat'))
                    pair = _syscall_pair(taskfd)
                    if pair is not None:
                        found.append((row['id'], row['start'], pair))
                except FileNotFoundError:
                    # A vanished task is no active candidate, never zero I/O.
                    continue
                finally:
                    if taskfd is not None:
                        os.close(taskfd)
            if len(found) > 1:
                raise Incomplete('AMBIGUOUS_ACTIVE_COPY_TASKS')
            return found
        finally:
            os.close(taskroot)

    def release(self):
        if self.pair is not None:
            context = self.pair['context']
            self.pair = None
            context.__exit__(None, None, None)

    def sample(self, request_start, deadline):
        if (not all(type(v) in (int, float) and math.isfinite(v) for v in (request_start, deadline))
                or not request_start <= time.monotonic() < deadline <= request_start + 60 or self.calls >= 7):
            raise Incomplete('BOUNDED_SAMPLE_WINDOW_REQUIRED')
        self.calls += 1
        frame = dict(index=self.calls, start=time.monotonic(), copy=dict(status='NOT_OBSERVED'),
                     task=dict(status='NOT_OBSERVED'), rootCause='NOT_PROVEN')
        self.last_frame = frame
        try:
            self.check()
            frame['metrics'] = resources.observe(self.procfd, self.pid, self.start, self.check, filesystem_fd=self.source.leaf_fd)
            self.graph.capture()
            if self.pair is not None:
                old = self.pair
                observation = old['value'].observe()
                frame['copy'] = dict(status='RETAINED_PAIR_METADATA', pairIndex=self.acquisitions,
                                     binding=old['binding'], observation=observation,
                                     comparison=compare(old['before'], observation, request_start, deadline),
                                     targetContinuity='NOT_ESTABLISHED')
                self.release()
            else:
                candidates = self._candidates(deadline)
                if candidates:
                    tid, taskstart, fds = candidates[0]
                    # Go's owned daemon shares its file table across threads.
                    # These path/FD samples are bracketed, never atomic tracing.
                    paths = [os.readlink('fd/' + str(fd), dir_fd=self.procfd) for fd in fds]
                    binding = self.graph.files(*paths)
                    self.check()
                    context = fd_pin.pin_pair(self.pid, self.pidfd, *fds, self.check)
                    value = context.__enter__()
                    self.pair = dict(context=context, value=value, binding=binding, before=None)
                    observation = value.observe()
                    for role in ('source', 'destination'):
                        if any(observation[role][key] != binding[role][key] for key in ('device', 'inode')):
                            raise Incomplete('PINNED_REQUEST_FILE_IDENTITY_DRIFT')
                    if paths != [os.readlink('fd/' + str(fd), dir_fd=self.procfd) for fd in fds]:
                        raise Incomplete('REQUEST_FD_PATH_DRIFT')
                    self.graph.files(*paths)
                    self.acquisitions += 1
                    self.pair['before'] = observation
                    frame['copy'] = dict(status='PINNED_BASELINE', pairIndex=self.acquisitions,
                                         binding=binding, observation=observation, targetContinuity='NOT_ESTABLISHED')
                    taskfd = os.open('task/' + str(tid), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.procfd)
                    try:
                        frame['task'] = resources.observe(taskfd, tid, taskstart, self.check)
                    finally:
                        os.close(taskfd)
            self.check()
            frame['end'] = time.monotonic()
            if frame['end'] > deadline:
                raise Incomplete('SAMPLE_COMPLETED_AFTER_WINDOW')
            packet(frame)
            return frame
        except BaseException as error:
            error.available_sample = frame
            raise

    def __exit__(self, *exception):
        try:
            self.release()
        finally:
            self.closed = True
            self.stack.__exit__(*exception)

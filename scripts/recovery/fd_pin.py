"""Pin two independently owned Linux file descriptions, for metadata only.

No attachment, discovery, signals, data I/O, seeking, policy changes or fallback.
Import is inert. The caller must establish request/path provenance separately.
"""
import contextlib
import ctypes
import os
from pathlib import Path
import re
import select
import stat
import sys

import copy_observation

Incomplete = copy_observation.Incomplete


def _text(path):
    with path.open('rb') as stream:
        raw = stream.read(8193)
    if len(raw) > 8192:
        raise Incomplete('PROC_METADATA_BOUND')
    try:
        return raw.decode('ascii')
    except UnicodeDecodeError as error:
        raise Incomplete('PROC_METADATA_ENCODING') from error


def _target(pidfd):
    values = [line.split(':', 1)[1].strip() for line in _text(Path('/proc/self/fdinfo') / str(pidfd)).splitlines()
              if line.startswith('Pid:')]
    if len(values) != 1 or not re.fullmatch(r'[0-9]{1,10}', values[0]) or int(values[0]) == 0:
        raise Incomplete('PIDFD_TARGET_UNAVAILABLE')
    return int(values[0])


def _duplicate(pidfd, target_fd):
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, 'pidfd_getfd', None)
    if function is None:
        raise Incomplete('PIDFD_GETFD_UNAVAILABLE')
    function.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_uint)
    function.restype = ctypes.c_int
    duplicate = function(pidfd, target_fd, 0)
    if duplicate < 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))
    return duplicate


class PinnedPair:
    def __init__(self, pid, pidfd, target_start, owner, fds):
        self.pid, self.pidfd, self.target_start = pid, pidfd, target_start
        self.owner, self.fds, self.closed = owner, tuple(fds), False
        self.observer_start = copy_observation.process_start(_text(Path('/proc/self/stat')))

    def check(self):
        if self.closed:
            raise Incomplete('PIN_CONTEXT_CLOSED')
        self.owner()
        if _target(self.pidfd) != self.pid or select.select([self.pidfd], [], [], 0)[0]:
            raise Incomplete('PIDFD_IDENTITY_LOST')
        if copy_observation.process_start(_text(Path('/proc') / str(self.pid) / 'stat')) != self.target_start:
            raise Incomplete('PROCESS_IDENTITY_DRIFT')

    def observe(self):
        self.check()
        result = copy_observation.observe(os.getpid(), self.observer_start, *self.fds, self.check)
        result.update(pid=self.pid, processStart=self.target_start)
        return result


@contextlib.contextmanager
def pin_pair(pid, pidfd, source_fd, destination_fd, verify_owner):
    """Retain at most two FDs until context exit; ownership callback must raise.

    Do not use on arbitrary/live processes. Permission or symbol failure is
    a capability refusal. Never change policy or weaken identity to continue.
    """
    if (not all(type(v) is int and 0 <= v <= 2147483647 for v in (pid, pidfd, source_fd, destination_fd))
            or pid == 0 or source_fd == destination_fd or not callable(verify_owner)):
        raise Incomplete('EXPLICIT_PIN_IDENTITIES_REQUIRED')
    if sys.platform != 'linux':
        raise Incomplete('LINUX_PIDFD_REQUIRED')
    held, pair = [], None
    try:
        verify_owner()
        if _target(pidfd) != pid or select.select([pidfd], [], [], 0)[0]:
            raise Incomplete('PIDFD_IDENTITY_LOST')
        start = copy_observation.process_start(_text(Path('/proc') / str(pid) / 'stat'))
        for fd in (source_fd, destination_fd):
            duplicate = _duplicate(pidfd, fd)
            held.append(duplicate)
            if not stat.S_ISREG(os.fstat(duplicate).st_mode) or os.get_inheritable(duplicate):
                raise Incomplete('PRIVATE_REGULAR_PIN_REQUIRED')
        pair = PinnedPair(pid, pidfd, start, verify_owner, held)
        pair.check()
        yield pair
    finally:
        primary, closing = sys.exc_info()[1], None
        if pair is not None:
            pair.closed = True
        for fd in reversed(held):
            try:
                os.close(fd)
            except OSError as error:
                closing = closing or error
        if closing is not None:
            if primary is None:
                raise Incomplete('PIN_RELEASE_UNCERTAIN') from closing
            primary._pin_cleanup_incomplete = True

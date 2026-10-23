"""Local diagnostic component; import is inert and grants no server authority.

Observes file offsets, not syscall return values or root cause. A caller must
independently prove process/request/file ownership and preserve failed captures.
No Docker, SSH, retries, signals, file contents or authorization generation.
"""
import math
from pathlib import Path
import re
import stat
import time


class Incomplete(Exception):
    """An observation cannot support the requested conclusion."""


def process_start(raw):
    if not isinstance(raw, str) or len(raw) > 8192 or ')' not in raw:
        raise Incomplete('PROCESS_STAT_FORMAT')
    fields = raw.rsplit(')', 1)[1].split()
    if len(fields) < 20 or not re.fullmatch(r'[0-9]+', fields[19]):
        raise Incomplete('PROCESS_STAT_FORMAT')
    return int(fields[19])


def fd_position(raw):
    if not isinstance(raw, str) or len(raw) > 8192:
        raise Incomplete('FDINFO_BOUND')
    values = [line.split(':', 1)[1].strip() for line in raw.splitlines() if line.startswith('pos:')]
    if len(values) != 1 or not re.fullmatch(r'[0-9]+', values[0]):
        raise Incomplete('FDINFO_POSITION')
    return int(values[0])


def observe(pid, expected_start, source_fd, destination_fd, verify_owner, *, proc_root=Path('/proc')):
    """Read two caller-selected FD metadata records; never discover/attach to PIDs.

    verify_owner must raise unless independent ownership/lifecycle checks pass.
    Samples are non-atomic. This component supplies no request attribution,
    deadline interruption, pidfd guard, source-layer inventory or secure retention.
    """
    if (not all(type(v) is int and v >= 0 for v in (pid, expected_start, source_fd, destination_fd))
            or pid == 0 or expected_start == 0 or source_fd == destination_fd or not callable(verify_owner)):
        raise Incomplete('EXPLICIT_IDENTITIES_REQUIRED')
    base = Path(proc_root) / str(pid)

    def bounded(path):
        with path.open('rb') as stream:
            raw = stream.read(8193)
        if len(raw) > 8192:
            raise Incomplete('PROC_FILE_BOUND')
        try:
            return raw.decode('ascii')
        except UnicodeDecodeError as error:
            raise Incomplete('PROC_FILE_ENCODING') from error

    def recheck():
        verify_owner()
        if process_start(bounded(base / 'stat')) != expected_start:
            raise Incomplete('PROCESS_IDENTITY_DRIFT')

    started = time.monotonic()
    recheck()
    files = {}
    for name, fd in (('source', source_fd), ('destination', destination_fd)):
        path = base / 'fd' / str(fd)
        before = path.stat()
        if not stat.S_ISREG(before.st_mode):
            raise Incomplete('REGULAR_FILE_REQUIRED')
        position = fd_position(bounded(base / 'fdinfo' / str(fd)))
        after = path.stat()
        if (before.st_dev, before.st_ino, before.st_mode) != (after.st_dev, after.st_ino, after.st_mode):
            raise Incomplete('FILE_IDENTITY_DRIFT')
        files[name] = dict(device=after.st_dev, inode=after.st_ino, position=position, size=after.st_size)
    recheck()
    return dict(start=started, end=time.monotonic(), pid=pid, processStart=expected_start, **files)


def compare(before, after, request_start, request_deadline):
    result = dict(status='INCONCLUSIVE', rootCause='NOT_PROVEN')

    def finite(value):
        return type(value) in (int, float) and math.isfinite(value)

    def valid(row):
        if type(row) is not dict or not all(finite(row.get(k)) for k in ('start', 'end')):
            return False
        if not request_start <= row['start'] <= row['end'] <= request_deadline:
            return False
        if not all(type(row.get(k)) is int and row[k] > 0 for k in ('pid', 'processStart')):
            return False
        for kind in ('source', 'destination'):
            file = row.get(kind)
            if type(file) is not dict or not all(type(file.get(k)) is int and file[k] >= 0 for k in ('device', 'inode', 'position', 'size')):
                return False
            if file['position'] > file['size']:
                return False
        return True

    if not finite(request_start) or not finite(request_deadline) or not request_start < request_deadline <= request_start + 60:
        return result
    if not valid(before) or not valid(after) or before['end'] >= after['start']:
        return result
    if any(before[k] != after[k] for k in ('pid', 'processStart')):
        return result
    for kind in ('source', 'destination'):
        if any(before[kind][k] != after[kind][k] for k in ('device', 'inode')):
            return result
    if before['source']['size'] != after['source']['size'] or after['destination']['size'] < before['destination']['size']:
        return result
    delta = after['source']['position'] - before['source']['position']
    if delta < 0 or after['destination']['position'] - before['destination']['position'] != delta:
        return result
    result.update(status='PAIR_OFFSETS_ADVANCED' if delta else 'NO_OFFSET_ADVANCE_OBSERVED',
                  offsetDeltaBytes=delta,
                  intervalSecondsMin=after['start'] - before['end'],
                  intervalSecondsMax=after['end'] - before['start'])
    return result

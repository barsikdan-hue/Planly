"""Bracket owned proc/file-system metadata; unavailable is never fabricated zero.

IO may include waited-for children. Block counters cover the filesystem's
logical block device, not one request or necessarily a physical disk. No
derived throughput, net writes, percentages, pressure verdict or root cause.
Call only inside the independently interruptible diagnostic observer.
"""
import errno
import os
from pathlib import Path
import re
import stat
import time

from copy_observation import Incomplete

IO_KEYS = ('rchar', 'wchar', 'syscr', 'syscw', 'read_bytes', 'write_bytes', 'cancelled_write_bytes')
BLOCK_KEYS = ('readsCompleted', 'readsMerged', 'sectorsRead', 'readMilliseconds', 'writesCompleted',
              'writesMerged', 'sectorsWritten', 'writeMilliseconds', 'inflight', 'ioMilliseconds',
              'weightedIoMilliseconds')


def _uint(raw):
    if type(raw) is not str or not re.fullmatch(r'[0-9]{1,20}', raw):
        raise Incomplete('COUNTER_FORMAT')
    value = int(raw)
    if value > 18446744073709551615:
        raise Incomplete('COUNTER_RANGE')
    return value


def _bounded(raw):
    if type(raw) is not str or len(raw) > 8192:
        raise Incomplete('METADATA_BOUND')
    return raw


def parse_stat(raw):
    raw = _bounded(raw)
    prefix = re.match(r'([0-9]{1,10}) \(', raw)
    if prefix is None or ')' not in raw:
        raise Incomplete('PROC_STAT_FORMAT')
    fields = raw.rsplit(')', 1)[1].split()
    if len(fields) < 22:
        raise Incomplete('PROC_STAT_FORMAT')
    return dict(id=_uint(prefix[1]), start=_uint(fields[19]), userTicks=_uint(fields[11]),
                systemTicks=_uint(fields[12]), minorFaults=_uint(fields[7]),
                majorFaults=_uint(fields[9]), rssPages=_uint(fields[21]))


def parse_io(raw):
    rows = {}
    for line in _bounded(raw).splitlines():
        if ':' not in line:
            raise Incomplete('PROC_IO_FORMAT')
        key, value = line.split(':', 1)
        if key in rows:
            raise Incomplete('DUPLICATE_IO_KEY')
        rows[key] = value.strip()
    if not set(IO_KEYS) <= set(rows):
        raise Incomplete('PROC_IO_FIELDS')
    return {key: _uint(rows[key]) for key in IO_KEYS}


def parse_sched(raw):
    fields = _bounded(raw).split()
    if len(fields) != 3:
        raise Incomplete('PROC_SCHED_FORMAT')
    return dict(zip(('cpuNanoseconds', 'runqueueNanoseconds', 'timeslices'), map(_uint, fields)))


def parse_block(raw):
    fields = _bounded(raw).split()
    if len(fields) not in (11, 15, 17):
        raise Incomplete('BLOCK_STAT_FORMAT')
    values = list(map(_uint, fields))
    return dict(zip(BLOCK_KEYS, values[:11]))


def _text_at(parent, name):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Incomplete('REGULAR_METADATA_REQUIRED')
        raw = os.read(fd, 8193)
        if len(raw) > 8192:
            raise Incomplete('METADATA_BOUND')
        try:
            return raw.decode('ascii')
        except UnicodeDecodeError as error:
            raise Incomplete('METADATA_ENCODING') from error
    finally:
        os.close(fd)


def _channel(action):
    try:
        return dict(status='OBSERVED', values=action())
    except Incomplete:
        return dict(status='UNAVAILABLE', code='FORMAT_OR_BOUND')
    except OSError as error:
        code = 'NOT_PRESENT' if error.errno == errno.ENOENT else 'ACCESS_DENIED' if error.errno in (errno.EPERM, errno.EACCES) else 'IO_ERROR'
        return dict(status='UNAVAILABLE', code=code)


def observe(proc_fd, expected_id, expected_start, verify_owner, *, filesystem_fd=None, sys_root=Path('/sys')):
    if (not all(type(value) is int and value >= 0 for value in (proc_fd, expected_id, expected_start))
            or expected_id == 0 or expected_start == 0 or not callable(verify_owner)
            or (filesystem_fd is not None and (type(filesystem_fd) is not int or filesystem_fd < 0))):
        raise Incomplete('OWNED_METADATA_IDENTITIES_REQUIRED')
    verify_owner()
    started = time.monotonic()
    before = parse_stat(_text_at(proc_fd, 'stat'))
    if before['id'] != expected_id or before['start'] != expected_start:
        raise Incomplete('OWNED_PROC_IDENTITY')
    result = dict(start=started, process=dict(status='OBSERVED', values=before),
                  io=_channel(lambda: parse_io(_text_at(proc_fd, 'io'))),
                  scheduler=_channel(lambda: parse_sched(_text_at(proc_fd, 'schedstat'))),
                  filesystem=dict(status='NOT_REQUESTED'), device=dict(status='NOT_REQUESTED'))
    if filesystem_fd is not None:
        fs_identity = os.fstat(filesystem_fd)
        def filesystem():
            if not stat.S_ISDIR(fs_identity.st_mode):
                raise Incomplete('SOURCE_DIRECTORY_REQUIRED')
            fs = os.fstatvfs(filesystem_fd)
            if fs.f_frsize <= 0 or min(fs.f_bavail, fs.f_bfree, fs.f_favail, fs.f_files) < 0:
                raise Incomplete('FILESYSTEM_CAPACITY_UNAVAILABLE')
            return dict(availableBytes=fs.f_bavail * fs.f_frsize, freeBytes=fs.f_bfree * fs.f_frsize,
                        availableInodes=fs.f_favail, totalInodes=fs.f_files,
                        inodeAccounting=bool(fs.f_files), major=os.major(fs_identity.st_dev), minor=os.minor(fs_identity.st_dev))
        result['filesystem'] = _channel(filesystem)
        major, minor = os.major(fs_identity.st_dev), os.minor(fs_identity.st_dev)
        if major == 0:
            result['device'] = dict(status='UNAVAILABLE', code='NO_BLOCK_DEVICE')
        else:
            def block():
                # Only the exact filesystem device; never guess a physical disk
                # or substitute host-wide totals when its counters are absent.
                parent = os.open(Path(sys_root) / 'dev/block' / f'{major}:{minor}', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
                try:
                    return parse_block(_text_at(parent, 'stat'))
                finally:
                    os.close(parent)
            result['device'] = _channel(block)
        after_fs = os.fstat(filesystem_fd)
        if (after_fs.st_dev, after_fs.st_ino) != (fs_identity.st_dev, fs_identity.st_ino):
            error = Incomplete('FILESYSTEM_IDENTITY_DRIFT')
            error.available_metrics = result
            raise error
    verify_owner()
    after = parse_stat(_text_at(proc_fd, 'stat'))
    if after['id'] != expected_id or after['start'] != expected_start:
        error = Incomplete('OWNED_PROC_IDENTITY_DRIFT')
        error.available_metrics = result
        raise error
    result['end'] = time.monotonic()
    return result

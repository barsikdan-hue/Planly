"""Closed native/init/RW directory model under an exclusive owned create.

Directory/file provenance is not request authorization or open-description
continuity. The controller supplies the admitted operation, daemon and build
invariant; fd_pin must independently retain the selected descriptions.
"""
import contextlib
import hashlib
import os
from pathlib import PurePosixPath
import re
import stat
import sys

from copy_observation import Incomplete


def classify_roots(native, baseline, current):
    if (type(native) is not str or type(baseline) is not set or type(current) is not set
            or native not in baseline or not baseline <= current or len(current) > 2048
            or any(type(name) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', name) for name in current)):
        raise Incomplete('CLOSED_REQUEST_ROOTS_REQUIRED')
    introduced = current - baseline
    if not introduced:
        return dict(phase='NO_DESTINATION', source=native, destination=None)
    if len(introduced) == 1:
        name = next(iter(introduced))
        if re.fullmatch(r'[a-f0-9]{64}-init', name):
            return dict(phase='NATIVE_TO_INIT', source=native, destination=name)
        if re.fullmatch(r'[a-f0-9]{64}', name):
            return dict(phase='NATIVE_TO_RW', source=native, destination=name)
    if len(introduced) == 2:
        for name in introduced:
            if re.fullmatch(r'[a-f0-9]{64}', name) and name + '-init' in introduced:
                return dict(phase='INIT_TO_RW', source=name + '-init', destination=name)
    raise Incomplete('AMBIGUOUS_REQUEST_ROOTS')


def _id(value):
    return value.st_dev, value.st_ino, value.st_uid


class RequestLayers:
    def __init__(self, source, owner):
        self.source, self.owner, self.nodes, self.closed = source, owner, {}, False
        self.baseline = self.scan()
        if source.cache_id not in self.baseline:
            raise Incomplete('NATIVE_ROOT_NOT_IN_BASELINE')

    def check(self):
        if self.closed:
            raise Incomplete('REQUEST_GRAPH_CLOSED')
        self.owner()
        self.source.recheck()

    def scan(self):
        self.check()
        result = {}
        with os.scandir(self.source.roots_fd) as iterator:
            for entry in iterator:
                if len(result) >= 2048 or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', entry.name):
                    raise Incomplete('VFS_ROOT_ENTRY_BOUND')
                value = os.stat(entry.name, dir_fd=self.source.roots_fd, follow_symlinks=False)
                if not stat.S_ISDIR(value.st_mode) or value.st_uid != os.geteuid():
                    raise Incomplete('OWNED_VFS_ROOT_REQUIRED')
                result[entry.name] = _id(value)
        self.check()
        return result

    def capture(self):
        current = self.scan()
        if any(current.get(name) != identity for name, identity in self.baseline.items()):
            raise Incomplete('BASELINE_ROOT_IDENTITY_DRIFT')
        roles = classify_roots(self.source.cache_id, set(self.baseline), set(current))
        if not set(self.nodes) <= set(current):
            raise Incomplete('REQUEST_ROOT_REMOVED')
        for name in set(current) - set(self.baseline):
            if name in self.nodes:
                fd, identity = self.nodes[name]
                if _id(os.fstat(fd)) != identity or current[name] != identity:
                    raise Incomplete('REQUEST_ROOT_IDENTITY_DRIFT')
            else:
                fd = os.open(name, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.source.roots_fd)
                self.nodes[name] = fd, _id(os.fstat(fd))
                if self.nodes[name][1] != current[name]:
                    raise Incomplete('REQUEST_ROOT_IDENTITY_DRIFT')
        self.check()
        return roles

    def _parts(self, path):
        if (type(path) is not str or not path.startswith('/') or len(path.encode('utf8')) > 4096
                or '\0' in path or path.endswith(' (deleted)') or any(part in ('.', '..') for part in path.split('/'))
                or str(PurePosixPath(path)) != path):
            raise Incomplete('CANONICAL_OWNED_FILE_PATH_REQUIRED')
        root = os.readlink('/proc/self/fd/' + str(self.source.roots_fd))
        try:
            parts = PurePosixPath(path).relative_to(PurePosixPath(root)).parts
        except ValueError as error:
            raise Incomplete('FILE_OUTSIDE_REQUEST_ROOTS') from error
        if len(parts) < 2 or len(parts) > 257:
            raise Incomplete('REQUEST_FILE_DEPTH_BOUND')
        return parts

    def _file(self, root_fd, parts):
        held = []
        try:
            parent = root_fd
            for name in parts[:-1]:
                parent = os.open(name, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
                held.append(parent)
            fd = os.open(parts[-1], os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            held.append(fd)
            value = os.fstat(fd)
            if not stat.S_ISREG(value.st_mode):
                raise Incomplete('REQUEST_REGULAR_FILE_REQUIRED')
            return dict(device=value.st_dev, inode=value.st_ino, size=value.st_size)
        finally:
            for fd in reversed(held):
                os.close(fd)

    def files(self, source_path, destination_path):
        roles = self.capture()
        src, dst = self._parts(source_path), self._parts(destination_path)
        if src[0] != roles['source'] or dst[0] != roles['destination'] or src[1:] != dst[1:]:
            raise Incomplete('EXACT_REQUEST_FILE_PAIR_REQUIRED')
        src_root = self.source.leaf_fd if src[0] == self.source.cache_id else self.nodes[src[0]][0]
        dst_root = self.nodes[dst[0]][0]
        source = self._file(src_root, src[1:])
        destination = self._file(dst_root, dst[1:])
        self.check()
        alias = hashlib.sha256(('\0'.join((roles['phase'], src[0], dst[0], *src[1:]))).encode('utf8')).hexdigest()
        return dict(phase=roles['phase'], alias=alias, source=source, destination=destination)


@contextlib.contextmanager
def request_layers(source, verify_request):
    if not callable(verify_request):
        raise Incomplete('REQUEST_OWNERSHIP_REQUIRED')
    graph = RequestLayers(source, verify_request)
    try:
        yield graph
    finally:
        graph.closed = True
        primary, closing = sys.exc_info()[1], None
        for fd, _ in graph.nodes.values():
            try:
                os.close(fd)
            except OSError as error:
                closing = closing or error
        if closing is not None:
            if primary is None:
                raise Incomplete('REQUEST_ROOT_RELEASE_UNCERTAIN') from closing
            primary._request_root_cleanup_unknown = True

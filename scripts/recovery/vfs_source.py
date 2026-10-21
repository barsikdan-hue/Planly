"""Held native-config→VFS source provenance and metadata-only workload.

The caller owns the store and must independently recheck its authority and
ancestors. Never extracts an image, starts a daemon or reads image file data.
"""
import contextlib
import hashlib
import json
import math
import os
import re
import stat
import sys
import time

from copy_observation import Incomplete


def _identity(value):
    return value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid


def _file_stamp(value):
    return _identity(value) + (value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Incomplete('DUPLICATE_CONFIG_KEY')
        result[key] = value
    return result


class BoundSource:
    def __init__(self, store_fd, expected, owner, handles):
        self.owner, self.handles, self.edges, self.files = owner, handles, [], []
        self.root_fd = os.dup(store_fd)
        handles.append(self.root_fd)
        actual = os.fstat(self.root_fd)
        if (actual.st_dev, actual.st_ino) != expected or not stat.S_ISDIR(actual.st_mode) or actual.st_uid != os.geteuid():
            raise Incomplete('OWNED_STORE_IDENTITY')
        self.root_identity = _identity(actual)
        self.last_workload = None

    def directory(self, parent, name):
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        self.handles.append(fd)
        value = os.fstat(fd)
        if not stat.S_ISDIR(value.st_mode) or value.st_uid != os.geteuid():
            raise Incomplete('OWNED_VFS_METADATA_DIRECTORY')
        self.edges.append((parent, name, fd, _identity(value)))
        return fd

    def directories(self, parent, parts):
        for name in parts:
            parent = self.directory(parent, name)
        return parent

    def read(self, parent, name, bound):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        try:
            before = os.fstat(fd)
            if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                    or before.st_uid != os.geteuid() or not 0 < before.st_size <= bound):
                raise Incomplete('BOUNDED_VFS_METADATA_FILE')
            raw = bytearray()
            while len(raw) <= bound:
                part = os.read(fd, min(65536, bound + 1 - len(raw)))
                if not part:
                    break
                raw.extend(part)
            after = os.fstat(fd)
            if len(raw) > bound or len(raw) != before.st_size or _file_stamp(after) != _file_stamp(before):
                raise Incomplete('VFS_METADATA_DRIFT')
            self.files.append((parent, name, _file_stamp(after)))
            return bytes(raw)
        finally:
            os.close(fd)

    def resolve(self, config):
        content = self.directories(self.root_fd, ('image', 'vfs', 'imagedb', 'content', 'sha256'))
        raw = self.read(content, config[7:], 16 * 1024 * 1024)
        if hashlib.sha256(raw).hexdigest() != config[7:]:
            raise Incomplete('NATIVE_CONFIG_CONTENT_HASH')
        decoded = json.loads(raw, object_pairs_hook=_object)
        rootfs = decoded.get('rootfs') if type(decoded) is dict else None
        diffs = rootfs.get('diff_ids') if type(rootfs) is dict else None
        if (type(rootfs) is not dict or rootfs.get('type') != 'layers' or type(diffs) is not list
                or not 0 < len(diffs) <= 256
                or any(type(value) is not str or not re.fullmatch(r'sha256:[a-f0-9]{64}', value) for value in diffs)):
            raise Incomplete('EXACT_NATIVE_ROOTFS_LAYERS')
        layerdb = self.directories(self.root_fd, ('image', 'vfs', 'layerdb', 'sha256'))
        roots = self.directories(self.root_fd, ('vfs', 'dir'))
        parent = None
        for diff in diffs:
            chain = diff if parent is None else 'sha256:' + hashlib.sha256((parent + ' ' + diff).encode('ascii')).hexdigest()
            layer = self.directory(layerdb, chain[7:])
            if self.read(layer, 'diff', 256).decode('ascii').strip() != diff:
                raise Incomplete('VFS_LAYER_DIFF_MISMATCH')
            if parent is not None and self.read(layer, 'parent', 256).decode('ascii').strip() != parent:
                raise Incomplete('VFS_LAYER_PARENT_MISMATCH')
            cache = self.read(layer, 'cache-id', 256).decode('ascii').strip()
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', cache):
                raise Incomplete('VFS_CACHE_ID_FORMAT')
            self.leaf_fd = self.directory(roots, cache)
            parent = chain
        self.config_id, self.chain_id, self.cache_id = config, parent, cache
        self.recheck()

    def recheck(self):
        self.owner()
        if _identity(os.fstat(self.root_fd)) != self.root_identity:
            raise Incomplete('STORE_IDENTITY_DRIFT')
        for parent, name, fd, expected in self.edges:
            if (_identity(os.fstat(fd)) != expected
                    or _identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) != expected):
                raise Incomplete('VFS_DIRECTORY_IDENTITY_DRIFT')
        for parent, name, expected in self.files:
            if _file_stamp(os.stat(name, dir_fd=parent, follow_symlinks=False)) != expected:
                raise Incomplete('VFS_METADATA_IDENTITY_DRIFT')

    def workload(self, deadline, max_entries=2000000):
        if (type(deadline) not in (int, float) or not math.isfinite(deadline)
                or type(max_entries) is not int or not 0 < max_entries <= 2000000):
            raise Incomplete('BOUNDED_WORKLOAD_REQUIRED')
        self.recheck()
        result = dict(complete=False, entries=0, directories=1, regularFiles=0, symlinks=0,
                      otherEntries=0, logicalRegularBytes=0, entryAllocatedBytes=0)
        self.last_workload = result
        def tick():
            if time.monotonic() >= deadline:
                raise Incomplete('WORKLOAD_DEADLINE')
        def walk(fd, depth):
            tick()
            if depth > 256:
                raise Incomplete('WORKLOAD_DEPTH_BOUND')
            with os.scandir(fd) as iterator:
                for entry in iterator:
                    tick()
                    value = os.stat(entry.name, dir_fd=fd, follow_symlinks=False)
                    result['entries'] += 1
                    if result['entries'] > max_entries:
                        raise Incomplete('WORKLOAD_ENTRY_BOUND')
                    result['entryAllocatedBytes'] += value.st_blocks * 512
                    if stat.S_ISDIR(value.st_mode):
                        result['directories'] += 1
                        child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                        try:
                            held = os.fstat(child)
                            if _identity(held) != _identity(value):
                                raise Incomplete('WORKLOAD_DIRECTORY_DRIFT')
                            walk(child, depth + 1)
                        finally:
                            os.close(child)
                    elif stat.S_ISREG(value.st_mode):
                        result['regularFiles'] += 1
                        result['logicalRegularBytes'] += value.st_size
                    elif stat.S_ISLNK(value.st_mode):
                        result['symlinks'] += 1
                    else:
                        result['otherEntries'] += 1
        walk(self.leaf_fd, 0)
        self.recheck()
        tick()
        result['complete'] = True
        return dict(result)


@contextlib.contextmanager
def source_root(store_fd, store_identity, config_id, verify_owner):
    if (type(store_fd) is not int or store_fd < 0 or type(store_identity) is not tuple or len(store_identity) != 2
            or any(type(v) is not int or v < 0 for v in store_identity)
            or type(config_id) is not str or not re.fullmatch(r'sha256:[a-f0-9]{64}', config_id)
            or not callable(verify_owner)):
        raise Incomplete('EXPLICIT_SOURCE_IDENTITIES_REQUIRED')
    if sys.platform != 'linux':
        raise Incomplete('LINUX_VFS_METADATA_REQUIRED')
    handles = []
    try:
        verify_owner()
        source = BoundSource(store_fd, store_identity, verify_owner, handles)
        source.resolve(config_id)
        yield source
    finally:
        primary, closing = sys.exc_info()[1], None
        for fd in reversed(handles):
            try:
                os.close(fd)
            except OSError as error:
                closing = closing or error
        if closing is not None:
            if primary is None:
                raise Incomplete('SOURCE_RELEASE_UNCERTAIN') from closing
            primary._source_cleanup_unknown = True

"""Closed isolated sampler bootstrap; no CLI/SSH/Docker or authority creation.

The caller must independently admit an exclusive owned create and verify the
daemon build against the reviewed model. Labels here are matching constraints,
not proof of installed binary provenance. Only a fresh approved controller may
call build_code/OwnedWorker; nothing is dispatched by importing this module.
"""
import contextlib
import json
import math
import os
from pathlib import PurePosixPath
import re
import select
import sys
import time

from copy_observation import Incomplete
from copy_sampler import Sampler, packet
import fd_pin
import resource_observation as resources
from vfs_source import source_root

MODULES = ('copy_observation', 'fd_pin', 'resource_observation', 'vfs_source', 'layer_binding', 'copy_sampler', 'sampler_worker')


def validate_config(config):
    keys = {'schema', 'runId', 'daemonPid', 'daemonStart', 'storePath', 'storeDevice', 'storeInode',
            'nativeConfigId', 'runtimeRoot', 'daemonVersion', 'daemonCommit'}
    if type(config) is not dict or set(config) != keys or type(config['schema']) is not int or config['schema'] != 1:
        raise Incomplete('CLOSED_SAMPLER_CONFIG_REQUIRED')
    if (not all(type(config[k]) is int and 0 < config[k] <= 18446744073709551615
                for k in ('daemonPid', 'daemonStart', 'storeDevice', 'storeInode')) or config['daemonPid'] > 2147483647
            or type(config['runId']) is not str
            or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', config['runId'])
            or config['runtimeRoot'] != '/run/planly-a1-reuse-' + config['runId']
            or type(config['nativeConfigId']) is not str or not re.fullmatch('sha256:[a-f0-9]{64}', config['nativeConfigId'])
            or config['daemonVersion'] != '29.9.1' or config['daemonCommit'] != 'b26fb77'):
        raise Incomplete('PINNED_SAMPLER_IDENTITIES_REQUIRED')
    path = config['storePath']
    if (type(path) is not str or not path.startswith('/') or len(path.encode('utf8')) > 4096 or '\0' in path
            or any(part in ('.', '..') for part in path.split('/')) or str(PurePosixPath(path)) != path or path == '/'):
        raise Incomplete('CANONICAL_PRIVATE_STORE_REQUIRED')


def _pairs(values):
    result = {}
    for key, value in values:
        if key in result:
            raise Incomplete('DUPLICATE_CONTROL_KEY')
        result[key] = value
    return result


def parse_start(raw, run_id, now):
    if type(raw) is not bytes or not 0 < len(raw) <= 4096 or not raw.endswith(b'\n') or b'\n' in raw[:-1]:
        raise Incomplete('ONE_BOUNDED_START_REQUIRED')
    try:
        row = json.loads(raw, object_pairs_hook=_pairs)
    except (ValueError, UnicodeError) as error:
        raise Incomplete('START_JSON_REQUIRED') from error
    if (type(row) is not dict or set(row) != {'kind', 'runId', 'start', 'deadline'}
            or row['kind'] != 'START' or row['runId'] != run_id
            or not all(type(row[k]) in (int, float) and math.isfinite(row[k]) for k in ('start', 'deadline'))
            or not row['start'] <= now < row['deadline'] <= row['start'] + 60):
        raise Incomplete('BOUNDED_SAME_RUN_START_REQUIRED')
    return row


def build_code(sources, config):
    validate_config(config)
    if type(sources) is not dict or set(sources) != set(MODULES) or any(type(raw) is not bytes for raw in sources.values()):
        raise Incomplete('EXACT_REVIEWED_SAMPLER_MODULES_REQUIRED')
    if sum(map(len, sources.values())) > 60000:
        raise Incomplete('OBSERVER_BOOTSTRAP_BOUND')
    # No repository import path, inherited environment or disk module writes.
    code = 'import sys,types\nCONFIG=' + repr(config) + '\n'
    for name in MODULES:
        raw = sources[name]
        compile(raw, '<reviewed-' + name + '>', 'exec')
        code += ('m=types.ModuleType(' + repr(name) + ');sys.modules[' + repr(name) + ']=m\n'
                 'exec(compile(' + repr(raw) + ',' + repr('<reviewed-' + name + '>') + ',"exec"),m.__dict__)\n')
    code += 'sys.exit(sys.modules["sampler_worker"].run(CONFIG))\n'
    if len(code.encode('utf8')) > 65536:
        raise Incomplete('OBSERVER_BOOTSTRAP_BOUND')
    return code


def _emit(value):
    sys.stdout.buffer.write(packet(value))
    sys.stdout.buffer.flush()


def run(config):
    """Only an isolated OwnedWorker calls this; termination belongs to parent."""
    sampler = None
    try:
        validate_config(config)
        if sys.platform != 'linux' or os.geteuid() != 0:
            raise Incomplete('OWNED_ROOT_OBSERVER_REQUIRED')
        with contextlib.ExitStack() as stack:
            def held(fd):
                stack.callback(os.close, fd)
                return fd
            pid = config['daemonPid']
            pidfd = held(os.pidfd_open(pid))
            procfd = held(os.open('/proc/' + str(pid), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC))
            storefd = held(os.open(config['storePath'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC))
            def owner():
                if fd_pin._target(pidfd) != pid or select.select([pidfd], [], [], 0)[0] or os.fstat(procfd).st_uid != 0:
                    raise Incomplete('OWNED_DAEMON_LOST')
                row = resources.parse_stat(resources._text_at(procfd, 'stat'))
                if row['id'] != pid or row['start'] != config['daemonStart']:
                    raise Incomplete('OWNED_DAEMON_START_DRIFT')
                commandfd = os.open('cmdline', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=procfd)
                try:
                    command = os.read(commandfd, 65537)
                finally:
                    os.close(commandfd)
                if (len(command) > 65536 or not command.endswith(b'\0')
                        or ('--data-root=' + config['storePath']).encode() not in command.split(b'\0')
                        or ('--exec-root=' + config['runtimeRoot'] + '/docker-exec').encode() not in command.split(b'\0')):
                    raise Incomplete('OWNED_DAEMON_COMMAND_MARKERS')
                identity = os.stat(config['storePath'], follow_symlinks=False)
                if (identity.st_dev, identity.st_ino) != (config['storeDevice'], config['storeInode']):
                    raise Incomplete('OWNED_STORE_PATH_DRIFT')
            owner()
            source = stack.enter_context(source_root(storefd, (config['storeDevice'], config['storeInode']), config['nativeConfigId'], owner))
            # Preparation is independently interruptible and occurs before Node.
            workload = source.workload(time.monotonic() + 30, 2000000)
            sampler = stack.enter_context(Sampler(source, owner))
            sampler.bind(pid, pidfd, procfd, config['daemonStart'], owner)
            _emit(dict(kind='READY', runId=config['runId'], workload=workload, rootCause='NOT_PROVEN'))
            start = parse_start(sys.stdin.buffer.readline(4097), config['runId'], time.monotonic())
            duration = start['deadline'] - start['start']
            for offset in (0, 20, 40, 45, 50, 55, 58):
                wait = start['start'] + duration * (offset / 60) - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                row = sampler.sample(start['start'], start['deadline'])
                _emit(dict(row, kind='SAMPLE', runId=config['runId']))
        return 0
    except BaseException as error:
        # No exception text/cmdline/path/environment reaches the private packet.
        code = error.args[0] if isinstance(error, Incomplete) and error.args and re.fullmatch('[A-Z_]{1,80}', str(error.args[0])) else 'SAMPLER_FAILURE'
        row = dict(kind='ERROR', code=code, rootCause='NOT_PROVEN')
        if sampler is not None and sampler.last_frame is not None:
            # Preserve bounded partial JSON even when a complete frame won't fit.
            raw = json.dumps(sampler.last_frame, sort_keys=True, separators=(',', ':'), allow_nan=False)
            row['partialJsonPrefix'] = raw[:2048]
            row['partialTruncated'] = len(raw) > 2048
        if isinstance(error, OSError):
            row['errno'] = error.errno
        _emit(row)
        return 1

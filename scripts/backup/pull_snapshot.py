"""Verify/copy ONE existing immutable snapshot. Never creates a server backup.

No scheduler installation, service control, deletion of successful copies, or
provider access. Runtime files contain secrets: destination must be private.
Python 3.11+, standard library only. Do not log subprocess output or raw errors.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import threading

FILES = ('postgres.dump', 'media-and-config.tar.gz', 'media-manifest.private.json',
         'runtime.private.json', 'counts.json')
MAX_MANIFEST = 1024 * 1024
MAX_FILE = 100 * 1024**3
RESERVE = 512 * 1024**2


class BackupError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def snapshot_name(value):
    if not isinstance(value, str) or not re.fullmatch(r'saas-[0-9]{8}-[0-9]{10}', value):
        raise BackupError('INVALID_SNAPSHOT')
    try:
        datetime.strptime(value.split('-')[1], '%Y%m%d')
        datetime.fromtimestamp(int(value.split('-')[2]), timezone.utc)
    except (ValueError, OverflowError, OSError):
        raise BackupError('INVALID_SNAPSHOT') from None
    return value


def safe_path(path):
    """Reject symlinks, Windows junctions/reparse points, special/hardlinked files."""
    for part in (path, *path.parents):
        try:
            st = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & 0x400:
            raise BackupError('UNSAFE_PATH')
        if not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)):
            raise BackupError('UNSAFE_PATH')
        if stat.S_ISREG(st.st_mode) and st.st_nlink != 1:
            raise BackupError('UNSAFE_PATH')


def windows_acl(path, created=False, directory=False):
        # SID-based .NET ACLs work independently of Windows display language.
        script = r"""
        $ErrorActionPreference='Stop'
        $p=$env:PLANLY_BACKUP_ACL_PATH
        $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
        if ($env:PLANLY_BACKUP_ACL_NEW -eq '1') {
          $acl=New-Object System.Security.AccessControl.DirectorySecurity
          $acl.SetOwner($sid)
          $acl.SetAccessRuleProtection($true,$false)
          $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
          $acl.AddAccessRule($rule)
          [System.IO.Directory]::SetAccessControl($p,$acl)
        }
        if ($env:PLANLY_BACKUP_ACL_DIR -eq '1') {
          $acl=[System.IO.Directory]::GetAccessControl($p)
        } else {
          $acl=[System.IO.File]::GetAccessControl($p)
        }
        if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {exit 2}
        $rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])
        $own=$false
        $inheritable=$false
        $required=[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
        foreach ($r in $rules) {
          if ($r.AccessControlType -eq 'Allow') {
            if ($r.IdentityReference.Value -ne $sid.Value) {exit 3}
            if (($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) {
              if ($r.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::InheritOnly) {$own=$true}
              if (($r.InheritanceFlags -band $required) -eq $required) {$inheritable=$true}
            }
          }
        }
        if (!$own) {exit 4}
        if ($env:PLANLY_BACKUP_ACL_DIR -eq '1' -and !$inheritable) {exit 5}
        """
        env = dict(os.environ, PLANLY_BACKUP_ACL_PATH=str(path.resolve()),
                   PLANLY_BACKUP_ACL_DIR='1' if directory else '0',
                   PLANLY_BACKUP_ACL_NEW='1' if created else '0')
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive',
                                 '-Command', script], env=env, capture_output=True, timeout=30)
        if result.returncode:
            raise BackupError('PRIVATE_ACL_REQUIRED_' + str(result.returncode))


def private_dir(path):
    safe_path(path)
    created = not path.exists()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir():
        raise BackupError('UNSAFE_PATH')
    if os.name == 'nt':
        windows_acl(path, created=created, directory=True)
    else:
        st = path.stat()
        if st.st_uid != os.getuid() or st.st_mode & 0o077:
            raise BackupError('PRIVATE_ACL_REQUIRED')


def private_file(path):
    safe_path(path)
    if path.exists():
        if not path.is_file():
            raise BackupError('UNSAFE_PATH')
        if os.name == 'nt':
            windows_acl(path)
        elif path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
            raise BackupError('PRIVATE_ACL_REQUIRED')


@contextmanager
def lock(root):
    path = root / 'backup.lock'
    private_file(path)
    new = not path.exists()
    with path.open('a+b') as stream:
        if new and os.name != 'nt':
            path.chmod(0o600)
        private_file(path)
        if stream.tell() == 0:
            stream.write(b'0')
            stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise BackupError('BACKUP_ALREADY_RUNNING') from None
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def unique_keys(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise BackupError('INVALID_MANIFEST')
        result[name] = value
    return result


def parse_manifest(raw):
    try:
        if len(raw) > MAX_MANIFEST:
            raise BackupError('INVALID_MANIFEST')
        value = json.loads(raw, object_pairs_hook=unique_keys)
        if not isinstance(value, dict) or value.get('status') != 'FRESH_BACKUP_READY':
            raise BackupError('INVALID_MANIFEST')
        rows = value['files']
        if not isinstance(rows, list) or len(rows) != len(FILES):
            raise BackupError('INVALID_MANIFEST')
        names = set()
        for row in rows:
            name, size, digest = row['name'], row['bytes'], row['sha256']
            if name not in FILES or name in names or type(size) is not int or not 0 < size <= MAX_FILE:
                raise BackupError('INVALID_MANIFEST')
            if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
                raise BackupError('INVALID_MANIFEST')
            names.add(name)
        if names != set(FILES):
            raise BackupError('INVALID_MANIFEST')
        return rows
    except (ValueError, KeyError, TypeError, UnicodeError):
        raise BackupError('INVALID_MANIFEST') from None


def atomic_json(path, value):
    safe_path(path)
    fd, name = tempfile.mkstemp(prefix='.status-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            private_file(Path(name))
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def valid_file(path, row):
    private_file(path)
    if not path.is_file() or path.stat().st_size != row['bytes']:
        return False
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256']


def read_small(path, limit=MAX_MANIFEST):
    private_file(path)
    with path.open('rb') as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise BackupError('OVERSIZED_METADATA')
    return raw


def pull(source, destination, snapshot):
    snapshot_name(snapshot)
    root = Path(destination).absolute()
    private_dir(root)
    with lock(root):
        status_path = root / 'status.json'
        previous = json.loads(read_small(status_path)) if status_path.exists() else {}
        status = {'last_attempt': now(), 'snapshot': snapshot,
                  'last_success': previous.get('last_success'), 'status': 'IN_PROGRESS'}
        atomic_json(status_path, status)
        try:
            raw = io.BytesIO()
            source.fetch('manifest.json', raw, MAX_MANIFEST + 1)
            manifest = raw.getvalue()
            rows = parse_manifest(manifest)
            folder = root / snapshot
            partial = root / (snapshot + '.partial')
            safe_path(folder)
            safe_path(partial)
            complete = folder.exists()
            work = folder if complete else partial
            private_dir(work)
            stored = work / 'manifest.json'
            if stored.exists():
                if read_small(stored) != manifest:
                    raise BackupError('MANIFEST_CHANGED')
            elif complete:
                raise BackupError('INCOMPLETE_SNAPSHOT')
            else:
                with stored.open('xb') as stream:
                    if os.name != 'nt':
                        stored.chmod(0o600)
                    private_file(stored)
                    stream.write(manifest)
                    stream.flush()
                    os.fsync(stream.fileno())
            if not complete and shutil.disk_usage(root).free < sum(r['bytes'] for r in rows) * 2 + RESERVE:
                raise BackupError('INSUFFICIENT_SPACE')
            for row in rows:
                path = work / row['name']
                if valid_file(path, row):
                    continue
                if complete or path.exists():
                    raise BackupError('FILE_MISMATCH')
                temp = work / (row['name'] + '.part')
                private_file(temp)
                with temp.open('wb') as stream:
                    if os.name != 'nt':
                        temp.chmod(0o600)
                    private_file(temp)
                    source.fetch(row['name'], stream, row['bytes'] + 1)
                    stream.flush()
                    os.fsync(stream.fileno())
                if not valid_file(temp, row):
                    raise BackupError('FILE_MISMATCH')
                os.rename(temp, path)
            result = {'snapshot': snapshot, 'status': 'COPY_VERIFIED', 'verified_at': now(),
                      'snapshot_created_at': datetime.fromtimestamp(int(snapshot.split('-')[2]), timezone.utc).isoformat(),
                      'manifest_sha256': hashlib.sha256(manifest).hexdigest(),
                      'files': len(rows), 'bytes': sum(r['bytes'] for r in rows)}
            if complete:
                existing = json.loads(read_small(folder / 'COMPLETE.json'))
                if existing.get('manifest_sha256') != result['manifest_sha256']:
                    raise BackupError('INCOMPLETE_SNAPSHOT')
            else:
                atomic_json(work / 'COMPLETE.json', result)
                os.rename(work, folder)
            status.update(status='COPY_VERIFIED', last_success=result)
            atomic_json(status_path, status)
            return result
        except Exception as exc:
            code = str(exc) if isinstance(exc, BackupError) else 'LOCAL_IO_OR_TRANSFER_FAILED'
            status.update(status='FAILED', error=code)
            atomic_json(status_path, status)
            raise BackupError(code) from None


class SSHSource:
    def __init__(self, snapshot, key, known_hosts):
        self.snapshot = snapshot_name(snapshot)
        self.key = Path(key).absolute()
        self.known_hosts = Path(known_hosts).absolute()

    def command(self, name, limit):
        if name not in (*FILES, 'manifest.json') or type(limit) is not int or not 0 < limit <= MAX_FILE + 1:
            raise BackupError('INVALID_TRANSFER')
        remote = '/opt/planly-staging/backups/' + self.snapshot + '/' + name
        return ['ssh', '-T', '-i', str(self.key), '-o', 'IdentitiesOnly=yes',
                '-o', 'UserKnownHostsFile=' + str(self.known_hosts),
                '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15',
                '-o', 'ServerAliveCountMax=2', 'root@62.173.149.73',
                'head', '-c', str(limit), '--', remote]

    def fetch(self, name, output, limit):
        # Enforce the limit locally too; remote shell startup output is untrusted.
        # Discard stderr: it can contain connection details and need not be buffered.
        process = None
        reader = None
        errors = []
        try:
            process = subprocess.Popen(self.command(name, limit), stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL)

            def consume():
                total = 0
                try:
                    while True:
                        chunk = process.stdout.read(65536)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > limit:
                            errors.append('TRANSFER_OUTPUT_LIMIT')
                            process.kill()
                            return
                        output.write(chunk)
                except Exception:
                    errors.append('TRANSFER_FAILED')
                    if process.poll() is None:
                        process.kill()

            reader = threading.Thread(target=consume, daemon=True)
            reader.start()
            code = process.wait(timeout=120)
            reader.join(timeout=2)
            if errors:
                raise BackupError(errors[0])
            if code or reader.is_alive():
                raise BackupError('TRANSFER_FAILED')
        except (OSError, subprocess.TimeoutExpired):
            raise BackupError('TRANSFER_FAILED') from None
        finally:
            if process is not None:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                if reader is not None:
                    reader.join(timeout=2)
                if reader is None or not reader.is_alive():
                    process.stdout.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--known-hosts', type=Path, required=True)
    args = parser.parse_args()
    try:
        if not args.key.is_file() or not args.known_hosts.is_file():
            raise BackupError('SSH_FILES_REQUIRED')
        result = pull(SSHSource(args.snapshot, args.key, args.known_hosts), args.destination, args.snapshot)
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({'status': 'FAILED', 'error': str(exc) if isinstance(exc, BackupError) else 'LOCAL_IO_OR_TRANSFER_FAILED'}))
        return 20


if __name__ == '__main__':
    raise SystemExit(main())

"""Offline safety checks; fixtures contain no real database or credentials."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/backup/pull_snapshot.py'
spec = importlib.util.spec_from_file_location('pull_snapshot', SCRIPT)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class Source:
    def __init__(self):
        self.data = {name: ('fixture-' + name).encode() for name in backup.FILES}
        self.manifest = {'status': 'FRESH_BACKUP_READY', 'files': [
            {'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            for name, data in self.data.items()]}
        self.calls = []
        self.fail = None

    def fetch(self, name, output, limit):
        self.calls.append(name)
        data = json.dumps(self.manifest).encode() if name == 'manifest.json' else self.data[name]
        output.write(data[:limit])
        if name == self.fail:
            raise backup.BackupError('TRANSFER_FAILED')


class PullTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'private'
        self.source = Source()
        self.snapshot = 'saas-20261026-1793002809'

    def pull(self):
        return backup.pull(self.source, self.root, self.snapshot)

    def test_success_verifies_all_bytes_before_complete(self):
        result = self.pull()
        folder = self.root / self.snapshot
        self.assertEqual(result['status'], 'COPY_VERIFIED')
        self.assertTrue((folder / 'COMPLETE.json').is_file())
        self.assertFalse((self.root / (self.snapshot + '.partial')).exists())
        for name, data in self.source.data.items():
            self.assertEqual((folder / name).read_bytes(), data)
        self.assertEqual(json.loads((self.root / 'status.json').read_text())['last_success']['snapshot'], self.snapshot)

    def test_corruption_never_promotes_or_changes_previous_success(self):
        self.pull()
        prior = json.loads((self.root / 'status.json').read_text())['last_success']
        self.snapshot = 'saas-20261027-1793002810'
        self.source.data['postgres.dump'] = b'corrupt'
        with self.assertRaisesRegex(backup.BackupError, 'FILE_MISMATCH'):
            self.pull()
        self.assertFalse((self.root / self.snapshot).exists())
        self.assertEqual(json.loads((self.root / 'status.json').read_text())['last_success'], prior)

    def test_interrupted_transfer_resumes_same_manifest_without_redownloading_valid_files(self):
        self.source.fail = 'media-and-config.tar.gz'
        with self.assertRaises(backup.BackupError):
            self.pull()
        self.source.fail = None
        self.source.calls.clear()
        self.pull()
        self.assertNotIn('postgres.dump', self.source.calls)
        self.assertIn('media-and-config.tar.gz', self.source.calls)

    def test_resume_refuses_changed_manifest(self):
        self.source.fail = 'media-and-config.tar.gz'
        with self.assertRaises(backup.BackupError):
            self.pull()
        self.source.fail = None
        self.source.manifest['files'][0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(backup.BackupError, 'MANIFEST_CHANGED'):
            self.pull()

    def test_duplicate_finished_snapshot_is_checked_and_preserved(self):
        self.pull()
        self.source.calls.clear()
        self.pull()
        self.assertEqual(self.source.calls, ['manifest.json'])

    def test_duplicate_finished_snapshot_is_not_trusted_if_tampered(self):
        self.pull()
        (self.root / self.snapshot / 'postgres.dump').write_bytes(b'changed')
        with self.assertRaisesRegex(backup.BackupError, 'FILE_MISMATCH'):
            self.pull()

    def test_untrusted_names_sizes_status_and_duplicates_fail_closed(self):
        original = json.loads(json.dumps(self.source.manifest))
        bad = ['../escape', '/escape', 'C:escape', 'x:stream', 'CON', 'postgres.dump/evil']
        for name in bad:
            self.source.manifest = json.loads(json.dumps(original))
            self.source.manifest['files'][0]['name'] = name
            with self.subTest(name=name), self.assertRaises(backup.BackupError):
                backup.parse_manifest(json.dumps(self.source.manifest).encode())
        for size in [-1, True, 1.5, 2**60]:
            self.source.manifest = json.loads(json.dumps(original))
            self.source.manifest['files'][0]['bytes'] = size
            with self.subTest(size=size), self.assertRaises(backup.BackupError):
                backup.parse_manifest(json.dumps(self.source.manifest).encode())
        self.source.manifest = original
        self.source.manifest['files'].append(original['files'][0])
        with self.assertRaises(backup.BackupError):
            backup.parse_manifest(json.dumps(self.source.manifest).encode())

    def test_missing_required_file_and_nonready_status_are_rejected(self):
        self.source.manifest['files'].pop()
        with self.assertRaises(backup.BackupError):
            self.pull()
        self.source = Source()
        self.source.manifest['status'] = 'IN_PROGRESS'
        with self.assertRaises(backup.BackupError):
            self.pull()

    def test_insufficient_space_prevents_data_transfer(self):
        with mock.patch.object(backup.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 0})()):
            with self.assertRaisesRegex(backup.BackupError, 'INSUFFICIENT_SPACE'):
                self.pull()
        self.assertEqual(self.source.calls, ['manifest.json'])

    def test_snapshot_identifier_cannot_be_a_remote_command_or_path(self):
        for name in ['../escape', 'saas-20261026-123;id', 'saas-20261026-123\n', '--help']:
            self.snapshot = name
            with self.subTest(name=name), self.assertRaises(backup.BackupError):
                self.pull()
        self.assertEqual(self.source.calls, [])

    def test_second_process_cannot_enter_existing_lock(self):
        backup.private_dir(self.root)
        code = "import sys;sys.path.insert(0,sys.argv[1]);from pull_snapshot import lock,BackupError;from pathlib import Path\ntry:\n with lock(Path(sys.argv[2])): sys.exit(0)\nexcept BackupError: sys.exit(17)"
        with backup.lock(self.root):
            result = subprocess.run([sys.executable, '-B', '-c', code, str(SCRIPT.parent), str(self.root)], capture_output=True)
        self.assertEqual(result.returncode, 17, result.stderr)
        with backup.lock(self.root):
            pass

    @unittest.skipIf(os.name == 'nt', 'POSIX symlink fixture; Windows ACL checked separately')
    def test_symlink_cannot_redirect_copy(self):
        backup.private_dir(self.root)
        elsewhere = Path(self.temp.name) / 'elsewhere'
        elsewhere.mkdir()
        (self.root / (self.snapshot + '.partial')).symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaisesRegex(backup.BackupError, 'UNSAFE_PATH'):
            self.pull()
        self.assertEqual(list(elsewhere.iterdir()), [])

    def test_transfer_only_ssh_command_never_stops_or_starts_services(self):
        source = backup.SSHSource(self.snapshot, Path('key'), Path('known_hosts'))
        command = source.command('postgres.dump', 100)
        self.assertIn('StrictHostKeyChecking=yes', command)
        self.assertIn('BatchMode=yes', command)
        self.assertIn('head', command)
        self.assertNotIn('docker', ' '.join(command))
        self.assertNotIn('systemctl', ' '.join(command))

    def test_explicit_broad_file_permissions_are_rejected_on_completed_copy(self):
        self.pull()
        file = self.root / self.snapshot / 'postgres.dump'
        if os.name == 'nt':
            script = "$p=$env:FIXTURE_FILE;$acl=[IO.File]::GetAccessControl($p);$sid=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'Read','Allow');$acl.AddAccessRule($r);[IO.File]::SetAccessControl($p,$acl)"
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                           env=dict(os.environ, FIXTURE_FILE=str(file)), check=True, capture_output=True)
        else:
            file.chmod(0o644)
        with self.assertRaisesRegex(backup.BackupError, 'PRIVATE_ACL_REQUIRED'):
            self.pull()

    def test_local_output_limit_kills_oversized_ssh_output(self):
        source = backup.SSHSource(self.snapshot, Path('key'), Path('known_hosts'))
        command = [sys.executable, '-c', "import sys,time;sys.stdout.buffer.write(b'x'*200000);sys.stdout.flush();time.sleep(20)"]
        started = time.monotonic()
        with mock.patch.object(source, 'command', return_value=command), self.assertRaisesRegex(backup.BackupError, 'TRANSFER_OUTPUT_LIMIT'):
            source.fetch('manifest.json', __import__('io').BytesIO(), 100)
        self.assertLess(time.monotonic() - started, 10)

    def test_large_ssh_stderr_is_discarded_without_polluting_manifest(self):
        source = backup.SSHSource(self.snapshot, Path('key'), Path('known_hosts'))
        command = [sys.executable, '-c', "import sys;sys.stderr.buffer.write(b'x'*2000000);sys.stdout.buffer.write(b'ok')"]
        output = __import__('io').BytesIO()
        with mock.patch.object(source, 'command', return_value=command):
            source.fetch('manifest.json', output, 100)
        self.assertEqual(output.getvalue(), b'ok')

    @unittest.skipUnless(os.name == 'nt', 'Windows inheritance regression')
    def test_noninheritable_private_directory_is_rejected_before_writing_metadata(self):
        backup.private_dir(self.root)
        script = "$p=$env:FIXTURE_DIR;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow');$acl.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$acl)"
        subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                       env=dict(os.environ, FIXTURE_DIR=str(self.root)), check=True, capture_output=True)
        with self.assertRaisesRegex(backup.BackupError, 'PRIVATE_ACL_REQUIRED'):
            self.pull()
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == '__main__':
    from unittest import mock
    unittest.main()

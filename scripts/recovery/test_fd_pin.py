"""Only own local synthetic files/child; never Docker, SSH or host policy changes."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import types
import unittest

HERE = Path(__file__).parent
CHILD = r'''
import json,os,sys
src=os.open(sys.argv[1],os.O_RDONLY)
dst=os.open(sys.argv[2],os.O_RDWR)
print(json.dumps([src,dst]),flush=True)
for command in sys.stdin:
 if command.strip()=='move':
  os.lseek(src,5,os.SEEK_SET);os.lseek(dst,5,os.SEEK_SET)
 elif command.strip()=='reopen':
  os.close(src);os.close(dst)
  src=os.open(sys.argv[1],os.O_RDONLY);dst=os.open(sys.argv[2],os.O_RDWR)
  os.lseek(src,9,os.SEEK_SET);os.lseek(dst,9,os.SEEK_SET)
 elif command.strip()=='quit':break
 print(json.dumps([os.lseek(src,0,os.SEEK_CUR),os.lseek(dst,0,os.SEEK_CUR)]),flush=True)
os.close(src);os.close(dst)
'''


def load():
    path = HERE / 'fd_pin.py'
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('fd_pin', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class InputTests(unittest.TestCase):
    def test_invalid_identities_are_refused_before_owner_or_native_calls(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'pin_pair', None)), 'Guarded FD pinning is not implemented')
        def forbidden():
            self.fail('Invalid input reached ownership/native boundary')
        for pid, pidfd, src, dst, owner in [(True, 3, 4, 5, forbidden), (42, -1, 4, 5, forbidden),
                                           (42, 3, 4, 4, forbidden), (42, 3, 4, 5, None)]:
            with self.subTest(pid=pid, pidfd=pidfd), self.assertRaises(m.Incomplete):
                with m.pin_pair(pid, pidfd, src, dst, owner):
                    self.fail('Invalid pin context was entered')


@unittest.skipUnless(sys.platform == 'linux', 'Requires Linux pidfd_getfd and real owned child; dedicated CI must run it')
class LinuxPinTests(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.assertTrue(callable(getattr(self.m, 'pin_pair', None)), 'Guarded FD pinning is not implemented')

    @contextlib.contextmanager
    def fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'source', Path(directory) / 'target'
            source.write_bytes(b'x' * 16384)
            target.write_bytes(b'y' * 16384)
            child = subprocess.Popen([sys.executable, '-B', '-c', CHILD, str(source), str(target)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, bufsize=1)
            pidfd = None
            try:
                pidfd = os.pidfd_open(child.pid)
                def receive():
                    self.assertTrue(select.select([child.stdout], [], [], 5)[0], 'Fixture child did not reply')
                    return json.loads(child.stdout.readline())
                fds = receive()
                def owner():
                    if child.poll() is not None or select.select([pidfd], [], [], 0)[0]:
                        raise self.m.Incomplete('FIXTURE_OWNER_LOST')
                def command(value):
                    child.stdin.write(value + '\n')
                    child.stdin.flush()
                    return receive()
                yield child, pidfd, fds, owner, command
            finally:
                if child.poll() is None:
                    child.stdin.write('quit\n')
                    child.stdin.flush()
                try:
                    child.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()  # only our retained fixture Popen child
                    child.communicate(timeout=5)
                if pidfd is not None:
                    os.close(pidfd)

    def test_pin_retains_open_description_across_same_inode_close_reopen_without_changing_offsets(self):
        with self.fixture() as (child, pidfd, fds, owner, command):
            self.assertEqual(command('move'), [5, 5])
            with self.m.pin_pair(child.pid, pidfd, *fds, owner) as pair:
                before = pair.observe()
                self.assertEqual(before['source']['position'], 5)
                self.assertEqual(before['destination']['position'], 5)
                self.assertEqual(command('reopen'), [9, 9])
                after = pair.observe()
                self.assertEqual(after['source']['inode'], before['source']['inode'])
                self.assertEqual(after['source']['position'], 5)
                self.assertEqual(after['destination']['position'], 5)
                self.assertEqual(command('status'), [9, 9])
                held = pair.fds
            for fd in held:
                with self.assertRaises(OSError):
                    os.fstat(fd)

    def test_wrong_pidfd_or_owner_refusal_never_enters_context_or_leaks_duplicates(self):
        with self.fixture() as (child, pidfd, fds, owner, command):
            initial = set(Path('/proc/self/fd').iterdir())
            def refuse():
                raise self.m.Incomplete('FIXTURE_REFUSAL')
            for pid, proof in [(child.pid + 1, owner), (child.pid, refuse)]:
                with self.subTest(pid=pid), self.assertRaises(self.m.Incomplete):
                    with self.m.pin_pair(pid, pidfd, *fds, proof):
                        self.fail('Unproved owner was accepted')
                self.assertEqual(set(Path('/proc/self/fd').iterdir()), initial)

    def test_second_duplicate_failure_releases_first_duplicate(self):
        with self.fixture() as (child, pidfd, fds, owner, command):
            initial = set(Path('/proc/self/fd').iterdir())
            with self.assertRaises((OSError, self.m.Incomplete)):
                with self.m.pin_pair(child.pid, pidfd, fds[0], 1000000, owner):
                    self.fail('Nonexistent descriptor was accepted')
            self.assertEqual(set(Path('/proc/self/fd').iterdir()), initial)


if __name__ == '__main__':
    unittest.main()

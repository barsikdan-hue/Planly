"""Explicit ephemeral CI root fixture; never changes policy or accesses a daemon."""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import unittest

import test_fd_pin

OBSERVER = r'''
import json,os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import fd_pin,copy_observation
pid,src,dst,start=map(int,sys.argv[2:])
pidfd=os.pidfd_open(pid)
def owner():
 if copy_observation.process_start(Path('/proc',str(pid),'stat').read_text())!=start:
  raise fd_pin.Incomplete('FIXTURE_IDENTITY_LOST')
try:
 with fd_pin.pin_pair(pid,pidfd,src,dst,owner) as pair:
  syscall=Path('/proc',str(pid),'task',str(pid),'syscall').read_text()
  if not syscall or len(syscall)>1024:raise fd_pin.Incomplete('SYSCALL_METADATA_UNAVAILABLE')
  first=pair.observe()
  print(json.dumps([first['source']['position'],first['destination']['position']]),flush=True)
  if sys.stdin.readline().strip()!='again':raise fd_pin.Incomplete('FIXTURE_PROTOCOL')
  second=pair.observe()
  print(json.dumps([second['source']['position'],second['destination']['position']]),flush=True)
finally:os.close(pidfd)
'''


class SamplerTopology(unittest.TestCase):
    def test_root_observer_sibling_pins_only_our_copier_child_and_reads_syscall_metadata(self):
        self.assertEqual(sys.platform, 'linux', 'Explicit Linux root fixture required')
        self.assertEqual(os.geteuid(), 0, 'Explicit ephemeral CI root fixture required')
        fixture = test_fd_pin.LinuxPinTests('test_pin_retains_open_description_across_same_inode_close_reopen_without_changing_offsets')
        fixture.setUp()
        with fixture.fixture() as (copier, pidfd, fds, owner, command):
            self.assertEqual(command('move'), [5, 5])
            start = fixture.m.copy_observation.process_start(Path('/proc', str(copier.pid), 'stat').read_text())
            observer = subprocess.Popen([sys.executable, '-I', '-B', '-c', OBSERVER,
                                         str(Path(__file__).parent), str(copier.pid), *map(str, fds), str(start)],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, bufsize=1)
            try:
                self.assertTrue(select.select([observer.stdout], [], [], 5)[0], 'Observer did not reply')
                first = observer.stdout.readline()
                if not first:
                    self.fail('Observer refused capability: ' + observer.stderr.read(4096))
                self.assertEqual(json.loads(first), [5, 5])
                self.assertEqual(command('reopen'), [9, 9])
                observer.stdin.write('again\n')
                observer.stdin.flush()
                out, err = observer.communicate(timeout=5)
                self.assertEqual(observer.returncode, 0, err)
                self.assertEqual(json.loads(out), [5, 5])
                self.assertEqual(command('status'), [9, 9])
            finally:
                if observer.poll() is None:
                    observer.kill()  # only our retained fixture Popen observer
                observer.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()

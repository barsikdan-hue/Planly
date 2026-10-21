"""Explicit ephemeral CI root fixture; never changes policy or accesses a daemon."""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import unittest

import test_fd_pin
import test_vfs_source
import test_sampler_worker

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


class ActualWorker(unittest.TestCase):
    def test_isolated_packaged_sampler_reads_only_owned_fixture_and_finishes(self):
        from owned_worker import OwnedWorker
        import resource_observation as resources
        import time
        module = test_sampler_worker.load()
        self.assertTrue(callable(getattr(module, 'build_code', None)), 'Actual sampler worker bootstrap is missing')
        fixture = test_vfs_source.LinuxSource()
        with fixture.fixture() as (root, fd, identity, config_id, leaf, layer):
            target = root / 'unused-target'
            target.write_bytes(b'x' * 12)
            config = test_sampler_worker.config()
            child = subprocess.Popen([sys.executable, '-B', '-c', test_fd_pin.CHILD,
                                      str(leaf / 'payload'), str(target), '--data-root=' + str(root),
                                      '--exec-root=' + config['runtimeRoot'] + '/docker-exec'],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, bufsize=1)
            worker = None
            try:
                self.assertTrue(select.select([child.stdout], [], [], 5)[0])
                child.stdout.readline()
                start = resources.parse_stat(Path('/proc', str(child.pid), 'stat').read_text())['start']
                config.update(daemonPid=child.pid, daemonStart=start, storePath=str(root),
                              storeDevice=identity[0], storeInode=identity[1], nativeConfigId=config_id)
                sources = {name: Path(__file__).with_name(name + '.py').read_bytes() for name in module.MODULES}
                worker = OwnedWorker(module.build_code(sources, config))
                ready = json.loads(worker.read_line(time.monotonic() + 5))
                self.assertEqual(ready['kind'], 'READY', (ready, worker.stderr))
                self.assertEqual(ready['workload']['logicalRegularBytes'], 12)
                begin = time.monotonic()
                worker.send(json.dumps(dict(kind='START', runId=config['runId'], start=begin, deadline=begin + 3)).encode() + b'\n', begin + 3)
                frames = [json.loads(worker.read_line(begin + 4)) for _ in range(7)]
                self.assertEqual([row['index'] for row in frames], list(range(1, 8)))
                self.assertTrue(all(row['copy'] == {'status': 'NOT_OBSERVED'} for row in frames), frames)
                self.assertTrue(all(begin <= row['start'] <= row['end'] <= begin + 3 for row in frames))
                self.assertEqual(worker.close(), 'PASS')
                self.assertIsNone(child.poll(), 'Observer must not signal its sibling fixture daemon')
            finally:
                if worker is not None:
                    worker.close()
                if child.poll() is None:
                    child.stdin.write('quit\n'); child.stdin.flush()
                child.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()

"""Owned residual retirement decisions, no Docker/process/data operations."""
import unittest
import subprocess

class Retirement(unittest.TestCase):
    def fixture(self):
        import owned_retirement as m
        events=[]
        class IO:
            started=False
            def preflight(self):events.append('preflight')
            def preserve(self):events.append('preserve')
            def start(self):self.started=True;events.append('start')
            def inspect(self):events.append('inspect');return dict(id='a'*64,scope='p04a-a1-isolated-restore',run='b',name='/planly-a1-node-b',image='sha256:'+'c'*64,running=False,paused=False,restarting=False,dead=False,pid=0,restartPolicy='no')
            def images(self):events.append('images');return ['sha256:'+x*64 for x in 'cdef']
            def ids(self):events.append('ids');return [] if 'rm' in events else ['a'*64]
            def remove(self,cid):events.append('rm');return cid
            def stop(self):events.append('stop');return 'PASS'
            def postflight(self):events.append('postflight')
        target=dict(id='a'*64,scope='p04a-a1-isolated-restore',run='b',name='/planly-a1-node-b',image='sha256:'+'c'*64)
        return m,IO(),target,events

    def test_preservation_precedes_daemon_and_one_stopped_rm(self):
        m,io,target,e=self.fixture();r=m.retire(io,target)
        self.assertEqual(r['status'],'PASS');self.assertEqual(r['rmAttempts'],1)
        self.assertLess(e.index('preserve'),e.index('start'));self.assertEqual(e.count('rm'),1)
        self.assertLess(e.index('stop'),e.index('postflight'))

    def test_wrong_identity_running_or_restart_policy_never_reaches_rm(self):
        for change in (dict(id='0'*64),dict(run='foreign'),dict(image='sha256:'+'0'*64),dict(running=True),dict(pid=4),dict(restartPolicy='always')):
            with self.subTest(change=change):
                m,io,t,e=self.fixture();inspect=io.inspect;io.inspect=lambda:dict(inspect(),**change)
                r=m.retire(io,t);self.assertEqual(r['status'],'HOLD');self.assertNotIn('rm',e);self.assertIn('stop',e)

    def test_second_native_inspect_is_checked_immediately_before_rm(self):
        m,io,t,e=self.fixture();inspect=io.inspect
        def drift():
            value=inspect()
            if e.count('inspect')==2:value['running']=True
            return value
        io.inspect=drift;r=m.retire(io,t)
        self.assertEqual(r['status'],'HOLD');self.assertNotIn('rm',e)

    def test_lost_rm_ack_is_not_retried_and_original_error_survives_stop_error(self):
        m,io,t,e=self.fixture()
        def remove(_):e.append('rm');raise OSError(5,'PRIVATE_NATIVE_TEXT')
        def stop():e.append('stop');raise OSError(9,'PRIVATE_STOP_TEXT')
        io.remove=remove;io.stop=stop;r=m.retire(io,t)
        self.assertEqual(r['status'],'HOLD');self.assertEqual(r['rmAttempts'],1);self.assertEqual(e.count('rm'),1)
        self.assertEqual(r['primaryError']['errno'],5);self.assertEqual(r['secondaryError']['errno'],9)
        self.assertEqual(r['cleanup'],'UNKNOWN');self.assertNotIn('PRIVATE',str(r))

    def test_partial_daemon_start_is_stopped_and_no_unsupported_pass(self):
        m,io,t,e=self.fixture()
        def start():io.started=True;e.append('start');raise OSError(5,'START_FAILURE')
        io.start=start;r=m.retire(io,t)
        self.assertEqual(r['status'],'HOLD');self.assertIn('stop',e);self.assertNotIn('rm',e)

    def test_native_timeout_keeps_class_without_forwarding_command_or_bytes(self):
        m,io,t,e=self.fixture()
        def remove(_):raise subprocess.TimeoutExpired('PRIVATE_COMMAND',30,output=b'PRIVATE_OUT',stderr=b'PRIVATE_ERR')
        io.remove=remove;r=m.retire(io,t)
        self.assertEqual(r['primaryError']['class'],'TimeoutExpired')
        self.assertEqual(r['primaryError']['phase'],'RM');self.assertNotIn('PRIVATE',str(r))

    def test_changed_images_or_remaining_container_cannot_pass(self):
        for kind in ('images','ids'):
            m,io,t,e=self.fixture()
            if kind=='images':
                images=io.images
                io.images=lambda:images() if 'rm' not in e else ['sha256:'+'0'*64]
            else:io.ids=lambda:['a'*64]
            r=m.retire(io,t);self.assertEqual(r['status'],'HOLD');self.assertIn('stop',e)

if __name__=='__main__':unittest.main()

"""Finite experiment control only; synthetic capabilities, no Docker or SSH."""
import importlib.util
from pathlib import Path
import types
import unittest
from unittest import mock
import subprocess

def load():
    path=Path(__file__).with_name('copy_budget.py')
    if not path.exists():return types.SimpleNamespace()
    spec=importlib.util.spec_from_file_location('copy_budget_fixture',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class Budget(unittest.TestCase):
    def fixture(self):
        target=dict(id='a'*64,scope='saas-vfs-budget-probe',run='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name='/planly-a1-copy-measure-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',image='sha256:'+'b'*64)
        images=['sha256:'+v*64 for v in 'bcde'];events=[]
        def event(label,value=None):
            def call(*args):events.append(label);return value
            return call
        io=types.SimpleNamespace(started=False,image=target['image'])
        io.preflight=event('PREFLIGHT');io.preserve=event('PRESERVE')
        def start():events.append('START');io.started=True
        io.start=start;io.ids=mock.Mock(side_effect=[[],[]]);io.images=mock.Mock(side_effect=[images,images])
        io.create_once=event('CREATE',dict(cid='a'*64,seconds=73.25,pendingAt60=True,exitCode=0))
        io.target=lambda cid:target
        io.inspect=event('INSPECT',target|dict(running=False,paused=False,restarting=False,dead=False,pid=0,restartPolicy='no'))
        io.remove=event('RM','a'*64);io.stop=event('STOP','PASS');io.postflight=event('POSTFLIGHT')
        return io,events
    def test_complete_after60_proves_only_budget_and_cleans_exact_known_container(self):
        m=load();self.assertTrue(callable(getattr(m,'measure',None)),'Finite measurement controller missing')
        io,events=self.fixture();r=m.measure(io)
        self.assertEqual(r['status'],'MEASURED');self.assertEqual(r['cleanup'],'PASS');self.assertTrue(r['exceededOriginal60'])
        self.assertEqual(r['fullRecovery'],'UNVERIFIED')
        self.assertEqual(events,['PREFLIGHT','PRESERVE','START','CREATE','INSPECT','INSPECT','RM','STOP','POSTFLIGHT'])
        with self.assertRaisesRegex(ValueError,'ONE_BUDGET_MEASUREMENT'):m.measure(io)
    def test_uncertain_create_never_adopts_or_removes_and_always_stops_own_daemon(self):
        m=load();io,events=self.fixture();io.create_once=lambda:(_ for _ in ()).throw(subprocess.TimeoutExpired(['private'],180))
        r=m.measure(io);self.assertEqual(r['status'],'HOLD');self.assertEqual(r['rmAttempts'],0)
        self.assertEqual(r['primaryError'],dict(phase='CREATE',**{'class':'TimeoutExpired'}));self.assertIn('STOP',events);self.assertNotIn('RM',events)
        self.assertNotIn('private',repr(r))
    def test_foreign_or_running_native_result_blocks_removal(self):
        m=load()
        for change in ({'run':'foreign'},{'running':True},{'pid':False}):
            io,events=self.fixture();original=io.inspect();io.inspect=lambda _:original|change
            with self.subTest(change=change):r=m.measure(io);self.assertEqual(r['status'],'HOLD');self.assertEqual(r['rmAttempts'],0);self.assertNotIn('RM',events);self.assertIn('STOP',events)
    def test_partial_start_failure_still_reaps_direct_child(self):
        m=load();io,events=self.fixture()
        def fail():io.started=True;raise OSError(24,'PRIVATE')
        io.start=fail;r=m.measure(io);self.assertEqual(r['status'],'HOLD');self.assertIn('STOP',events)
    def test_wrong_duration_or_missing_evidence_is_not_measurement_success(self):
        m=load()
        for change in ({'seconds':181.0},{'seconds':float('nan')},{'pendingAt60':True,'seconds':2.0},{'pendingAt60':False,'seconds':73.25},{'cid':'foreign'}):
            io,events=self.fixture();io.create_once=lambda:dict(cid='a'*64,seconds=73.25,pendingAt60=True,exitCode=0)|change
            with self.subTest(change=change):r=m.measure(io);self.assertEqual(r['status'],'HOLD');self.assertNotIn('RM',events)
    def test_image_drift_or_unknown_stop_cannot_report_measured(self):
        m=load()
        for fail in ('images','stop'):
            io,events=self.fixture()
            if fail=='images':io.images.side_effect=[['sha256:'+v*64 for v in 'bcde'],['sha256:'+v*64 for v in 'bcdf']]
            else:io.stop=lambda: 'UNKNOWN'
            with self.subTest(fail=fail):r=m.measure(io);self.assertEqual(r['status'],'HOLD')
if __name__=='__main__':unittest.main()

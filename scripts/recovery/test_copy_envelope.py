"""Closed-protocol fixtures; legacy callback is not actual recovery proof."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import types
import unittest


def load():
    path = Path(__file__).with_name('copy_envelope.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('copy_envelope', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture():
    binding = dict(scope='ONE_M1_F17_OWNED_COPY_DIAGNOSTIC', runId='65f401ba-1c86-4c39-b7b7-a1d0fb23d71d',
                   authorizationId='b5911546-3d26-49a2-8a8a-dc1511287b26', grantSha256='a' * 64,
                   copyCapsSha256='b' * 64, diagnosticSourcesSha256='c' * 64)
    receipt = dict(status='NOT_OBSERVED', rootCause='NOT_PROVEN', probeStatus='CAPABILITY_OBSERVED', probeCleanup='PASS',
                   observerCleanup='PASS', commandCleanup='PASS', profileStatus='SKIPPED_FAST',
                   requestStart=10.0, requestDeadline=70.0, commandObservedEnd=11.0, windowExpired=False,
                   missingSlots=[1], lateSlots=[], afterCommandSlots=[], holdRequired=False,
                   daemonPid=42, daemonStart=123)
    workload = dict(complete=True, entries=0, directories=1, regularFiles=0, symlinks=0, otherEntries=0,
                    logicalRegularBytes=0, entryAllocatedBytes=0)
    entries = dict(READY=(json.dumps(dict(kind='READY', runId=binding['runId'], workload=workload, rootCause='NOT_PROVEN')) + '\n').encode(),
                   SAMPLES=b'', OBSERVER_STDERR=b'',
                   PROBE_STDOUT=b'{"status":"CAPABILITY_OBSERVED","fileDataReads":0,"duplicateAttempts":1}\n', PROBE_STDERR=b'')
    legacy = dict(safeObservation=dict(status='A1_ISOLATED_RESTORE_PASS', cleanup='PASS'))
    return binding, receipt, entries, legacy


class Protocol(unittest.TestCase):
    def test_fast_no_observation_is_explicit_and_all_provenance_and_bytes_are_bound(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'pack', None)), 'Closed integrated envelope is missing')
        binding, receipt, entries, legacy = fixture()
        value = m.pack(legacy, receipt, entries, binding)
        seen = []
        parsed = m.validate(m.canonical(value), binding, lambda raw: seen.append(json.loads(raw)))
        self.assertEqual(seen, [legacy])
        self.assertEqual(parsed['copy']['status'], 'NOT_OBSERVED')
        self.assertEqual(parsed['copy']['rootCause'], 'NOT_PROVEN')
        self.assertEqual(base64.b64decode(parsed['entries']['READY']['base64']), entries['READY'])
        for bad in [dict(value, unexpected=True), dict(value, schema=1), dict(value, runId='foreign')]:
            with self.subTest(bad=list(bad)), self.assertRaises(m.Incomplete):
                m.validate(m.canonical(bad), binding, lambda _: None)
        bad = copy.deepcopy(value); bad['entries']['READY']['sha256'] = '0' * 64
        with self.assertRaises(m.Incomplete):
            m.validate(m.canonical(bad), binding, lambda _: None)

    def test_success_cannot_hide_missing_samples_or_unknown_cleanup(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'pack', None)), 'Closed integrated envelope is missing')
        binding, receipt, entries, legacy = fixture()
        for change in [dict(status='COMPLETE_WINDOW', windowExpired=True, commandObservedEnd=70.1, missingSlots=[]),
                       dict(observerCleanup='UNKNOWN'), dict(holdRequired=True), dict(rootCause='DISK_SLOW')]:
            value = m.pack(legacy, dict(receipt, **change), entries, binding)
            with self.subTest(change=change), self.assertRaises(m.Incomplete):
                m.validate(m.canonical(value), binding, lambda _: None)

    def test_failed_partial_protocol_is_preserved_as_opaque_bounded_hold_evidence(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'pack', None)), 'Closed integrated envelope is missing')
        binding, receipt, entries, legacy = fixture()
        receipt.update(status='INCOMPLETE', holdRequired=True, observerCleanup='UNKNOWN')
        legacy['safeObservation'].update(status='HOLD', cleanup='UNKNOWN')
        entries.update(SAMPLES=b'MALFORMED_PARTIAL', OBSERVER_STDERR=b'AVAILABLE_FAILURE\n')
        value = m.pack(legacy, receipt, entries, binding)
        parsed = m.validate(m.canonical(value), binding, lambda _: None)
        self.assertEqual(base64.b64decode(parsed['entries']['SAMPLES']['base64']), b'MALFORMED_PARTIAL')
        bad = copy.deepcopy(value); bad['copy']['extra'] = True
        with self.assertRaises(m.Incomplete):
            m.validate(m.canonical(bad), binding, lambda _: None)

    def test_all_entry_caps_fit_existing_envelope_and_overflow_does_not_truncate_json(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'pack', None)), 'Closed integrated envelope is missing')
        binding, receipt, entries, legacy = fixture()
        receipt.update(status='INCOMPLETE', holdRequired=True)
        legacy['safeObservation']['status'] = 'HOLD'
        legacy['entries'] = {str(i): dict(base64=base64.b64encode(b'x' * cap).decode())
                             for i, cap in enumerate((4194304, 262144, 32768, 32768))}
        entries = {key: b'x' * cap for key, cap in m.ENTRY_BOUNDS.items()}
        value = m.pack(legacy, receipt, entries, binding)
        self.assertLessEqual(len(m.canonical(value)), 6291456)
        with self.assertRaises(m.Incomplete):
            m.pack(legacy, receipt, dict(entries, READY=b'x' * 4097), binding)


if __name__ == '__main__':
    unittest.main()

"""Ordering/integrity tests with synthetic bytes and injected retention backend."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest


def load():
    path = Path(__file__).with_name('retained_response.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('retained_response', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Retention(unittest.TestCase):
    def test_malformed_stdout_and_nonempty_stderr_are_retained_before_validator_runs(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'retain', None)), 'Retain-before-validate adapter is missing')
        events = []
        encrypted = []
        # The reversible marker is only an ordering fixture, not encryption proof.
        def protect(raw):
            events.append('protect'); return b'FIXTURE_CIPHER:' + raw[::-1]
        def unprotect(raw):
            events.append('unprotect'); return raw[len(b'FIXTURE_CIPHER:'):][::-1]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic-cipher'
            def persist(raw):
                events.append('persist'); encrypted.append(raw)
                with path.open('xb') as stream:
                    stream.write(raw)
            def validate(raw):
                events.append('validate')
                self.assertTrue(path.exists())
                return json.loads(raw)
            result = m.retain(b'{malformed', b'BOOTSTRAP_STDERR\n', protect, unprotect, persist, validate)
        self.assertEqual(events, ['protect', 'unprotect', 'persist', 'validate'])
        self.assertEqual(m.unframe(encrypted[0][len(b'FIXTURE_CIPHER:'):][::-1])['stdout'], b'{malformed')
        self.assertEqual(m.unframe(encrypted[0][len(b'FIXTURE_CIPHER:'):][::-1])['stderr'], b'BOOTSTRAP_STDERR\n')
        self.assertTrue(result['retained'])
        self.assertEqual(result['responseValidation'], 'HOLD')
        self.assertEqual(result['error']['class'], 'JSONDecodeError')
        self.assertEqual(result['error']['phase'], 'VALIDATE')

    def test_overflow_retains_exact_bounded_prefix_then_refuses_validation(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'retain', None)), 'Retain-before-validate adapter is missing')
        saved = []
        def forbidden(_):
            self.fail('Truncated response reached the validator')
        out, err = b'x' * (6291456 + 1), b'e' * (65536 + 1)
        result = m.retain(out, err, lambda v: v, lambda v: v, saved.append, forbidden)
        decoded = m.unframe(saved[0])
        self.assertEqual(len(decoded['stdout']), 6291456)
        self.assertEqual(len(decoded['stderr']), 65536)
        self.assertEqual(decoded['stdoutTotal'], len(out))
        self.assertTrue(result['stdoutTruncated'] and result['stderrTruncated'])
        self.assertTrue(result['retained'])
        self.assertEqual(result['error']['phase'], 'RECEIVE_BOUNDS')

    def test_failed_roundtrip_or_persistence_never_reaches_validation_or_claims_retention(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'retain', None)), 'Retain-before-validate adapter is missing')
        events = []
        def forbidden(_):
            self.fail('Unretained bytes reached validation')
        result = m.retain(b'{}', b'', lambda v: v, lambda _: b'corrupt', events.append, forbidden)
        self.assertFalse(result['retained']); self.assertEqual(events, [])
        self.assertEqual(result['error']['phase'], 'ROUNDTRIP')
        def persist(_):
            raise OSError(28, 'synthetic storage failure')
        result = m.retain(b'{}', b'', lambda v: v, lambda v: v, persist, forbidden)
        self.assertFalse(result['retained'])
        self.assertEqual(result['error']['class'], 'OSError')
        self.assertEqual(result['error']['errno'], 28)
        self.assertEqual(result['error']['phase'], 'PERSIST')

    def test_stderr_integrity_empty_response_and_framing_are_not_silently_accepted(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'retain', None)), 'Retain-before-validate adapter is missing')
        saved = []
        result = m.retain(b'', b'failure', lambda v: v, lambda v: v, saved.append, lambda _: self.fail('Empty response validated'))
        self.assertTrue(result['retained'])
        self.assertEqual(result['responseValidation'], 'HOLD')
        with self.assertRaises(m.Incomplete):
            m.unframe(saved[0][:-1])
        with self.assertRaises(m.Incomplete):
            m.unframe(saved[0] + b'extra')


if __name__ == '__main__':
    unittest.main()

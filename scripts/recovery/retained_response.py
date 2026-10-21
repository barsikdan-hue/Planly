"""Retain received raw prefixes before parsing. No crypto/transport dispatch.

The caller provides a reviewed CurrentUser DPAPI backend and exclusive durable
ciphertext persistence. Identity transforms in tests prove ordering only. No
plaintext file, key, grant, retry or SSH operation is created by this module.
"""
import hashlib
import json
import struct

from copy_observation import Incomplete

STDOUT_BOUND = 6291456
STDERR_BOUND = 65536
HEADER = struct.Struct('>8sQQII')
MAGIC = b'LCO1RAW\0'


def unframe(raw):
    if type(raw) is not bytes or not HEADER.size <= len(raw) <= HEADER.size + STDOUT_BOUND + STDERR_BOUND:
        raise Incomplete('RETAINED_RAW_FRAME_BOUND')
    magic, out_total, err_total, out_length, err_length = HEADER.unpack_from(raw)
    if (magic != MAGIC or out_length != min(out_total, STDOUT_BOUND) or err_length != min(err_total, STDERR_BOUND)
            or HEADER.size + out_length + err_length != len(raw)):
        raise Incomplete('RETAINED_RAW_FRAME_INTEGRITY')
    split = HEADER.size + out_length
    return dict(stdout=raw[HEADER.size:split], stderr=raw[split:], stdoutTotal=out_total, stderrTotal=err_total)


def _error(error, phase):
    known = (OSError, FileNotFoundError, FileExistsError, PermissionError, ValueError, TypeError, KeyError,
             json.JSONDecodeError, UnicodeDecodeError)
    value = {'class': type(error).__name__ if type(error) in known else 'Incomplete' if type(error) is Incomplete else 'UNKNOWN',
             'phase': phase}
    if isinstance(error, OSError) and type(error.errno) is int and 0 <= error.errno <= 65535:
        value['errno'] = error.errno
    if type(error) is Incomplete and error.args and error.args[0] in {
            'RECEIVED_STDOUT_BOUND', 'RECEIVED_STDERR_BOUND', 'RECEIVED_STDOUT_EMPTY',
            'CIPHERTEXT_BOUND', 'CIPHERTEXT_ROUNDTRIP'}:
        value['code'] = error.args[0]
    return value


def retain(stdout, stderr, protect, unprotect, persist, validate):
    """Return a safe receipt. Cipher persistence precedes ALL reply validation.

    Already received over-bound/empty/malformed replies keep exact bounded raw
    prefixes of BOTH streams. Truncation never reaches semantic validation.
    Caller holds received bytes in RAM if encryption/persistence itself fails;
    this receipt never upgrades that to successful off-process retention.
    """
    receipt = dict(status='HOLD', retained=False, responseValidation='HOLD')
    phase = 'INPUT'
    try:
        if type(stdout) is not bytes or type(stderr) is not bytes or not all(callable(v) for v in (protect, unprotect, persist, validate)):
            raise Incomplete('NATIVE_RECEIVED_BYTES_AND_BACKEND_REQUIRED')
        out, err = stdout[:STDOUT_BOUND], stderr[:STDERR_BOUND]
        receipt.update(stdoutBytes=len(stdout), stderrBytes=len(stderr),
                       stdoutRetainedBytes=len(out), stderrRetainedBytes=len(err),
                       stdoutTruncated=len(stdout) != len(out), stderrTruncated=len(stderr) != len(err),
                       stdoutPrefixSha256=hashlib.sha256(out).hexdigest(), stderrPrefixSha256=hashlib.sha256(err).hexdigest())
        raw = HEADER.pack(MAGIC, len(stdout), len(stderr), len(out), len(err)) + out + err
        phase = 'PROTECT'
        ciphertext = protect(raw)
        if type(ciphertext) is not bytes or not 0 < len(ciphertext) <= len(raw) + 65536:
            raise Incomplete('CIPHERTEXT_BOUND')
        phase = 'ROUNDTRIP'
        if unprotect(ciphertext) != raw:
            raise Incomplete('CIPHERTEXT_ROUNDTRIP')
        phase = 'PERSIST'
        receipt['cipherPersistenceAttempted'] = True
        persist(ciphertext)
        receipt.update(retained=True, ciphertextBytes=len(ciphertext), ciphertextSha256=hashlib.sha256(ciphertext).hexdigest())
        phase = 'RECEIVE_BOUNDS'
        if len(stdout) > STDOUT_BOUND:
            raise Incomplete('RECEIVED_STDOUT_BOUND')
        if len(stderr) > STDERR_BOUND:
            raise Incomplete('RECEIVED_STDERR_BOUND')
        if not stdout:
            raise Incomplete('RECEIVED_STDOUT_EMPTY')
        phase = 'VALIDATE'
        validate(stdout)
        receipt['responseValidation'] = 'VALID'
        receipt['status'] = 'SEALED' if not stderr else 'HOLD'
    except BaseException as error:
        receipt['error'] = _error(error, phase)
    return receipt

"""Closed copy envelope around an independently validated frozen legacy reply.

Import is inert. This verifies serialization/provenance/coverage, not permission
or runtime truth. Failed bounded packets remain opaque HOLD evidence; they are
never promoted to observations or parsed before off-VM encrypted retention.
"""
import base64
import hashlib
import json
import math
import re

from copy_observation import Incomplete, compare
from node_observation import NodeObservation
from resource_observation import IO_KEYS, BLOCK_KEYS

ENTRY_BOUNDS = dict(READY=4096, SAMPLES=32768, OBSERVER_STDERR=65536, PROBE_STDOUT=4096, PROBE_STDERR=65536)
BINDING_KEYS = {'scope', 'runId', 'authorizationId', 'grantSha256', 'copyCapsSha256', 'diagnosticSourcesSha256'}
COPY_KEYS = {'status', 'rootCause', 'probeStatus', 'probeCleanup', 'observerCleanup', 'commandCleanup', 'profileStatus',
             'requestStart', 'requestDeadline', 'commandObservedEnd', 'windowExpired', 'missingSlots', 'lateSlots',
             'afterCommandSlots', 'holdRequired', 'daemonPid', 'daemonStart', 'failures', 'failuresTruncated'}


def need(value, code):
    if not value:
        raise Incomplete(code)


def canonical(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii') + b'\n'
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise Incomplete('CANONICAL_ENVELOPE_REQUIRED') from error


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _pairs(rows):
    value = {}
    for key, item in rows:
        need(key not in value, 'DUPLICATE_ENVELOPE_KEY')
        value[key] = item
    return value


def parsed(raw):
    try:
        return json.loads(raw, object_pairs_hook=_pairs)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise Incomplete('ENVELOPE_JSON_REQUIRED') from error


def uint(value):
    return type(value) is int and 0 <= value <= 18446744073709551615


def instant(value):
    return type(value) in (int, float) and 0 <= value <= 1e12 and math.isfinite(value)


def binding_check(value):
    need(type(value) is dict and set(value) == BINDING_KEYS, 'CLOSED_ENVELOPE_BINDING')
    need(type(value['scope']) is str and re.fullmatch('[A-Z0-9_]{1,128}', value['scope']), 'ENVELOPE_SCOPE')
    uuid = r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
    need(all(type(value[key]) is str and re.fullmatch(uuid, value[key]) for key in ('runId', 'authorizationId'))
         and value['runId'] != value['authorizationId'], 'ENVELOPE_RUN_BINDING')
    need(all(type(value[key]) is str and re.fullmatch('[a-f0-9]{64}', value[key])
             for key in ('grantSha256', 'copyCapsSha256', 'diagnosticSourcesSha256')), 'ENVELOPE_SOURCE_PINS')


def pack(legacy, receipt, entries, binding):
    binding_check(binding)
    need(type(entries) is dict and set(entries) == set(ENTRY_BOUNDS), 'EXACT_COPY_ENTRIES')
    rows = {}
    for key, bound in ENTRY_BOUNDS.items():
        raw = entries[key]
        need(type(raw) is bytes and len(raw) <= bound, 'COPY_ENTRY_BOUND')
        rows[key] = dict(bytes=len(raw), sha256=sha(raw), base64=base64.b64encode(raw).decode('ascii'))
    value = dict(binding, schema=3, legacy=legacy, copy=receipt, entries=rows)
    need(len(canonical(value)) <= 6291456, 'COPY_ENVELOPE_BOUND')
    return value


def _decoded(value):
    need(type(value) is dict and set(value) == set(ENTRY_BOUNDS), 'EXACT_COPY_ENTRIES')
    result = {}
    for key, bound in ENTRY_BOUNDS.items():
        row = value[key]
        need(type(row) is dict and set(row) == {'bytes', 'sha256', 'base64'} and type(row['bytes']) is int
             and 0 <= row['bytes'] <= bound and type(row['base64']) is str
             and len(row['base64']) == 4 * ((row['bytes'] + 2) // 3), 'CLOSED_COPY_ENTRY')
        try:
            raw = base64.b64decode(row['base64'], validate=True)
        except ValueError as error:
            raise Incomplete('COPY_ENTRY_ENCODING') from error
        need(len(raw) == row['bytes'] and sha(raw) == row['sha256']
             and base64.b64encode(raw).decode('ascii') == row['base64'], 'COPY_ENTRY_INTEGRITY')
        result[key] = raw
    return result


def _counts(value):
    keys = {'complete', 'entries', 'directories', 'regularFiles', 'symlinks', 'otherEntries', 'logicalRegularBytes', 'entryAllocatedBytes'}
    need(type(value) is dict and set(value) == keys and value['complete'] is True
         and all(uint(value[key]) for key in keys - {'complete'}), 'COMPLETE_SOURCE_WORKLOAD')
    need(value['entries'] <= 2000000 and value['directories'] > 0
         and value['directories'] - 1 + value['regularFiles'] + value['symlinks'] + value['otherEntries'] == value['entries'], 'SOURCE_WORKLOAD_COUNTS')


def _channel(value, keys, *, boolean=None):
    need(type(value) is dict, 'CLOSED_RESOURCE_CHANNEL')
    if value.get('status') == 'NOT_REQUESTED':
        need(set(value) == {'status'}, 'CLOSED_RESOURCE_CHANNEL')
    elif value.get('status') == 'UNAVAILABLE':
        need(set(value) == {'status', 'code'} and value['code'] in {'FORMAT_OR_BOUND', 'NOT_PRESENT', 'ACCESS_DENIED', 'IO_ERROR', 'NO_BLOCK_DEVICE'}, 'CLOSED_UNAVAILABLE_CHANNEL')
    else:
        need(set(value) == {'status', 'values'} and value['status'] == 'OBSERVED'
             and type(value['values']) is dict and set(value['values']) == set(keys), 'CLOSED_OBSERVED_CHANNEL')
        need(all(type(item) is bool if key == boolean else uint(item) for key, item in value['values'].items()), 'RESOURCE_COUNTER_RANGE')


def _metrics(value, begin, end):
    need(type(value) is dict and set(value) == {'start', 'end', 'process', 'io', 'scheduler', 'filesystem', 'device'}, 'CLOSED_RESOURCE_SAMPLE')
    need(instant(value['start']) and instant(value['end']) and begin <= value['start'] <= value['end'] <= end, 'RESOURCE_SAMPLE_WINDOW')
    _channel(value['process'], ('id', 'start', 'userTicks', 'systemTicks', 'minorFaults', 'majorFaults', 'rssPages'))
    need(value['process']['status'] == 'OBSERVED', 'OBSERVED_PROCESS_REQUIRED')
    _channel(value['io'], IO_KEYS)
    _channel(value['scheduler'], ('cpuNanoseconds', 'runqueueNanoseconds', 'timeslices'))
    _channel(value['filesystem'], ('availableBytes', 'freeBytes', 'availableInodes', 'totalInodes', 'inodeAccounting', 'major', 'minor'), boolean='inodeAccounting')
    _channel(value['device'], BLOCK_KEYS)


def _file(value, keys):
    need(type(value) is dict and set(value) == set(keys) and all(uint(item) for item in value.values()), 'CLOSED_FILE_METADATA')


def _sample(value, index, receipt, run_id, baselines):
    need(type(value) is dict and set(value) == {'kind', 'runId', 'index', 'start', 'end', 'copy', 'task', 'metrics', 'rootCause'}
         and value['kind'] == 'SAMPLE' and value['runId'] == run_id and type(value['index']) is int
         and value['index'] == index and value['rootCause'] == 'NOT_PROVEN', 'CLOSED_COPY_SAMPLE')
    begin, end = value['start'], value['end']
    need(instant(begin) and instant(end) and receipt['requestStart'] <= begin <= end <= receipt['requestDeadline'], 'COPY_SAMPLE_WINDOW')
    _metrics(value['metrics'], begin, end)
    proc = value['metrics']['process']['values']
    need((proc['id'], proc['start']) == (receipt['daemonPid'], receipt['daemonStart']), 'SAMPLE_DAEMON_BINDING')
    if value['task'] != {'status': 'NOT_OBSERVED'}:
        _metrics(value['task'], begin, end)
    copy = value['copy']
    need(type(copy) is dict, 'CLOSED_COPY_PAIR')
    if copy == {'status': 'NOT_OBSERVED'}:
        return
    status = copy.get('status')
    need(status in {'PINNED_BASELINE', 'RETAINED_PAIR_METADATA'}, 'CLOSED_PAIR_STATUS')
    keys = {'status', 'pairIndex', 'binding', 'observation', 'targetContinuity'} | ({'comparison'} if status == 'RETAINED_PAIR_METADATA' else set())
    need(set(copy) == keys and type(copy['pairIndex']) is int and 1 <= copy['pairIndex'] <= 7
         and copy['targetContinuity'] == 'NOT_ESTABLISHED', 'CLOSED_COPY_PAIR')
    binding, observation = copy['binding'], copy['observation']
    need(type(binding) is dict and set(binding) == {'phase', 'alias', 'source', 'destination'}
         and binding['phase'] in {'NATIVE_TO_INIT', 'NATIVE_TO_RW', 'INIT_TO_RW'}
         and type(binding['alias']) is str and re.fullmatch('[a-f0-9]{64}', binding['alias']), 'CLOSED_PAIR_BINDING')
    need(type(observation) is dict and set(observation) == {'start', 'end', 'pid', 'processStart', 'source', 'destination'}
         and (observation['pid'], observation['processStart']) == (receipt['daemonPid'], receipt['daemonStart'])
         and instant(observation['start']) and instant(observation['end']) and begin <= observation['start'] <= observation['end'] <= end, 'CLOSED_PINNED_OBSERVATION')
    for role in ('source', 'destination'):
        _file(binding[role], ('device', 'inode', 'size'))
        _file(observation[role], ('device', 'inode', 'position', 'size'))
        need(all(binding[role][key] == observation[role][key] for key in ('device', 'inode')), 'PINNED_FILE_BINDING')
    pair = copy['pairIndex']
    if status == 'PINNED_BASELINE':
        need(pair not in baselines and pair == len(baselines) + 1, 'ONE_BASELINE_PER_PIN')
        baselines[pair] = copy
    else:
        need(pair in baselines and binding == baselines[pair]['binding'], 'RETAINED_BASELINE_BINDING')
        expected = compare(baselines[pair]['observation'], observation, receipt['requestStart'], receipt['requestDeadline'])
        need(copy['comparison'] == expected, 'RETAINED_COMPARISON_BINDING')


def _receipt(value, entries, binding, legacy):
    need(type(value) is dict and set(value) == COPY_KEYS and value['rootCause'] == 'NOT_PROVEN', 'CLOSED_COPY_RECEIPT')
    need(value['status'] in {'NOT_REACHED', 'NOT_OBSERVED', 'OBSERVED_UNTIL_COMMAND_END', 'COMPLETE_WINDOW', 'INCOMPLETE'}
         and value['probeStatus'] in {'NOT_REACHED', 'CAPABILITY_OBSERVED', 'INCOMPLETE'}
         and all(value[key] in {'NOT_STARTED', 'PASS', 'UNKNOWN'} for key in ('probeCleanup', 'observerCleanup', 'commandCleanup'))
         and value['profileStatus'] in {'NOT_REACHED', 'SKIPPED_FAST', 'COMPLETE', 'INCOMPLETE'}
         and type(value['windowExpired']) is bool and type(value['holdRequired']) is bool, 'COPY_RECEIPT_STATE')
    for key in ('missingSlots', 'lateSlots', 'afterCommandSlots'):
        row = value[key]
        need(type(row) is list and len(row) <= 7 and all(type(item) is int and 1 <= item <= 7 for item in row)
             and row == sorted(set(row)), 'COPY_RECEIPT_SLOT_BOUND')
    need(type(value['failures']) is list and len(value['failures']) <= 8 and type(value['failuresTruncated']) is bool
         and (not value['failures'] and not value['failuresTruncated'] or value['holdRequired']), 'CLOSED_COPY_FAILURES')
    for row in value['failures']:
        need(type(row) is dict and set(row) in ({'class', 'code', 'phase'}, {'class', 'code', 'phase', 'errno'})
             and row['class'] in {'Incomplete', 'Hold', 'OSError', 'PermissionError', 'FileNotFoundError', 'FileExistsError',
                                  'ProcessLookupError', 'TimeoutError', 'TimeoutExpired', 'ValueError', 'TypeError', 'KeyError', 'SyntaxError', 'MemoryError', 'UNKNOWN'}
             and row['phase'] in {'PROBE', 'PREPARE', 'PROFILE', 'NODE', 'CLEANUP', 'PRESERVATION'}
             and type(row['code']) is str and re.fullmatch('[A-Z0-9_]{1,100}', row['code']), 'CLOSED_COPY_FAILURE')
        if 'errno' in row:
            need(type(row['errno']) is int and 0 <= row['errno'] <= 65535, 'COPY_FAILURE_ERRNO')
    need(type(legacy) is dict and type(legacy.get('safeObservation')) is dict, 'LEGACY_REPLY_REQUIRED')
    result = legacy['safeObservation']
    need(result.get('status') in {'HOLD', 'A1_ISOLATED_RESTORE_PASS'}, 'LEGACY_TERMINAL_STATE')
    unknown = any(value[key] == 'UNKNOWN' for key in ('probeCleanup', 'observerCleanup', 'commandCleanup'))
    need(not unknown or (value['holdRequired'] and result.get('status') == 'HOLD' and result.get('cleanup') in {'UNKNOWN', 'HOLD'}), 'OBSERVER_UNKNOWN_CLEANUP_BINDING')
    need(not value['holdRequired'] or result['status'] == 'HOLD', 'COPY_HOLD_BINDING')
    if result['status'] == 'A1_ISOLATED_RESTORE_PASS':
        need(value['probeStatus'] == 'CAPABILITY_OBSERVED' and all(value[key] == 'PASS' for key in ('probeCleanup', 'observerCleanup', 'commandCleanup'))
             and value['status'] in {'NOT_OBSERVED', 'OBSERVED_UNTIL_COMMAND_END', 'COMPLETE_WINDOW'}
             and value['profileStatus'] in {'SKIPPED_FAST', 'COMPLETE'}, 'COPY_ACCEPTANCE_BINDING')
    if value['status'] in {'INCOMPLETE', 'NOT_REACHED'}:
        need(result['status'] == 'HOLD' and (value['status'] != 'INCOMPLETE' or value['holdRequired']), 'INCOMPLETE_COPY_HOLD')
        return  # opaque bounded failure prefixes were integrity-checked already
    need(all(instant(value[key]) for key in ('requestStart', 'requestDeadline', 'commandObservedEnd'))
         and value['requestStart'] < value['requestDeadline'] <= value['requestStart'] + 60
         and value['commandObservedEnd'] >= value['requestStart']
         and all(uint(value[key]) and value[key] > 0 for key in ('daemonPid', 'daemonStart')), 'COPY_WINDOW_IDENTITY')
    need(not entries['OBSERVER_STDERR'] and not entries['PROBE_STDERR'], 'COPY_UNEXPECTED_STDERR')
    probe = parsed(entries['PROBE_STDOUT'])
    need(probe == {'status': 'CAPABILITY_OBSERVED', 'fileDataReads': 0, 'duplicateAttempts': 1}, 'OWNED_PROBE_BINDING')
    ready = parsed(entries['READY'])
    need(type(ready) is dict and set(ready) == {'kind', 'runId', 'workload', 'rootCause'} and ready['kind'] == 'READY'
         and ready['runId'] == binding['runId'] and ready['rootCause'] == 'NOT_PROVEN', 'CLOSED_READY_FRAME')
    _counts(ready['workload'])
    lines = entries['SAMPLES'].splitlines(keepends=True)
    need(len(lines) <= 7, 'COPY_FRAME_COUNT')
    rows, baselines = [], {}
    for index, raw in enumerate(lines, 1):
        need(raw.endswith(b'\n') and len(raw) <= 4096, 'COPY_FRAME_BOUND')
        row = parsed(raw)
        _sample(row, index, value, binding['runId'], baselines)
        rows.append(row)
    state = NodeObservation(None, binding['runId'])
    state.request_start, state.request_deadline = value['requestStart'], value['requestDeadline']
    state.command_observed_end, state.window_expired = value['commandObservedEnd'], value['windowExpired']
    state.completeness(rows)
    need(state.observation_status == value['status'] and state.missing_slots == value['missingSlots']
         and state.late_slots == value['lateSlots'] and state.after_command_slots == value['afterCommandSlots']
         and (not state.hold_required or value['holdRequired']), 'COPY_COVERAGE_BINDING')


def validate(raw, binding, validate_legacy):
    binding_check(binding)
    need(type(raw) is bytes and 0 < len(raw) <= 6291456 and callable(validate_legacy), 'COPY_ENVELOPE_BOUND')
    value = parsed(raw)
    need(type(value) is dict and set(value) == BINDING_KEYS | {'schema', 'legacy', 'copy', 'entries'}
         and type(value['schema']) is int and value['schema'] == 3
         and all(type(value[key]) is type(expected) and value[key] == expected for key, expected in binding.items()), 'CLOSED_COPY_ENVELOPE')
    entries = _decoded(value['entries'])
    validate_legacy(canonical(value['legacy']))
    _receipt(value['copy'], entries, binding, value['legacy'])
    return value

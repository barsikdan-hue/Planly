"""One retained Python observer child and bounded, nonblocking private IPC.

The caller supplies reviewed code and separate authorization. This has no
dispatch entry point, daemon discovery, network or file-data access. Logical
pipe deadlines cannot guarantee real-time scheduling or kill a D-state task.
Unknown cleanup is reported instead of adopting/signalling another process.
"""
import math
import os
import select
import signal
import subprocess
import sys
import time

from copy_observation import Incomplete
from fd_pin import _target


class OwnedWorker:
    def __init__(self, code):
        if type(code) is not str or not code or len(code.encode('utf8')) > 65536:
            raise Incomplete('BOUNDED_OBSERVER_CODE_REQUIRED')
        if sys.platform != 'linux' or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
            raise Incomplete('LINUX_OWNED_CHILD_SUPPORT_REQUIRED')
        compile(code, '<owned-observer>', 'exec')
        self.process, self.pidfd = None, None
        self.stdout, self.stderr, self.cursor = b'', b'', 0
        self.stdout_total, self.stderr_total = 0, 0
        self.readers, self.signals = [], []
        self.closed, self.cleanup, self.stream_error = False, None, None
        try:
            self.process = subprocess.Popen([sys.executable, '-I', '-B', '-u', '-c', code],
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                            env={'LANG': 'C', 'PYTHONDONTWRITEBYTECODE': '1'},
                                            close_fds=True, start_new_session=True)
            self.pidfd = os.pidfd_open(self.process.pid)
            if _target(self.pidfd) != self.process.pid:
                raise Incomplete('OWNED_OBSERVER_PIDFD_MISMATCH')
            for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                os.set_blocking(stream.fileno(), False)
            self.readers = [self.process.stdout, self.process.stderr]
        except BaseException as error:
            # Only the unreaped Popen child just created here is eligible for
            # startup cleanup when acquiring its pidfd itself failed.
            if self.process is not None:
                try:
                    if self.process.poll() is None:
                        self.process.kill()
                    self.process.wait(timeout=1)
                except BaseException:
                    error._owned_observer_cleanup_unknown = True
                for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                    if stream is not None:
                        stream.close()
            if self.pidfd is not None:
                os.close(self.pidfd)
            raise

    def _remaining(self, deadline):
        if type(deadline) not in (int, float) or not math.isfinite(deadline):
            raise Incomplete('OBSERVER_ABSOLUTE_DEADLINE_REQUIRED')
        remaining = deadline - time.monotonic()
        if self.closed or not 0 < remaining <= 60:
            raise Incomplete('OBSERVER_DEADLINE')
        return remaining

    def _take(self, stream):
        try:
            raw = os.read(stream.fileno(), 16384)
        except BlockingIOError:
            return
        if not raw:
            self.readers.remove(stream)
            return
        if stream is self.process.stdout:
            self.stdout_total += len(raw)
            self.stdout = (self.stdout + raw)[:262144]
            over = self.stdout_total > 262144
        else:
            self.stderr_total += len(raw)
            self.stderr = (self.stderr + raw)[:65536]
            over = self.stderr_total > 65536
        if over:
            self.stream_error = self.stream_error or 'OBSERVER_STREAM_BOUND'
            raise Incomplete(self.stream_error)

    def _wait(self, deadline, writing=False):
        if self.stream_error:
            raise Incomplete(self.stream_error)
        ready, writable, _ = select.select(self.readers, [self.process.stdin] if writing else [], [], self._remaining(deadline))
        for stream in ready:
            self._take(stream)
        return bool(writable)

    def read_line(self, deadline):
        while True:
            self._remaining(deadline)
            if self.stream_error:
                raise Incomplete(self.stream_error)
            pending = self.stdout[self.cursor:]
            newline = pending.find(b'\n')
            if len(pending) > 16384 and (newline < 0 or newline + 1 > 16384):
                self.stream_error = 'OBSERVER_LINE_BOUND'
                raise Incomplete(self.stream_error)
            if newline >= 0:
                self.cursor += newline + 1
                return pending[:newline + 1]
            if self.process.stdout not in self.readers:
                raise Incomplete('OBSERVER_INCOMPLETE_LINE' if pending else 'OBSERVER_EOF')
            self._wait(deadline)

    def send(self, message, deadline):
        if (type(message) is not bytes or not 0 < len(message) <= 16384
                or not message.endswith(b'\n') or b'\n' in message[:-1]):
            raise Incomplete('BOUNDED_OBSERVER_MESSAGE_REQUIRED')
        offset = 0
        while offset < len(message):
            self._remaining(deadline)
            try:
                count = os.write(self.process.stdin.fileno(), message[offset:])
                if count <= 0:
                    raise Incomplete('OBSERVER_INPUT_CLOSED')
                offset += count
            except BlockingIOError:
                self._wait(deadline, writing=True)

    def close(self, grace=1):
        if self.closed:
            return self.cleanup
        if type(grace) not in (int, float) or not math.isfinite(grace) or not 0 < grace <= 1:
            raise Incomplete('BOUNDED_OBSERVER_CLEANUP_REQUIRED')
        self.cleanup = 'UNKNOWN'
        try:
            self.process.stdin.close()
            for name, number in (('TERM', signal.SIGTERM), ('KILL', signal.SIGKILL)):
                if self.process.poll() is not None:
                    break
                if _target(self.pidfd) != self.process.pid:
                    raise Incomplete('OWNED_OBSERVER_IDENTITY_UNCERTAIN')
                try:
                    signal.pidfd_send_signal(self.pidfd, number)
                    self.signals.append(name)
                except ProcessLookupError:
                    pass
                try:
                    self.process.wait(timeout=grace)
                    break
                except subprocess.TimeoutExpired:
                    pass
            if self.process.poll() is not None:
                self.cleanup = 'PASS'
            # A bounded prefix of available failed output survives termination.
            for _ in range(32):
                ready, _, _ = select.select(self.readers, [], [], 0)
                if not ready:
                    break
                for stream in ready:
                    try:
                        self._take(stream)
                    except Incomplete:
                        pass  # the bound code and retained prefix are already stored
        except (OSError, Incomplete):
            self.cleanup = 'UNKNOWN'
        finally:
            self.closed = True
            for stream in (self.process.stdout, self.process.stderr):
                stream.close()
            os.close(self.pidfd)
        return self.cleanup

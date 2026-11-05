// Test-runner preload only; production code never imports this file.
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  const options = first && typeof first === 'object' ? first : { port:first, host:typeof values[1] === 'string' ? values[1] : 'localhost' };
  const host = options.host ?? 'localhost';
  const localSocket = typeof options.path === 'string' && options.path.startsWith('/');
  if (!localSocket && !['127.0.0.1','::1','localhost'].includes(host)) {
    const error = new Error('Non-loopback network blocked by VK isolated test runner');
    error.code = 'VK_AUDIT_NETWORK_BLOCKED';
    throw error;
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();

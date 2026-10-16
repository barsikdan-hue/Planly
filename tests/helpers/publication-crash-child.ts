import { processPublication } from '../../lib/server/scheduler/processor.ts';

// Dedicated child intentionally exits without stack unwinding after a durable claim.
// A fake connector is always injected; no provider HTTP may leave this process.
globalThis.fetch = async () => { throw new Error('Provider HTTP forbidden in crash characterization'); };
const [publicationId, boundary] = process.argv.slice(2);
await processPublication(publicationId, () => {
  // Do not throw: that would exercise processor catch instead of process loss.
  if (boundary === 'before-handoff') process.exit(70);
  return { provider: 'TELEGRAM', async publish() {
    if (!process.send) throw new Error('Crash child requires IPC');
    await new Promise<void>((resolve, reject) => process.send!({ boundary, fakeSends: 1 }, error => error ? reject(error) : resolve()));
    process.exit(70); // Simulated acceptance with no receipt returned to processor.
  } };
});
throw new Error('Expected crash boundary was not reached');

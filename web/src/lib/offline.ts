import { post, ApiError } from './api';

/**
 * Device-level resilience.
 *
 * If a tablet or a guest phone loses the LAN mid-tap, the action is written to
 * localStorage and replayed the moment the connection returns. Every queued
 * call carries a clientOpId, so a replay that the server already saw is
 * recognised as a duplicate rather than ringing twice.
 */
export interface QueuedAction {
  id: string;
  path: string;
  body: Record<string, unknown>;
  asGuest: boolean;
  queuedAt: number;
  attempts: number;
  label: string;
}

const KEY = 'le.outbox';
const listeners = new Set<(queue: QueuedAction[]) => void>();

function read(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedAction[];
  } catch {
    return [];
  }
}

function write(queue: QueuedAction[]) {
  localStorage.setItem(KEY, JSON.stringify(queue));
  listeners.forEach((fn) => fn(queue));
}

export const outbox = {
  all: read,
  subscribe(fn: (queue: QueuedAction[]) => void) {
    listeners.add(fn);
    fn(read());
    return () => {
      listeners.delete(fn);
    };
  },
  clear: () => write([]),
};

export const newOpId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Sends now if possible, otherwise queues. Resolves with the server response,
 * or null when the action has been parked for later.
 */
export async function sendOrQueue<T>(
  path: string,
  body: Record<string, unknown>,
  { asGuest = false, label = 'Your request' } = {}
): Promise<T | null> {
  const withOpId = { clientOpId: newOpId(), ...body };
  try {
    return await post<T>(path, withOpId, asGuest);
  } catch (err) {
    // A 4xx is a real refusal from the server — queueing it would only repeat
    // the same rejection. Only transport failures and 5xx are worth retrying.
    const retryable = !(err instanceof ApiError) || err.status >= 500;
    if (!retryable) throw err;

    write([
      ...read(),
      {
        id: withOpId.clientOpId as string,
        path,
        body: withOpId,
        asGuest,
        queuedAt: Date.now(),
        attempts: 0,
        label,
      },
    ]);
    return null;
  }
}

let flushing = false;

/** Replays the outbox in order. Safe to call as often as you like. */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  const queue = read();
  if (!queue.length) return 0;

  flushing = true;
  let sent = 0;
  try {
    for (const action of queue) {
      try {
        await post(action.path, action.body, action.asGuest);
        sent++;
        write(read().filter((a) => a.id !== action.id));
      } catch (err) {
        if (err instanceof ApiError && err.status < 500) {
          // The server has judged it and said no; drop it rather than loop.
          write(read().filter((a) => a.id !== action.id));
          continue;
        }
        // Still offline — stop and try again on the next reconnect.
        write(read().map((a) => (a.id === action.id ? { ...a, attempts: a.attempts + 1 } : a)));
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

/** Flush whenever the browser or the socket says we are back. */
export function watchConnectivity(onFlush?: (count: number) => void) {
  const run = () => {
    void flushOutbox().then((n) => {
      if (n > 0) onFlush?.(n);
    });
  };
  window.addEventListener('online', run);
  const timer = window.setInterval(run, 15000);
  run();
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(timer);
  };
}

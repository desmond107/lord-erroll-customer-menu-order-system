import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { staffToken, tableToken } from './api';

/**
 * One socket per device, and it is rebuilt whenever the identity on it changes
 * — a waiter signing in, or a guest scanning a different table.
 *
 * Subscriptions deliberately live here rather than on the socket object.
 * Components register against this module, and a replacement socket inherits
 * every listener; otherwise a sign-in would silently orphan every screen that
 * had already subscribed, and the board would go quiet with no visible error.
 */

let socket: Socket | null = null;
let currentKey = '';
let connected = false;

const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
const connectionListeners = new Set<(connected: boolean) => void>();

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  connectionListeners.forEach((fn) => fn(next));
}

function identityKey() {
  return `${staffToken.get() ?? ''}|${tableToken.get() ?? ''}`;
}

function build(): Socket {
  const next = io('/', {
    auth: { staffToken: staffToken.get(), tableToken: tableToken.get() },
    transports: ['websocket', 'polling'],
    // A tablet that walks out of range of one access point should be back on
    // the board in seconds, not on the next page refresh.
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 8000,
  });

  next.on('connect', () => setConnected(true));
  next.on('disconnect', () => setConnected(false));
  next.on('connect_error', () => setConnected(false));

  // One dispatcher, so listeners belong to this module and not to the socket.
  next.onAny((event: string, payload: unknown) => {
    eventHandlers.get(event)?.forEach((fn) => fn(payload));
  });

  return next;
}

export function getSocket(): Socket {
  const key = identityKey();
  if (socket && currentKey === key) return socket;

  socket?.removeAllListeners();
  socket?.disconnect();
  setConnected(false);
  currentKey = key;
  socket = build();
  return socket;
}

/** Call after signing in or out, or after a guest scans a table card. */
export function resetSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  currentKey = '';
  setConnected(false);
  // Rebuild straight away so no screen has to wait for its next render.
  getSocket();
}

/** Subscribe to a server event for the lifetime of a component. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  // Callers pass inline closures. Routing through a ref keeps the registry
  // stable across renders while still calling the newest closure, so a handler
  // never fires against stale state.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    getSocket();
    const fn = (payload: unknown) => latest.current(payload as T);
    const set = eventHandlers.get(event) ?? new Set();
    set.add(fn);
    eventHandlers.set(event, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) eventHandlers.delete(event);
    };
  }, [event]);
}

/** Live LAN connection state, for the offline banner. */
export function useConnection() {
  const [isConnected, setIsConnected] = useState(connected);

  useEffect(() => {
    getSocket();
    connectionListeners.add(setIsConnected);
    setIsConnected(connected);
    return () => {
      connectionListeners.delete(setIsConnected);
    };
  }, []);

  return isConnected;
}

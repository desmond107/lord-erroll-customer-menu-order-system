/** Thin fetch wrapper. Everything speaks to the on-premise server on the LAN. */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TABLE_TOKEN_KEY = 'le.tableToken';
const STAFF_TOKEN_KEY = 'le.staffToken';

export const tableToken = {
  get: () => localStorage.getItem(TABLE_TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TABLE_TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TABLE_TOKEN_KEY),
};

export const staffToken = {
  get: () => localStorage.getItem(STAFF_TOKEN_KEY),
  set: (t: string) => localStorage.setItem(STAFF_TOKEN_KEY, t),
  clear: () => localStorage.removeItem(STAFF_TOKEN_KEY),
};

interface Options extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Send the current table's QR token, for guest endpoints. */
  asGuest?: boolean;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, asGuest, headers, ...rest } = options;
  const h = new Headers(headers);
  if (body !== undefined) h.set('content-type', 'application/json');

  if (asGuest) {
    const t = tableToken.get();
    if (t) h.set('x-table-token', t);
  } else {
    const t = staffToken.get();
    if (t) h.set('authorization', `Bearer ${t}`);
  }

  const res = await fetch(path.startsWith('/') ? path : `/api/${path}`, {
    ...rest,
    headers: h,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && (payload as { error?: string }).error) || 'The server could not be reached.';
    throw new ApiError(message, res.status);
  }
  return payload as T;
}

export const get = <T>(path: string, asGuest = false) => api<T>(path, { asGuest });
export const post = <T>(path: string, body?: unknown, asGuest = false) =>
  api<T>(path, { method: 'POST', body, asGuest });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

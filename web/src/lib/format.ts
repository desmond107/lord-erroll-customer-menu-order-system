/** Prices always read as menu prices: no decimals unless the cents matter. */
export function money(value: number | null | undefined, currency = 'KES'): string {
  if (value === null || value === undefined) return '—';
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return `${currency} ${value.toLocaleString('en-KE', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export const usd = (kes: number, rate: number) =>
  `USD ${Math.round(kes / (rate || 129)).toLocaleString('en-US')}`;

/** SQLite stores "YYYY-MM-DD HH:MM:SS" in local time; treat it as such. */
export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function minutesSince(value: string | null | undefined, now = Date.now()): number | null {
  const ms = parseTime(value);
  return ms === null ? null : Math.max(0, Math.floor((now - ms) / 60000));
}

export function elapsed(value: string | null | undefined, now = Date.now()): string {
  const ms = parseTime(value);
  if (ms === null) return '—';
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Colour band for order age — the fine-dining pace guard. */
export function ageClass(value: string | null | undefined, amber = 10, red = 20, now = Date.now()) {
  const mins = minutesSince(value, now);
  if (mins === null) return 'age--fresh';
  if (mins >= red) return 'age--late';
  if (mins >= amber) return 'age--warn';
  return 'age--fresh';
}

export function clock(value: string | null | undefined): string {
  const ms = parseTime(value);
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const COURSE_NAMES: Record<number, string> = { 0: 'Drinks', 1: 'First course', 2: 'Main course', 3: 'Dessert' };
export const courseName = (course: number) => COURSE_NAMES[course] ?? `Course ${course}`;

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const pluralise = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

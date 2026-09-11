import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

// The server is launched from the server workspace, so its working directory is
// not the repository root. Point dotenv at the root .env explicitly, or every
// setting in it is silently ignored in favour of the defaults below.
dotenv.config({ path: path.join(ROOT, '.env') });

const num = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined ? fallback : String(v).toLowerCase() === 'true');

export const config = {
  port: num(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',
  databasePath: path.resolve(ROOT, process.env.DATABASE_PATH || './data/lord-erroll.db'),
  sessionSecret: process.env.SESSION_SECRET || 'change-me-before-go-live',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  backupDir: path.resolve(ROOT, process.env.BACKUP_DIR || './data/backups'),
  backupRetentionDays: num(process.env.BACKUP_RETENTION_DAYS, 30),
  serviceChargePercent: num(process.env.SERVICE_CHARGE_PERCENT, 10),
  vatPercent: num(process.env.VAT_PERCENT, 16),
  pricesIncludeVat: bool(process.env.PRICES_INCLUDE_VAT, true),
  currency: process.env.CURRENCY || 'KES',
  usdRate: num(process.env.USD_RATE, 129),
  webDist: path.resolve(ROOT, 'web', 'dist'),
  isProd: process.env.NODE_ENV === 'production',
};

export const SECTION_SORT = ['BAR', 'WW', 'EW', 'CLM'];

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { config } from './config.js';
import { db, migrate, getSetting } from './db.js';
import { attachStaff } from './lib/auth.js';
import { initRealtime } from './lib/realtime.js';
import { scheduleNightlyBackup } from './lib/backup.js';

import { authRouter } from './routes/auth.js';
import { menuRouter } from './routes/menu.js';
import { guestRouter } from './routes/guest.js';
import { floorRouter } from './routes/floor.js';
import { stationRouter } from './routes/station.js';
import { billsRouter } from './routes/bills.js';
import { adminRouter } from './routes/admin.js';
import { reportsRouter } from './routes/reports.js';
import { qrRouter } from './routes/qr.js';

migrate();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan('tiny'));
app.use(attachStaff);

// ------------------------------------------------------------------- API
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'The Lord Erroll ordering platform',
    time: new Date().toISOString(),
    restaurant: getSetting('restaurant', {}),
    openChecks: db.prepare("SELECT COUNT(*) c FROM checks WHERE status = 'open'").get().c,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/guest', guestRouter);
app.use('/api/floor', floorRouter);
app.use('/api/station', stationRouter);
app.use('/api/bills', billsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/qr', qrRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

// --------------------------------------------------------------- frontend
// In production the built SPA is served by this same process, so a table QR
// code and a waiter tablet both talk to one machine on the restaurant LAN.
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    // Only client-side routes fall through to the app shell. A request for a
    // file that is genuinely missing must 404, or the browser is handed HTML
    // where it asked for a font and the failure is invisible.
    if (path.extname(req.path)) return res.status(404).send('Not found');
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) =>
    res
      .status(503)
      .type('html')
      .send(
        '<h1>The Lord Erroll</h1><p>The guest app has not been built yet. Run <code>npm run build</code>, or use <code>npm run dev</code> during development.</p>'
      )
  );
}

const server = http.createServer(app);
initRealtime(server);
scheduleNightlyBackup();

server.listen(config.port, config.host, () => {
  const addresses = lanAddresses();
  console.log('\n  The Lord Erroll — on-premise ordering server');
  console.log('  ' + '─'.repeat(52));
  console.log(`  Local          http://localhost:${config.port}`);
  addresses.forEach((a) => console.log(`  On the LAN     http://${a}:${config.port}`));
  if (config.publicBaseUrl) console.log(`  QR codes point at  ${config.publicBaseUrl}`);
  console.log(`  Database       ${config.databasePath}`);
  if (config.sessionSecret === 'change-me-before-go-live') {
    console.log('\n  ⚠ SESSION_SECRET is still the default. Set it in .env before go-live.');
  }
  console.log('');
});

/**
 * A failure to take the port is the most common way this server refuses to start:
 * a previous copy is still running, or the machine already uses 4000 for something
 * else. Node's default is an unhandled 'error' event and a stack trace, which says
 * nothing useful to whoever is standing at the pass. Say what happened and what to
 * do about it instead.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Cannot start: port ${config.port} is already in use.`);
    console.error('  Another copy of this server is almost certainly still running.\n');
    console.error('  Find it:   lsof -i:' + config.port);
    console.error('  Stop it:   lsof -ti:' + config.port + ' | xargs kill');
    console.error(`  Or run on a different port:  PORT=4001 npm start\n`);
  } else if (err.code === 'EACCES') {
    console.error(`\n  Cannot start: not allowed to listen on port ${config.port}.`);
    console.error('  Ports below 1024 need elevated privileges. Pick a higher one in .env.\n');
  } else {
    console.error('\n  The server could not start:', err.message, '\n');
  }
  process.exit(1);
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const shutdown = (signal) => {
  console.log(`\n${signal} received — closing the floor cleanly.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

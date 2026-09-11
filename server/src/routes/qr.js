import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { config, ROOT } from '../config.js';
import { requireStaff } from '../lib/auth.js';

export const qrRouter = Router();

/**
 * The address printed on a table card. It carries the table's opaque token, so
 * scanning it is what tags every order with the right table and section.
 */
export function tableUrl(table, req) {
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}/t/${table.qr_token}`;
}

qrRouter.use(requireStaff('manager', 'admin'));

qrRouter.get('/table/:code.png', async (req, res, next) => {
  try {
    const table = loadTable(req.params.code);
    if (!table) return res.status(404).json({ error: 'Unknown table.' });
    const png = await QRCode.toBuffer(tableUrl(table, req), {
      type: 'png',
      width: Number(req.query.size) || 600,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1E4032', light: '#FFFFFF' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

qrRouter.get('/table/:code.svg', async (req, res, next) => {
  try {
    const table = loadTable(req.params.code);
    if (!table) return res.status(404).json({ error: 'Unknown table.' });
    const svg = await QRCode.toString(tableUrl(table, req), {
      type: 'svg', margin: 1, errorCorrectionLevel: 'H', color: { dark: '#1E4032', light: '#FFFFFF' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    next(err);
  }
});

/**
 * Print-ready cards. Open in a browser and print to A4 at 100% scale:
 * two cards to a page, crop marks included.
 * ?section=WW to print one section, ?tables=WW-01,WW-02 for a specific run.
 */
qrRouter.get('/cards', async (req, res, next) => {
  try {
    let tables;
    if (req.query.tables) {
      const codes = String(req.query.tables).split(',').map((c) => c.trim()).filter(Boolean);
      tables = codes.map((c) => loadTable(c)).filter(Boolean);
    } else if (req.query.section) {
      tables = db
        .prepare(
          `SELECT t.*, s.code AS section_code, s.name AS section_name FROM dining_tables t
           JOIN sections s ON s.id = t.section_id WHERE s.code = ? AND t.active = 1 ORDER BY t.sort_order`
        )
        .all(String(req.query.section).toUpperCase());
    } else {
      tables = db
        .prepare(
          `SELECT t.*, s.code AS section_code, s.name AS section_name FROM dining_tables t
           JOIN sections s ON s.id = t.section_id WHERE t.active = 1 ORDER BY s.sort_order, t.sort_order`
        )
        .all();
    }
    if (!tables.length) return res.status(404).send('No tables matched.');

    const crestPath = path.join(ROOT, 'web', 'public', 'crest.svg');
    const crest = fs.existsSync(crestPath) ? fs.readFileSync(crestPath, 'utf8') : '';

    const cards = await Promise.all(
      tables.map(async (table) => {
        const dataUrl = await QRCode.toDataURL(tableUrl(table, req), {
          width: 720, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#1E4032', light: '#FDFBF4' },
        });
        return { table, dataUrl };
      })
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(cardSheet(cards, crest));
  } catch (err) {
    next(err);
  }
});

function loadTable(code) {
  return db
    .prepare(
      `SELECT t.*, s.code AS section_code, s.name AS section_name
       FROM dining_tables t JOIN sections s ON s.id = t.section_id WHERE t.code = ?`
    )
    .get(String(code).toUpperCase());
}

function cardSheet(cards, crest) {
  const cardHtml = cards
    .map(
      ({ table, dataUrl }) => `
      <article class="card">
        <div class="rule"></div>
        <div class="crest">${crest}</div>
        <h1>The Lord Erroll</h1>
        <p class="tagline">Gourmet Restaurant</p>
        <img class="qr" src="${dataUrl}" alt="QR code for table ${table.code}">
        <p class="instruction">Scan to view the menu<br>and order from your table</p>
        <p class="table">${table.section_name} &middot; Table ${Number(table.number)}</p>
        <p class="code">${table.code}</p>
        <div class="rule"></div>
      </article>`
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Table cards — The Lord Erroll</title>
<style>
  @page { size: A4; margin: 12mm; }
  :root { --green:#1E4032; --oxblood:#7C1A26; --gold:#C9A227; --cream:#FDFBF4; --ink:#2A2118; }
  * { box-sizing: border-box; }
  body { margin:0; background:#EDE7DA; font-family: "Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif; color: var(--ink); }
  .sheet { display:grid; grid-template-columns: 1fr 1fr; gap:8mm; padding:8mm; }
  .card { background: var(--cream); border:1px solid #D8CDB4; padding:10mm 8mm; text-align:center;
          break-inside: avoid; page-break-inside: avoid; display:flex; flex-direction:column; align-items:center; }
  .rule { width:60%; height:2px; background:linear-gradient(90deg, transparent, var(--gold), transparent); margin:0 auto; }
  .crest { width:26mm; margin:6mm auto 2mm; }
  .crest svg { width:100%; height:auto; display:block; }
  h1 { font-size:22pt; margin:2mm 0 0; letter-spacing:0.04em; font-weight:600; color:var(--green); }
  .tagline { margin:1mm 0 5mm; font-size:9pt; letter-spacing:0.32em; text-transform:uppercase; color:var(--oxblood); }
  .qr { width:44mm; height:44mm; display:block; margin:0 auto; }
  .instruction { font-size:10.5pt; font-style:italic; margin:5mm 0 4mm; line-height:1.5; color:#5A4B36; }
  .table { font-size:13pt; margin:0; letter-spacing:0.06em; color:var(--green); }
  .code { font-size:8pt; letter-spacing:0.28em; margin:1.5mm 0 6mm; color:#9A8B6E; }
  @media print { body { background:#fff; } .card { border:1px dashed #CFC4AC; } }
</style></head>
<body><div class="sheet">${cardHtml}</div></body></html>`;
}

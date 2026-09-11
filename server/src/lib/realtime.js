import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { db } from '../db.js';

let io = null;

export const rooms = {
  table: (code) => `table:${code}`,
  section: (code) => `section:${code}`,
  station: (name) => `station:${name}`,
  admin: () => 'admin',
};

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    // Everything stays on the LAN; any origin on the restaurant network is fine.
    cors: { origin: true, credentials: true },
    // Long polling fallback matters: staff tablets roam between access points.
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  io.on('connection', (socket) => {
    const { tableToken, staffToken } = socket.handshake.auth ?? {};

    if (tableToken) {
      const table = db
        .prepare('SELECT code FROM dining_tables WHERE qr_token = ? AND active = 1')
        .get(String(tableToken));
      if (table) {
        socket.join(rooms.table(table.code));
        socket.data.table = table.code;
      }
    }

    if (staffToken) {
      const claims = verifyToken(staffToken);
      if (claims) {
        const staff = db.prepare('SELECT id, role FROM staff WHERE id = ? AND active = 1').get(claims.id);
        if (staff) {
          socket.data.staff = staff;
          if (staff.role === 'waiter') {
            db.prepare(
              'SELECT s.code FROM staff_sections ss JOIN sections s ON s.id = ss.section_id WHERE ss.staff_id = ?'
            )
              .all(staff.id)
              .forEach((s) => socket.join(rooms.section(s.code)));
          } else {
            // Kitchen, bar, managers and admins observe the whole floor.
            db.prepare('SELECT code FROM sections').all().forEach((s) => socket.join(rooms.section(s.code)));
          }
          if (staff.role === 'kitchen') socket.join(rooms.station('kitchen'));
          if (staff.role === 'bar') socket.join(rooms.station('bar'));
          if (['manager', 'admin'].includes(staff.role)) {
            socket.join(rooms.admin());
            socket.join(rooms.station('kitchen'));
            socket.join(rooms.station('bar'));
          }
        }
      }
    }

    socket.emit('ready', { at: new Date().toISOString() });
  });

  return io;
}

/** Fan an event out to a list of rooms. Safe to call before the server is up. */
export function emitTo(roomList, event, payload) {
  if (!io) return;
  const unique = [...new Set(roomList.filter(Boolean))];
  if (!unique.length) return;
  io.to(unique).emit(event, payload);
}

/** Everything that happens to an order interests the guest, the section and both passes. */
export function broadcastOrder(event, payload) {
  emitTo(
    [
      rooms.table(payload.tableCode),
      rooms.section(payload.sectionCode),
      rooms.station('kitchen'),
      rooms.station('bar'),
      rooms.admin(),
    ],
    event,
    payload
  );
}

export const getIo = () => io;

-- =====================================================================
--  The Lord Erroll — on-premise ordering platform
--  SQLite schema.  Everything lives on the restaurant's own machine.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- floor
CREATE TABLE IF NOT EXISTS sections (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,          -- BAR, WW, EW, CLM
  name        TEXT NOT NULL,                 -- "Bar Side"
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,          -- WW-12  (SECTION-TABLE#)
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  number      TEXT NOT NULL,                 -- "12"
  label       TEXT,                          -- optional friendly name, "Terrace 3"
  seats       INTEGER NOT NULL DEFAULT 4,
  qr_token    TEXT NOT NULL UNIQUE,          -- opaque token embedded in the QR code
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tables_section ON dining_tables(section_id);

-- ---------------------------------------------------------------- staff
CREATE TABLE IF NOT EXISTS staff (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('waiter','kitchen','bar','manager','admin')),
  pin_hash      TEXT,                        -- waiters / stations sign in with a PIN
  email         TEXT UNIQUE,                 -- managers & admins
  password_hash TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_sections (
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, section_id)
);

-- ----------------------------------------------------------------- menu
CREATE TABLE IF NOT EXISTS menu_categories (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES menu_categories(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('food','drink','set')),
  station     TEXT NOT NULL CHECK (station IN ('kitchen','bar')),
  course      INTEGER NOT NULL DEFAULT 2,    -- default fire course: 1 starters, 2 mains, 3 dessert, 0 drinks
  note        TEXT,                          -- menu footnotes, e.g. allergen advisory
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price_kes     REAL,                        -- NULL = not yet digitised, needs manager entry
  price_usd     REAL,
  station       TEXT NOT NULL CHECK (station IN ('kitchen','bar')),
  course        INTEGER NOT NULL DEFAULT 2,
  dietary       TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["vegetarian","vegan","gluten-free"]
  allergens     TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["shellfish","nuts","dairy"]
  image         TEXT,
  is_set_menu   INTEGER NOT NULL DEFAULT 0,  -- priced per guest, choices picked per cover
  price_review  INTEGER NOT NULL DEFAULT 0,  -- 1 = price faint/missing on the source menu
  allergen_review INTEGER NOT NULL DEFAULT 1, -- 1 = allergen list not yet signed off by the chef
  available     INTEGER NOT NULL DEFAULT 1,  -- 0 = 86'd
  unavailable_reason TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_category ON menu_items(category_id);

-- Bottle / tot, 6pc / 12pc, 300g / 500g … each is separately orderable.
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id           INTEGER PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,                -- "Bottle", "Tot", "6 pieces"
  price_kes    REAL,
  price_review INTEGER NOT NULL DEFAULT 0,
  available    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_item ON menu_item_variants(item_id);

-- Sauce choice, cooking temperature, set-menu course selections.
CREATE TABLE IF NOT EXISTS modifier_groups (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                  -- "Choice of sauce", "Starter"
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  course     INTEGER NOT NULL DEFAULT 0,     -- for set menus: which course this choice belongs to
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id          INTEGER PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price_delta REAL NOT NULL DEFAULT 0,
  available   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- --------------------------------------------------------------- service
-- A check is one table's whole visit; orders are the rounds within it.
CREATE TABLE IF NOT EXISTS checks (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,          -- LE-0912-0431
  table_id    INTEGER NOT NULL REFERENCES dining_tables(id),
  section_id  INTEGER NOT NULL REFERENCES sections(id),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','billed','closed','void')),
  guest_count INTEGER NOT NULL DEFAULT 1,
  guest_name  TEXT,
  opened_at   TEXT NOT NULL DEFAULT (datetime('now')),
  billed_at   TEXT,
  closed_at   TEXT,
  service_charge_percent REAL,
  vat_percent REAL,
  discount_percent REAL NOT NULL DEFAULT 0,
  discount_reason  TEXT,
  split_mode  TEXT NOT NULL DEFAULT 'single' CHECK (split_mode IN ('single','even','item')),
  split_ways  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_checks_table_status ON checks(table_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  check_id        INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  table_id        INTEGER NOT NULL REFERENCES dining_tables(id),
  section_id      INTEGER NOT NULL REFERENCES sections(id),
  round           INTEGER NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'guest' CHECK (source IN ('guest','waiter')),
  staff_id        INTEGER REFERENCES staff(id),
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','acknowledged','preparing','ready','served','void')),
  note            TEXT,
  client_op_id    TEXT UNIQUE,               -- idempotency key for offline resync
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  acknowledged_by INTEGER REFERENCES staff(id),
  served_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_check ON orders(check_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  check_id      INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  menu_item_id  INTEGER REFERENCES menu_items(id),
  variant_id    INTEGER REFERENCES menu_item_variants(id),
  name          TEXT NOT NULL,               -- snapshot, so history survives menu edits
  variant_label TEXT,
  qty           INTEGER NOT NULL DEFAULT 1,
  unit_price    REAL NOT NULL DEFAULT 0,
  station       TEXT NOT NULL CHECK (station IN ('kitchen','bar')),
  course        INTEGER NOT NULL DEFAULT 2,
  note          TEXT,
  allergy_note  TEXT,                        -- surfaced in red/gold on every staff screen
  held          INTEGER NOT NULL DEFAULT 0,  -- 1 = waiting for the waiter to fire the course
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','preparing','ready','served','void','unavailable')),
  void_reason   TEXT,
  comped        INTEGER NOT NULL DEFAULT 0,
  split_group   INTEGER,                     -- for split-by-item billing
  fired_at      TEXT,
  started_at    TEXT,
  ready_at      TEXT,
  served_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_check ON order_items(check_id);
CREATE INDEX IF NOT EXISTS idx_order_items_station ON order_items(station, status);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id            INTEGER PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  group_name    TEXT NOT NULL,
  option_name   TEXT NOT NULL,
  price_delta   REAL NOT NULL DEFAULT 0,
  cover         INTEGER                      -- which guest (set menus are chosen per cover)
);
CREATE INDEX IF NOT EXISTS idx_oim_item ON order_item_modifiers(order_item_id);

CREATE TABLE IF NOT EXISTS service_requests (
  id         INTEGER PRIMARY KEY,
  table_id   INTEGER NOT NULL REFERENCES dining_tables(id),
  section_id INTEGER NOT NULL REFERENCES sections(id),
  check_id   INTEGER REFERENCES checks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('waiter','bill','water','assistance')),
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  handled_by INTEGER REFERENCES staff(id),
  client_op_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_requests_open ON service_requests(status, section_id);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY,
  check_id   INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('cash','card','mpesa','account','comp')),
  amount     REAL NOT NULL,
  reference  TEXT,                           -- M-Pesa code / terminal slip no.
  split_group INTEGER,
  staff_id   INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_check ON payments(check_id);

-- --------------------------------------------------------------- system
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  action     TEXT NOT NULL,
  actor      TEXT,                           -- "waiter:3", "guest:WW-12", "system"
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

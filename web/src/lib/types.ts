export type Station = 'kitchen' | 'bar';
export type Role = 'waiter' | 'kitchen' | 'bar' | 'manager' | 'admin';

export type OrderStatus = 'sent' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'void';
export type ItemStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'void' | 'unavailable';

export interface MenuOption {
  id: number;
  name: string;
  description: string | null;
  priceDelta: number;
  available: boolean;
}

export interface MenuGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  course: number;
  options: MenuOption[];
}

export interface MenuVariant {
  id: number;
  label: string;
  price: number | null;
  priceReview: boolean;
  available: boolean;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number | null;
  priceUsd: number | null;
  station: Station;
  course: number;
  dietary: string[];
  allergens: string[];
  isSetMenu: boolean;
  priceReview: boolean;
  allergenReview: boolean;
  available: boolean;
  unavailableReason: string | null;
  active: boolean;
  priced: boolean;
  variants: MenuVariant[];
  modifierGroups: MenuGroup[];
}

export interface MenuCategory {
  id: number;
  code: string;
  name: string;
  kind: 'food' | 'drink' | 'set';
  station: Station;
  course: number;
  note: string | null;
  items: MenuItem[];
}

export interface OrderItemModifier {
  groupName: string;
  optionName: string;
  priceDelta: number;
  cover: number | null;
}

export interface OrderItem {
  id: number;
  orderId: number;
  checkId: number;
  menuItemId: number | null;
  name: string;
  variantLabel: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  station: Station;
  course: number;
  note: string | null;
  allergyNote: string | null;
  held: boolean;
  status: ItemStatus;
  comped: boolean;
  voidReason: string | null;
  splitGroup: number | null;
  firedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  createdAt: string;
  modifiers: OrderItemModifier[];
}

export interface Order {
  id: number;
  checkId: number;
  tableId: number;
  tableCode: string;
  tableLabel: string | null;
  sectionCode: string;
  sectionName: string;
  round: number;
  source: 'guest' | 'waiter';
  staffName: string | null;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  servedAt: string | null;
  hasAllergyNote: boolean;
  items: OrderItem[];
}

export interface Totals {
  checkId: number;
  lines: OrderItem[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  serviceChargePercent: number;
  serviceCharge: number;
  vatPercent: number;
  vat: number;
  vatIncluded: boolean;
  total: number;
  paid: number;
  balance: number;
  usdRate: number;
}

export interface Check {
  id: number;
  code: string;
  tableCode: string;
  tableLabel: string | null;
  sectionCode: string;
  sectionName: string;
  status: 'open' | 'billed' | 'closed' | 'void';
  guestCount: number;
  guestName: string | null;
  openedAt: string;
  billedAt: string | null;
  closedAt: string | null;
  splitMode: 'single' | 'even' | 'item';
  splitWays: number;
  discountPercent: number;
  orders: Order[];
  totals: Totals;
  payments: { id: number; method: string; amount: number; reference: string | null; splitGroup: number | null; createdAt: string }[];
}

export interface GuestTable {
  code: string;
  number: string;
  label: string | null;
  seats: number;
  sectionCode: string;
  sectionName: string;
}

export interface GuestSession {
  table: GuestTable;
  check: Check | null;
  menu: MenuCategory[];
  settings: { ageAmberMinutes: number; ageRedMinutes: number };
}

export interface Staff {
  id: number;
  name: string;
  role: Role;
  sections: { id: number; code: string; name: string }[];
}

export interface ServiceRequest {
  id: number;
  type: 'waiter' | 'bill' | 'water' | 'assistance';
  note: string | null;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  tableCode?: string;
  sectionCode?: string;
}

export interface FloorTable {
  id: number;
  code: string;
  number: string;
  label: string | null;
  seats: number;
  sectionCode: string;
  check: {
    id: number;
    code: string;
    status: string;
    guestCount: number;
    openedAt: string;
    oldestOpenOrderAt: string | null;
    items: number;
    pending: number;
    ready: number;
    held: number;
    allergies: number;
    total: number;
  } | null;
  requests: ServiceRequest[];
}

export interface FloorSection {
  id: number;
  code: string;
  name: string;
  tables: FloorTable[];
}

export interface StationTicket {
  key: string;
  orderId: number;
  checkId: number;
  tableCode: string;
  tableLabel: string | null;
  sectionCode: string;
  sectionName: string;
  round: number;
  source: 'guest' | 'waiter';
  guestCount: number;
  orderNote: string | null;
  firedAt: string;
  createdAt: string;
  hasAllergyNote: boolean;
  allReady: boolean;
  items: {
    id: number;
    name: string;
    variantLabel: string | null;
    qty: number;
    course: number;
    note: string | null;
    allergyNote: string | null;
    status: ItemStatus;
    firedAt: string | null;
    startedAt: string | null;
    modifiers: { groupName: string; optionName: string; cover: number | null }[];
  }[];
}

/** One line a guest has put in the basket but not yet sent. */
export interface DraftLine {
  uid: string;
  item: MenuItem;
  variantId: number | null;
  variantLabel: string | null;
  qty: number;
  note: string;
  allergyNote: string;
  modifiers: {
    groupId: number;
    optionId: number;
    groupName: string;
    optionName: string;
    priceDelta: number;
    /** Set menus are chosen per guest, so each choice remembers whose it is. */
    cover?: number | null;
  }[];
  unitPrice: number;
}

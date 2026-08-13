import Database from "better-sqlite3";
import truncate from "lodash/truncate";

export const SYNTHETIC_NOTICE =
  "Northstar Orders uses only synthetic demo data for enterprise inner-source order portal demonstrations.";

const MAX_SEARCH_LENGTH = 80;
const MAX_RESULT_LIMIT = 25;
const DEFAULT_RESULT_LIMIT = 10;

export interface OrderRecord {
  id: number;
  orderNumber: string;
  customerName: string;
  customerSegment: string;
  region: string;
  productName: string;
  quantity: number;
  orderTotal: number;
  status: string;
  createdAt: string;
  dataClassification: "synthetic-demo";
  synthetic: true;
  notePreview: string;
}

interface OrderRow {
  id: number;
  order_number: string;
  customer_name: string;
  customer_segment: string;
  region: string;
  product_name: string;
  quantity: number;
  order_total: number;
  status: string;
  created_at: string;
  demo_note: string;
}

export interface OrderStore {
  listOrders(limit?: number): OrderRecord[];
  searchOrders(search: string, limit?: number): OrderRecord[];
  countOrders(): number;
  isQueryOnly(): boolean;
  close(): void;
}

const syntheticOrders = [
  ["SDO-1001", "Synthetic Account Alpha", "Manufacturing", "EMEA", "Secure build scanner bundle", 3, 18450, "Ready for review", "2026-08-01T09:15:00.000Z", "Synthetic Northstar Orders record used to show application security posture without exposing real records."],
  ["SDO-1002", "Synthetic Account Bravo", "Financial Services", "North America", "Policy-as-code starter kit", 5, 22400, "Shipped", "2026-08-02T10:20:00.000Z", "Synthetic Northstar Orders record for enterprise inner-source controls and developer education."],
  ["SDO-1003", "Synthetic Account Cedar", "Retail", "APAC", "Threat modeling workshop seats", 18, 9900, "Queued", "2026-08-03T14:45:00.000Z", "Synthetic Northstar Orders workshop record for demo reporting and search scenarios."],
  ["SDO-1004", "Synthetic Account Delta", "Healthcare", "EMEA", "Dependency review enablement", 8, 12800, "Ready for review", "2026-08-04T08:30:00.000Z", "Synthetic data only; no person, organization, or production identifier is represented."],
  ["SDO-1005", "Synthetic Account Ember", "Consumer Goods", "North America", "Secret scanning tabletop kit", 2, 7400, "Shipped", "2026-08-05T12:10:00.000Z", "Synthetic Northstar Orders example for secure development demonstrations."],
  ["SDO-1006", "Synthetic Account Fjord", "Logistics", "LATAM", "Container hardening checklist", 6, 8700, "In fulfillment", "2026-08-06T16:05:00.000Z", "Synthetic logistics-style record for supply-chain security workflow demos."],
  ["SDO-1007", "Synthetic Account Grove", "Technology", "EMEA", "CodeQL query onboarding", 10, 15750, "Queued", "2026-08-07T11:25:00.000Z", "Synthetic Northstar Orders record designed to make normal search behavior easy to verify."],
  ["SDO-1008", "Synthetic Account Harbor", "Financial Services", "North America", "Advanced security rollout plan", 4, 31600, "Ready for review", "2026-08-08T09:55:00.000Z", "Synthetic finance-style record; all names and amounts are invented for demo use."],
  ["SDO-1009", "Synthetic Account Indigo", "Education", "APAC", "Security champions curriculum", 12, 6400, "Shipped", "2026-08-09T13:40:00.000Z", "Synthetic learning-style record for secure development education examples."],
  ["SDO-1010", "Synthetic Account Juniper", "Wholesale", "EMEA", "Cloud security connector rehearsal", 7, 20400, "In fulfillment", "2026-08-10T15:30:00.000Z", "Synthetic Northstar Orders record that contains no credentials, tokens, or external system identifiers."],
  ["SDO-1011", "Synthetic Account Kestrel", "Hospitality", "North America", "Incident response drill pack", 9, 11750, "Queued", "2026-08-11T18:00:00.000Z", "Synthetic hospitality-style scenario for cross-team security operations demos."],
  ["SDO-1012", "Synthetic Account Lumen", "Research", "EMEA", "Secure release governance map", 1, 4900, "Ready for review", "2026-08-12T07:50:00.000Z", "Synthetic research-style record for governance and remediation workflow demonstrations."]
];

export function clampLimit(rawLimit: unknown): number {
  const parsed = typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.min(Math.max(parsed, 1), MAX_RESULT_LIMIT);
}

export function validateSearchTerm(rawSearch: unknown): string {
  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new RangeError(`Search text is limited to ${MAX_SEARCH_LENGTH} characters.`);
  }

  return search.replaceAll("\u0000", "");
}

export function createOrderStore(filename = ":memory:"): OrderStore {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_segment TEXT NOT NULL,
      region TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      order_total REAL NOT NULL CHECK (order_total >= 0),
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      demo_note TEXT NOT NULL,
      data_classification TEXT NOT NULL DEFAULT 'synthetic-demo'
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare(`
      INSERT INTO orders (
        order_number, customer_name, customer_segment, region, product_name,
        quantity, order_total, status, created_at, demo_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = db.transaction(() => {
      for (const order of syntheticOrders) {
        insert.run(...order);
      }
    });
    seed();
  }

  db.pragma("query_only = ON");

  const mapRow = (row: OrderRow): OrderRecord => ({
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerSegment: row.customer_segment,
    region: row.region,
    productName: row.product_name,
    quantity: row.quantity,
    orderTotal: row.order_total,
    status: row.status,
    createdAt: row.created_at,
    dataClassification: "synthetic-demo",
    synthetic: true,
    notePreview: truncate(row.demo_note, { length: 96 })
  });

  const selectColumns = `
    id, order_number, customer_name, customer_segment, region, product_name,
    quantity, order_total, status, created_at, demo_note
  `;

  return {
    listOrders(limit = DEFAULT_RESULT_LIMIT): OrderRecord[] {
      const safeLimit = clampLimit(limit);
      const rows = db
        .prepare(`SELECT ${selectColumns} FROM orders ORDER BY created_at DESC LIMIT ?`)
        .all(safeLimit) as unknown as OrderRow[];
      return rows.map(mapRow);
    },

    searchOrders(search: string, limit = DEFAULT_RESULT_LIMIT): OrderRecord[] {
      const safeLimit = clampLimit(limit);
      const boundedSearch = validateSearchTerm(search);
      if (boundedSearch.length === 0) {
        return this.listOrders(safeLimit);
      }

      const unsafeSql = `
        SELECT ${selectColumns}
        FROM orders
        WHERE customer_name LIKE '%${boundedSearch}%'
           OR product_name LIKE '%${boundedSearch}%'
           OR order_number LIKE '%${boundedSearch}%'
           OR region LIKE '%${boundedSearch}%'
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;

      const rows = db.prepare(unsafeSql).all() as unknown as OrderRow[];
      return rows.slice(0, safeLimit).map(mapRow);
    },

    countOrders(): number {
      const row = db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };
      return row.count;
    },

    isQueryOnly(): boolean {
      const row = db.pragma("query_only", { simple: true }) as number;
      return row === 1;
    },

    close(): void {
      db.close();
    }
  };
}

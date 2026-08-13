import assert from "node:assert/strict";
import { Server } from "node:http";
import test from "node:test";
import { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { createOrderStore, SYNTHETIC_NOTICE } from "../src/database";

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(): Promise<TestServer> {
  const store = createOrderStore();
  const app = createApp({ store });
  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        (server as Server).close((error) => (error ? reject(error) : resolve()));
      });
      store.close();
    }
  };
}

test("health and readiness endpoints report synthetic query-only data", async () => {
  const server = await startTestServer();
  try {
    const health = await fetch(`${server.baseUrl}/healthz`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.syntheticData, true);
    assert.equal(healthBody.notice, SYNTHETIC_NOTICE);

    const ready = await fetch(`${server.baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    const readyBody = await ready.json();
    assert.equal(readyBody.status, "ready");
    assert.equal(readyBody.database.mode, "query_only");
    assert.ok(readyBody.database.orderCount >= 10);
  } finally {
    await server.close();
  }
});

test("normal order search returns bounded synthetic demo records", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/orders?search=Grove&limit=5`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.syntheticData, true);
    assert.match(body.notice, /synthetic demo data/i);
    assert.equal(body.query.search, "Grove");
    assert.ok(body.orders.length > 0);
    assert.ok(body.orders.length <= 5);
    assert.ok(body.orders.every((order: { synthetic: boolean }) => order.synthetic === true));
    assert.ok(
      body.orders.every(
        (order: { dataClassification: string }) => order.dataClassification === "synthetic-demo"
      )
    );
  } finally {
    await server.close();
  }
});

test("injection-shaped input is constrained to synthetic rows and a bounded result count", async () => {
  const server = await startTestServer();
  try {
    const payload = encodeURIComponent("%' OR 1=1 --");
    const response = await fetch(`${server.baseUrl}/api/orders?search=${payload}&limit=7`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.syntheticData, true);
    assert.ok(body.orders.length <= 7);
    assert.ok(body.orders.length > 0);
    assert.ok(
      body.orders.every(
        (order: { dataClassification: string; synthetic: boolean }) =>
          order.dataClassification === "synthetic-demo" && order.synthetic === true
      )
    );
    assert.ok(
      body.orders.every(
        (order: Record<string, unknown>) =>
          !("password" in order) && !("token" in order) && !("credential" in order)
      )
    );
  } finally {
    await server.close();
  }
});

test("search input length is rejected before reaching the database", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/orders?search=${"a".repeat(81)}`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "invalid_request");
    assert.equal(body.syntheticData, true);
  } finally {
    await server.close();
  }
});

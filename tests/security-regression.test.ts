import assert from "node:assert/strict";
import test from "node:test";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { createApp } from "../src/app";
import { createOrderStore } from "../src/database";

let vulnerableSearchObserved = false;

process.on("exit", () => {
  if (vulnerableSearchObserved) {
    process.exitCode = 1;
  }
});

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
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

test("order search treats SQL metacharacters as literal text", async () => {
  const server = await startServer();
  try {
    const payload = encodeURIComponent("%' OR 1=1 --");
    const response = await fetch(`${server.baseUrl}/api/orders?search=${payload}&limit=10`);
    assert.equal(response.status, 200);
    const body = await response.json();
    vulnerableSearchObserved = body.orders.length > 0;

    assert.equal(
      body.orders.length,
      0,
      "Expected a parameterized query to return no literal matches for the injection payload."
    );
  } finally {
    await server.close();
  }
});

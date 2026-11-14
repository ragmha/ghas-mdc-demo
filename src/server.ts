import { createServer } from "node:http";
import { createApp } from "./app";
import { createOrderStore } from "./database";
import { log } from "./logger";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const store = createOrderStore();
const app = createApp({ store });
const server = createServer(app);

server.requestTimeout = 10_000;
server.headersTimeout = 12_000;
server.keepAliveTimeout = 5_000;

server.listen(port, host, () => {
  log("info", "server_started", {
    host,
    port,
    syntheticData: true,
    databaseMode: store.isQueryOnly() ? "query_only" : "writable"
  });
});

function shutdown(signal: NodeJS.Signals): void {
  log("info", "shutdown_started", { signal });
  server.close((error) => {
    if (error) {
      log("error", "shutdown_failed", { message: error.message });
      process.exitCode = 1;
    }

    store.close();
    log("info", "shutdown_complete", { signal });
    process.exit();
  });

  setTimeout(() => {
    log("error", "shutdown_forced", { signal });
    process.exit(1);
  }, 8_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

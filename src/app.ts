import express, { ErrorRequestHandler, RequestHandler } from "express";
import path from "node:path";
import { createOrderStore, OrderStore, SYNTHETIC_NOTICE, validateSearchTerm, clampLimit } from "./database";
import { log } from "./logger";

interface AppOptions {
  publicDir?: string;
  store?: OrderStore;
}

const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    log("info", "http_request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      contentLength: Number(res.getHeader("content-length")) || 0
    });
  });
  next();
};

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const store = options.store ?? createOrderStore();
  const publicDir = options.publicDir ?? path.resolve(process.cwd(), "public");

  app.disable("x-powered-by");
  app.set("json spaces", 2);
  app.locals.store = store;

  app.use(requestLogger);
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "8kb", parameterLimit: 20 }));

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      syntheticData: true,
      notice: SYNTHETIC_NOTICE,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  app.get("/readyz", (_req, res) => {
    const orderCount = store.countOrders();
    const queryOnly = store.isQueryOnly();
    const ready = orderCount > 0 && queryOnly;

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      syntheticData: true,
      notice: SYNTHETIC_NOTICE,
      database: {
        mode: queryOnly ? "query_only" : "writable",
        orderCount
      }
    });
  });

  app.get("/api/orders", (req, res, next) => {
    try {
      const limit = clampLimit(req.query.limit);
      const search = validateSearchTerm(req.query.search);
      const orders = search.length > 0 ? store.searchOrders(search, limit) : store.listOrders(limit);

      res.json({
        syntheticData: true,
        notice: SYNTHETIC_NOTICE,
        query: {
          search,
          limit,
          returned: orders.length
        },
        orders
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(
    express.static(publicDir, {
      extensions: ["html"],
      etag: true,
      maxAge: "5m",
      setHeaders(res) {
        res.setHeader("X-Demo-Data", "synthetic-only");
      }
    })
  );

  app.use((_req, res) => {
    res.status(404).json({
      error: "not_found",
      syntheticData: true,
      notice: SYNTHETIC_NOTICE
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const statusCode = error instanceof RangeError ? 400 : 500;
    log(statusCode >= 500 ? "error" : "warn", "request_error", {
      statusCode,
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });

    res.status(statusCode).json({
      error: statusCode === 400 ? "invalid_request" : "internal_error",
      message: statusCode === 400 ? String(error.message) : "Northstar Orders could not process the request.",
      syntheticData: true,
      notice: SYNTHETIC_NOTICE
    });
  };

  app.use(errorHandler);

  return app;
}

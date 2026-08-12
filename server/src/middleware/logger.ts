import pino from "pino";
import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export const logger = pino({
  level: config.logging.level,
  transport: config.isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      traceId: req.traceId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

/**
 * Middleware that logs every HTTP request with traceId and duration.
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]({
      req,
      res,
      responseTime: duration,
      traceId: req.traceId,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}

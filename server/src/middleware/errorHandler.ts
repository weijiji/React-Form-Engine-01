import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

/**
 * Application-level error with code for unified error responses.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
  }
}

/**
 * Unified error response format: { error: { code, message, details? } }
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Known application errors
  if (err instanceof AppError) {
    logger.warn(
      { err, traceId: req.traceId },
      `AppError: ${err.code} - ${err.message}`
    );
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unknown errors — log full stack trace, return generic message
  logger.error(
    { err, traceId: req.traceId },
    `Unhandled error: ${err.message}`
  );

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "服务器内部错误，请稍后重试"
          : err.message,
    },
  });
}

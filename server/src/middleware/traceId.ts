import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

/**
 * Middleware that generates or extracts a trace ID for every request.
 * Attaches traceId to the Request object and sets the X-Trace-Id response header.
 */
export function traceIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const traceId =
    (req.headers["x-trace-id"] as string) || uuidv4();

  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  next();
}

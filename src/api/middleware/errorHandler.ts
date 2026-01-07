import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

import { ErrorCode, type ApiErrorResponse } from '../../types/index.js';
import { isAppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let code = ErrorCode.INTERNAL_ERROR;
  let message = 'An unexpected error occurred';
  let details: Record<string, unknown> | undefined;

  if (isAppError(err)) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;

    logger.info(
      {
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
        path: req.path,
        method: req.method,
      },
      'Operational error'
    );
  } else {
    // Log unexpected errors at error level with stack trace
    logger.error(
      {
        err,
        path: req.path,
        method: req.method,
        body: req.body as unknown,
      },
      'Unexpected error'
    );

    if (process.env.NODE_ENV === 'development') {
      message = err.message;
      details = { stack: err.stack };
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.ROUTE_NOT_FOUND,
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
};

export default {
  errorHandler,
  notFoundHandler,
};

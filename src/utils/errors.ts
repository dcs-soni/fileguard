import { ErrorCode } from '../types/index.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: Record<string, unknown>
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 404, ErrorCode.JOB_NOT_FOUND, {
      resource,
      identifier,
    });
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

// 413 Payload Too Large
export class FileTooLargeError extends AppError {
  constructor(maxSizeMb: number) {
    super(`File exceeds maximum allowed size of ${maxSizeMb}MB`, 413, ErrorCode.FILE_TOO_LARGE, {
      maxSizeMb,
    });
    Object.setPrototypeOf(this, FileTooLargeError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, ErrorCode.DATABASE_ERROR, details);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class StorageError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, ErrorCode.STORAGE_ERROR, details);
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

export class QueueError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, ErrorCode.QUEUE_ERROR, details);
    Object.setPrototypeOf(this, QueueError.prototype);
  }
}

export class ScannerError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, ErrorCode.SCANNER_ERROR, details);
    Object.setPrototypeOf(this, ScannerError.prototype);
  }
}

export class ScannerUnavailableError extends AppError {
  constructor() {
    super(
      'Virus scanner is temporarily unavailable. Please try again later.',
      503,
      ErrorCode.SCANNER_UNAVAILABLE
    );
    Object.setPrototypeOf(this, ScannerUnavailableError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Configures multer for handling multipart/form-data file uploads. Provides proper validation, size limits, and error handling.

import os from 'os';
import path from 'path';

import { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';

import { config } from '../../config/index.js';
import { FileTooLargeError, ValidationError } from '../../utils/errors.js';

const MAX_FILE_SIZE = config.storage.maxFileSizeMb * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',

  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',

  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Executables (we scan these!)
  'application/x-msdownload',
  'application/x-executable',
  'application/x-msdos-program',

  // Scripts
  'application/javascript',
  'text/javascript',
  'application/x-python',

  // Others
  'application/octet-stream', // Generic binary
]);

const BLOCKED_EXTENSIONS = new Set([
  // Not really files
  '.lnk',
  '.url',
]);

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    // Generate unique temporary filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    cb(new ValidationError(`File type not allowed: ${ext}`));
    return;
  }

  // validate MIME type to prevent file type spoofing
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new ValidationError(`MIME type not allowed ${file.mimetype}`));
    return;
  }

  cb(null, true);
};

// Multer Instance

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 10,
    fieldSize: 1024 * 1024,
  },
});

export const uploadSingle = upload.single('file');

export function handleUploadError(
  err: Error,
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      next(new FileTooLargeError(config.storage.maxFileSizeMb));
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      next(
        new ValidationError('Unexpected file field. Use "file" as field name.')
      );
      return;
    }
    next(new ValidationError(`Upload error: ${err.message}`));
    return;
  }

  next(err);
}

export function getAllowedMimeTypes(): string[] {
  return Array.from(ALLOWED_MIME_TYPES);
}

export default {
  upload,
  uploadSingle,
  handleUploadError,
  getAllowedMimeTypes,
  MAX_FILE_SIZE,
};

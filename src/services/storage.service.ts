// Local storage service, todo: support S3

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { config } from '../config/index.js';
import { StorageError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const UPLOAD_DIR = path.resolve(config.storage.uploadDir);

export interface StoredFile {
  storedFilename: string;
  filePath: string;
  fileSize: number;
  checksum: string;
}

export async function initStorage(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    logger.info({ uploadDir: UPLOAD_DIR }, 'Storage initialized');
  } catch (error) {
    logger.error(
      { error, uploadDir: UPLOAD_DIR },
      'Failed to initialize storage'
    );
    throw new StorageError('Failed to initialize storage directory');
  }
}

// File Operations

export function generateStorageFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, ext);

  const sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

  return `${timestamp}-${randomHex}-${sanitized}${ext}`;
}

export async function calculateChecksum(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

export async function saveFile(
  tempPath: string,
  originalFilename: string
): Promise<StoredFile> {
  try {
    await initStorage();

    const storedFilename = generateStorageFilename(originalFilename);
    const filePath = path.join(UPLOAD_DIR, storedFilename);

    const stats = await fs.stat(tempPath);

    const checksum = await calculateChecksum(tempPath);

    await fs.rename(tempPath, filePath);

    logger.info(
      { originalFilename, storedFilename, fileSize: stats.size },
      'File saved to storage'
    );

    return {
      storedFilename,
      filePath,
      fileSize: stats.size,
      checksum,
    };
  } catch (error) {
    logger.error({ error, originalFilename }, 'Failed to save file');

    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    throw new StorageError('Failed to save uploaded file');
  }
}

export function getFilePath(storedFilename: string): string {
  const safeName = path.basename(storedFilename);

  const filePath = path.join(UPLOAD_DIR, safeName);
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(resolvedUploadDir + path.sep)) {
    throw new StorageError(`Invalid file path detected: ${storedFilename}`);
  }

  return resolvedPath;
}

export async function fileExists(storedFilename: string): Promise<boolean> {
  try {
    await fs.access(getFilePath(storedFilename));
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(storedFilename: string): Promise<void> {
  try {
    const filePath = getFilePath(storedFilename);
    await fs.unlink(filePath);
    logger.info({ storedFilename }, 'File deleted from storage');
  } catch (error) {
    logger.error({ error, storedFilename }, 'Failed to delete file');
    throw new StorageError('Failed to delete file');
  }
}

export async function getFileStats(storedFilename: string): Promise<{
  size: number;
  createdAt: Date;
  modifiedAt: Date;
}> {
  try {
    const stats = await fs.stat(getFilePath(storedFilename));
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  } catch (error) {
    logger.error({ error, storedFilename }, 'Failed to get file stats');
    throw new StorageError('Failed to get file information');
  }
}

export async function readFile(storedFilename: string): Promise<Buffer> {
  try {
    return await fs.readFile(getFilePath(storedFilename));
  } catch (error) {
    logger.error({ error, storedFilename }, 'Failed to read file');
    throw new StorageError('Failed to read file');
  }
}

export async function cleanupOldFiles(maxAgeMs: number): Promise<number> {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Cleaned up old files');
    }

    return deletedCount;
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup old files');
    throw new StorageError('Failed to cleanup old files');
  }
}

export default {
  initStorage,
  generateStorageFilename,
  calculateChecksum,
  saveFile,
  getFilePath,
  fileExists,
  deleteFile,
  getFileStats,
  readFile,
  cleanupOldFiles,
};

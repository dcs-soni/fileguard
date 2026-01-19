import NodeClam from 'clamscan';

import { config } from '../config/index.js';
import type { ClamScanResult } from '../types/index.js';
import { ScannerError, ScannerUnavailableError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let clamScanner: NodeClam | null = null;
let initPromise: Promise<void> | null = null;

async function doInitScanner(): Promise<void> {
  try {
    logger.info(
      { host: config.clamav.host, port: config.clamav.port },
      'Initializing ClamAV scanner'
    );

    clamScanner = await new NodeClam().init({
      removeInfected: false,
      quarantineInfected: false,
      scanRecursively: true,
      debugMode: config.env === 'development',

      clamdscan: {
        socket: false,
        host: config.clamav.host,
        port: config.clamav.port,
        timeout: config.clamav.timeout,
        localFallback: false,
        active: true,
      },

      clamscan: {
        active: false,
      },

      preference: 'clamdscan',
    });

    logger.info('ClamAV scanner initialized successfully');
  } catch (error) {
    initPromise = null;
    logger.error({ error }, 'Failed to initialize ClamAV scanner');
    throw new ScannerUnavailableError();
  }
}

export async function initScanner(): Promise<void> {
  if (clamScanner) {
    logger.debug('Scanner already initialized');
    return;
  }

  if (initPromise) {
    logger.debug('Scanner initialization in progress, waiting...');
    return initPromise;
  }

  initPromise = doInitScanner();
  return initPromise;
}

export async function scanFile(filePath: string): Promise<ClamScanResult> {
  if (!clamScanner) {
    await initScanner();
  }

  const startTime = Date.now();

  try {
    logger.info({ filePath }, 'Starting file scan');

    const result = await clamScanner!.scanFile(filePath);

    const scanDurationMs = Date.now() - startTime;

    const scanResult: ClamScanResult = {
      isInfected: result.isInfected,
      viruses: result.viruses,
      scannedFiles: 1,
      scanDurationMs,
    };

    logger.info(
      {
        filePath,
        isInfected: result.isInfected,
        viruses: result.viruses,
        scanDurationMs,
      },
      'File scan completed'
    );

    return scanResult;
  } catch (error) {
    const scanDurationMs = Date.now() - startTime;

    logger.error({ error, filePath, scanDurationMs }, 'File scan failed');

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      clamScanner = null;
      initPromise = null;
      throw new ScannerUnavailableError();
    }

    throw new ScannerError('Failed to scan file', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function scanDirectory(
  directoryPath: string
): Promise<ClamScanResult> {
  if (!clamScanner) {
    await initScanner();
  }

  const startTime = Date.now();

  try {
    logger.info({ directoryPath }, 'Starting directory scan');

    const result = await clamScanner!.scanDir(directoryPath);

    const scanDurationMs = Date.now() - startTime;

    const viruses: string[] = [];
    if (result.badFiles && result.badFiles.length > 0) {
      for (const badFile of result.badFiles) {
        if (typeof badFile === 'string') {
          viruses.push(badFile);
        }
      }
    }

    const scanResult: ClamScanResult = {
      isInfected: viruses.length > 0,
      viruses,
      scannedFiles: result.fileCount ?? 0,
      scanDurationMs,
    };

    logger.info(
      {
        directoryPath,
        isInfected: scanResult.isInfected,
        infectedCount: viruses.length,
        scannedFiles: scanResult.scannedFiles,
        scanDurationMs,
      },
      'Directory scan completed'
    );

    return scanResult;
  } catch (error) {
    const scanDurationMs = Date.now() - startTime;

    logger.error(
      { error, directoryPath, scanDurationMs },
      'Directory scan failed'
    );

    throw new ScannerError('Failed to scan directory', {
      directoryPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function scanBuffer(buffer: Buffer): Promise<ClamScanResult> {
  if (!clamScanner) {
    await initScanner();
  }

  const startTime = Date.now();

  try {
    logger.debug({ bufferSize: buffer.length }, 'Starting buffer scan');

    const result = await clamScanner!.scanStream(buffer);

    const scanDurationMs = Date.now() - startTime;

    const scanResult: ClamScanResult = {
      isInfected: result.isInfected,
      viruses: result.viruses,
      scannedFiles: 1,
      scanDurationMs,
    };

    logger.info(
      {
        bufferSize: buffer.length,
        isInfected: result.isInfected,
        scanDurationMs,
      },
      'Buffer scan completed'
    );

    return scanResult;
  } catch (error) {
    const scanDurationMs = Date.now() - startTime;

    logger.error(
      { error, bufferSize: buffer.length, scanDurationMs },
      'Buffer scan failed'
    );

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      clamScanner = null;
      initPromise = null;
      throw new ScannerUnavailableError();
    }

    throw new ScannerError('Failed to scan buffer', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function isScannerHealthy(): Promise<boolean> {
  try {
    if (!clamScanner) {
      await initScanner();
    }

    // Ping the daemon
    const version = await clamScanner!.getVersion();
    logger.debug({ version }, 'ClamAV health check passed');

    return true;
  } catch (error) {
    logger.warn({ error }, 'ClamAV health check failed');
    clamScanner = null;
    initPromise = null;
    return false;
  }
}

export async function getScannerVersion(): Promise<string | null> {
  try {
    if (!clamScanner) {
      await initScanner();
    }

    return await clamScanner!.getVersion();
  } catch (error) {
    logger.error({ error }, 'Failed to get scanner version');
    return null;
  }
}

export async function resetScanner(): Promise<void> {
  clamScanner = null;
  initPromise = null;
  await initScanner();
}

export default {
  initScanner,
  scanFile,
  scanDirectory,
  scanBuffer,
  isScannerHealthy,
  getScannerVersion,
  resetScanner,
};

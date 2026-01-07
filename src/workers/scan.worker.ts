import path from 'path';

import { Worker, Job } from 'bullmq';

import { config } from '../config/index.js';
import jobService from '../services/job.service.js';
import { redisConnection, SCAN_QUEUE_NAME } from '../services/queue.service.js';
import scannerService from '../services/scanner.service.js';
import storageService from '../services/storage.service.js';
import { JobStatus, ScanResultType } from '../types/index.js';
import type { ScanJobPayload } from '../types/index.js';
import logger from '../utils/logger.js';

const workerLogger = logger.child({ component: 'scan-worker' });

async function processScanJob(job: Job<ScanJobPayload>): Promise<void> {
  const { jobId, filePath } = job.data;
  const startTime = Date.now();

  workerLogger.info({ jobId, filePath, attempt: job.attemptsMade + 1 }, 'Processing scan job');

  try {
    await jobService.updateJobStatus(jobId, JobStatus.PROCESSING);

    const filename = path.basename(filePath);
    const fileExists = await storageService.fileExists(filename);

    if (!fileExists) {
      throw new Error(`File not found: ${filePath}`);
    }

    await scannerService.initScanner();

    const scanResult = await scannerService.scanFile(filePath);

    // Determine result type
    let resultType: ScanResultType;
    if (scanResult.error) {
      resultType = ScanResultType.ERROR;
    } else if (scanResult.isInfected) {
      resultType = ScanResultType.INFECTED;
    } else {
      resultType = ScanResultType.CLEAN;
    }

    // Save result and complete job (transactional)
    await jobService.completeJobWithResult(jobId, {
      result: resultType,
      isInfected: scanResult.isInfected,
      threatName: scanResult.viruses[0] ?? undefined,
      scanDurationMs: scanResult.scanDurationMs,
    });

    const totalDuration = Date.now() - startTime;

    workerLogger.info(
      {
        jobId,
        isInfected: scanResult.isInfected,
        threatName: scanResult.viruses[0],
        scanDurationMs: scanResult.scanDurationMs,
        totalDurationMs: totalDuration,
      },
      'Scan job completed successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    workerLogger.error(
      {
        jobId,
        error: errorMessage,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
        totalDurationMs: totalDuration,
      },
      'Scan job failed'
    );

    await jobService.updateJobStatus(jobId, JobStatus.FAILED, errorMessage);

    // Triggers BullMQ retry logic
    throw error;
  }
}

const worker = new Worker<ScanJobPayload>(SCAN_QUEUE_NAME, processScanJob, {
  connection: redisConnection,
  concurrency: config.worker.concurrency,

  lockDuration: config.worker.jobTimeoutMs,
  lockRenewTime: config.worker.jobTimeoutMs / 2,

  limiter: {
    max: 10,
    duration: 1000,
  },
});

worker.on('ready', () => {
  workerLogger.info(
    { concurrency: config.worker.concurrency },
    'Scan worker ready and listening for jobs'
  );
});

worker.on('active', (job) => {
  workerLogger.debug({ jobId: job.data.jobId, queueJobId: job.id }, 'Job became active');
});

worker.on('completed', (job) => {
  workerLogger.debug({ jobId: job.data.jobId, queueJobId: job.id }, 'Job completed');
});

worker.on('failed', (job, error) => {
  workerLogger.warn(
    {
      jobId: job?.data.jobId,
      queueJobId: job?.id,
      error: error.message,
      attempts: job?.attemptsMade,
    },
    'Job failed'
  );
});

worker.on('error', (error) => {
  workerLogger.error({ error }, 'Worker error');
});

worker.on('stalled', (jobId) => {
  workerLogger.warn({ jobId }, 'Job stalled');
});

async function shutdown(signal: string): Promise<void> {
  workerLogger.info({ signal }, 'Received shutdown signal');

  try {
    await worker.close();
    workerLogger.info('Worker closed gracefully');

    await redisConnection.quit();
    workerLogger.info('Redis connection closed');

    process.exit(0);
  } catch (error) {
    workerLogger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('uncaughtException', (error) => {
  workerLogger.fatal({ error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  workerLogger.fatal({ reason }, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});

workerLogger.info(
  {
    queue: SCAN_QUEUE_NAME,
    concurrency: config.worker.concurrency,
    redis: `${config.redis.host}:${config.redis.port}`,
  },
  'Starting scan worker'
);

export default worker;

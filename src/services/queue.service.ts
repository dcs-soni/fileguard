import { Queue, QueueEvents } from 'bullmq';
import Redis, { type Redis as RedisType } from 'ioredis';

import { config } from '../config/index.js';
import type { ScanJobPayload } from '../types/index.js';
import { QueueError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export const SCAN_QUEUE_NAME = 'file-scan';

// Shared between queue and worker

export const redisConnection: RedisType =
  new (Redis as unknown as typeof Redis.default)({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password ?? undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

redisConnection.on('connect', () => {
  logger.info('Redis connection established');
});

redisConnection.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

// Queue for file scanning job. Jobs are processed by workers in scan.worker.ts
export const scanQueue = new Queue<ScanJobPayload>(SCAN_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },

    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000, // keep at most
    },

    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 500,
    },
  },
});

/**
 * Queue events for monitoring
 */
export const scanQueueEvents = new QueueEvents(SCAN_QUEUE_NAME, {
  connection: redisConnection,
});

// Queue Operations
export async function enqueueScanJob(
  jobId: string,
  filePath: string,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  try {
    const payload: ScanJobPayload = {
      jobId,
      filePath,
      attempt: 1,
    };

    const job = await scanQueue.add('scan-file', payload, {
      priority: options?.priority ?? 0,
      delay: options?.delay ?? 0,
      jobId, // Use database job ID as queue job ID for easy tracking
    });

    logger.info({ jobId, queueJobId: job.id }, 'Job added to scan queue');

    return job.id ?? jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'Failed to enqueue scan job');
    throw new QueueError('Failed to add job to queue');
  }
}

export async function getJobPosition(jobId: string): Promise<number | null> {
  try {
    const job = await scanQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    if (state === 'waiting') {
      // Get all waiting jobs and find position
      const waitingJobs = await scanQueue.getWaiting();
      const index = waitingJobs.findIndex((j) => j.id === jobId);
      return index >= 0 ? index + 1 : null;
    }

    return null;
  } catch (error) {
    logger.error({ error, jobId }, 'Failed to get job position');
    return null;
  }
}

export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const counts = await scanQueue.getJobCounts();

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get queue stats');
    throw new QueueError('Failed to get queue statistics');
  }
}

export async function pauseQueue(): Promise<void> {
  await scanQueue.pause();
  logger.info('Scan queue paused');
}

export async function resumeQueue(): Promise<void> {
  await scanQueue.resume();
  logger.info('Scan queue resumed');
}

export async function cleanQueue(
  status: 'completed' | 'failed',
  maxAge: number
): Promise<number> {
  const removed = await scanQueue.clean(maxAge, 1000, status);
  logger.info({ status, removed: removed.length }, 'Queue cleaned');
  return removed.length;
}

export async function isQueueHealthy(): Promise<boolean> {
  try {
    await redisConnection.ping();
    return true;
  } catch {
    return false;
  }
}

export async function closeQueue(): Promise<void> {
  logger.info('Closing queue connections');
  await scanQueueEvents.close();
  await scanQueue.close();
  await redisConnection.quit();
}

export default {
  scanQueue,
  scanQueueEvents,
  redisConnection,
  enqueueScanJob,
  getJobPosition,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  isQueueHealthy,
  closeQueue,
};

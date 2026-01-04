import { Router, Request, Response } from 'express';

import jobService from '../../services/job.service.js';
import queueService from '../../services/queue.service.js';
import {
  JobStatus,
  type JobStatusResponse,
  type ApiErrorResponse,
  type JobProgress,
  type ScanResultSummary,
} from '../../types/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ValidationError } from '../../utils/errors.js';

const router = Router();

interface StatusParams {
  jobId: string;
}

async function getJobProgress(jobId: string, status: JobStatus): Promise<JobProgress> {
  switch (status) {
    case JobStatus.PENDING: {
      const position = await queueService.getJobPosition(jobId);
      return {
        stage: 'queued',
        percentage: 10,
        message: position
          ? `Position ${position} in queue`
          : 'Waiting in queue',
      };
    }

    case JobStatus.PROCESSING:
      return {
        stage: 'scanning',
        percentage: 50,
        message: 'Scanning file with ClamAV',
      };

    case JobStatus.COMPLETED:
      return {
        stage: 'complete',
        percentage: 100,
        message: 'Scan complete',
      };

    case JobStatus.FAILED:
      return {
        stage: 'complete',
        percentage: 100,
        message: 'Scan failed',
      };

    case JobStatus.CANCELLED:
      return {
        stage: 'complete',
        percentage: 100,
        message: 'Scan cancelled',
      };

    default:
      return {
        stage: 'queued',
        percentage: 0,
        message: 'Unknown status',
      };
  }
}


function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

router.get(
  '/:jobId',
  asyncHandler(async (
    req: Request<StatusParams, JobStatusResponse | ApiErrorResponse>,
    res: Response<JobStatusResponse | ApiErrorResponse>
  ): Promise<void> => {
    const { jobId } = req.params;

    if (!isValidUUID(jobId)) {
      throw new ValidationError('Invalid job ID format. Must be a valid UUID.');
    }

    const job = await jobService.getJobByIdOrThrow(jobId);

    const progress = await getJobProgress(jobId, job.status);

    // Get scan result if job is completed
    let result: ScanResultSummary | null = null;
    if (job.status === JobStatus.COMPLETED) {
      const scanResult = await jobService.getScanResultByJobId(jobId);
      if (scanResult) {
        result = {
          isInfected: scanResult.isInfected,
          threatName: scanResult.threatName,
          scanDurationMs: scanResult.scanDurationMs,
        };
      }
    }

    res.json({
      success: true,
      data: {
        jobId: job.id,
        filename: job.originalFilename,
        status: job.status,
        progress,
        result,
        timestamps: {
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
        },
      },
    });
  })
);


// Get queue statistics (no specific job).
// Returns overall system status and queue metrics.
 
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const queueStats = await queueService.getQueueStats();

    res.json({
      success: true,
      data: {
        queue: queueStats,
        message: 'Use GET /status/:jobId to check a specific job',
      },
    });
  })
);

export default router;

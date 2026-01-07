import { Router, Request, Response } from 'express';

import jobService from '../../services/job.service.js';
import queueService from '../../services/queue.service.js';
import storageService from '../../services/storage.service.js';
import type { ScanUploadResponse, ApiErrorResponse } from '../../types/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { uploadSingle, handleUploadError } from '../middleware/upload.js';

const router = Router();

interface ScanRequestBody {
  priority?: string;
}

router.post(
  '/',
  uploadSingle,
  handleUploadError,
  asyncHandler(
    async (
      req: Request<object, ScanUploadResponse | ApiErrorResponse, ScanRequestBody>,
      res: Response<ScanUploadResponse | ApiErrorResponse>
    ): Promise<void> => {
      if (!req.file) {
        throw new ValidationError('No file provided. Use "file" as the field name.');
      }

      const { file } = req;

      // Validate filename is not empty or only whitespace
      const trimmedFilename = file.originalname.trim();
      if (!trimmedFilename || trimmedFilename === '.' || trimmedFilename === '..') {
        throw new ValidationError('Invalid filename provided.');
      }

      // NaN guard for priority parsing
      const priority = parseInt(req.body.priority ?? '0', 10) || 0;

      logger.info(
        {
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          priority,
        },
        'Processing file upload'
      );

      const storedFile = await storageService.saveFile(file.path, file.originalname);

      // Wrap job creation and queue enqueue in try-catch to cleanup file on failure
      let job;
      try {
        job = await jobService.createJob({
          originalFilename: file.originalname,
          storedFilename: storedFile.storedFilename,
          filePath: storedFile.filePath,
          fileSize: storedFile.fileSize,
          mimeType: file.mimetype,
          checksum: storedFile.checksum,
          priority: Math.min(Math.max(priority, 0), 10), // Clamp 0-10
        });

        await queueService.enqueueScanJob(job.id, storedFile.filePath, {
          priority: job.priority,
        });
      } catch (error) {
        try {
          await storageService.deleteFile(storedFile.storedFilename);
          logger.info(
            { storedFilename: storedFile.storedFilename },
            'Cleaned up orphaned file after job creation failure'
          );
        } catch (cleanupError) {
          logger.error(
            { cleanupError, storedFilename: storedFile.storedFilename },
            'Failed to cleanup orphaned file'
          );
        }
        throw error;
      }

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          filename: job.originalFilename,
          fileSize: job.fileSize,
          status: job.status,
          message: 'File queued for scanning. Use GET /status/:jobId to check progress.',
        },
      });
    }
  )
);

router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const [queueHealthy, dbHealthy] = await Promise.all([
      queueService.isQueueHealthy(),
      (async (): Promise<boolean> => {
        const { isDatabaseHealthy } = await import('../../db/client.js');
        return isDatabaseHealthy();
      })(),
    ]);

    const isHealthy = queueHealthy && dbHealthy;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: {
        queue: queueHealthy ? 'healthy' : 'unhealthy',
        database: dbHealthy ? 'healthy' : 'unhealthy',
      },
    });
  })
);

export default router;

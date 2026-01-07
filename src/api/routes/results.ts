import { Router, Request, Response } from 'express';

import jobService from '../../services/job.service.js';
import type { InfectedFilesResponse, ApiErrorResponse } from '../../types/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

interface ResultsQuery {
  page?: string;
  limit?: string;
}

router.get(
  '/',
  asyncHandler(
    async (
      req: Request<object, InfectedFilesResponse | ApiErrorResponse, object, ResultsQuery>,
      res: Response<InfectedFilesResponse | ApiErrorResponse>
    ): Promise<void> => {
      const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit ?? '20', 10) || 20, 1), 100);

      const { files, total } = await jobService.getInfectedFiles(page, limit);

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: {
          totalInfected: total,
          files: files.map((file) => ({
            jobId: file.jobId,
            filename: file.filename,
            fileSize: file.fileSize,
            threatName: file.threatName,
            threatCategory: file.threatCategory,
            scannedAt: file.scannedAt.toISOString(),
          })),
        },
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    }
  )
);

router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // Query database for statistics
    const { query } = await import('../../db/client.js');

    const result = await query<{
      total_jobs: string;
      pending_jobs: string;
      processing_jobs: string;
      completed_jobs: string;
      failed_jobs: string;
      infected_files: string;
      avg_scan_duration_ms: string;
    }>('SELECT * FROM scan_statistics');

    const stats = result.rows[0];

    if (!stats) {
      res.json({
        success: true,
        data: {
          totalJobs: 0,
          pendingJobs: 0,
          processingJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          infectedFiles: 0,
          avgScanDurationMs: 0,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        totalJobs: parseInt(stats.total_jobs, 10),
        pendingJobs: parseInt(stats.pending_jobs, 10),
        processingJobs: parseInt(stats.processing_jobs, 10),
        completedJobs: parseInt(stats.completed_jobs, 10),
        failedJobs: parseInt(stats.failed_jobs, 10),
        infectedFiles: parseInt(stats.infected_files, 10),
        avgScanDurationMs: Math.round(parseFloat(stats.avg_scan_duration_ms) || 0),
      },
    });
  })
);

router.get(
  '/recent',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(
      Math.max(parseInt((req.query.limit as string) ?? '10', 10) || 10, 1),
      50
    );

    const { query } = await import('../../db/client.js');

    const result = await query<{
      id: string;
      original_filename: string;
      file_size: string;
      status: string;
      created_at: Date;
      completed_at: Date | null;
      scan_result: string | null;
      is_infected: boolean | null;
      threat_name: string | null;
      scan_duration_ms: number | null;
    }>(
      `SELECT * FROM job_details
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: {
        jobs: result.rows.map((row) => ({
          jobId: row.id,
          filename: row.original_filename,
          fileSize: parseInt(row.file_size, 10),
          status: row.status,
          scanResult: row.scan_result,
          isInfected: row.is_infected,
          threatName: row.threat_name,
          scanDurationMs: row.scan_duration_ms,
          createdAt: row.created_at.toISOString(),
          completedAt: row.completed_at?.toISOString() ?? null,
        })),
      },
    });
  })
);

export default router;

import { v4 as uuidv4 } from 'uuid';

import { query, queryOne, withTransaction } from '../db/client.js';
import {
  JobStatus,
  type Job,
  type JobRow,
  type CreateJobInput,
  type ScanResult,
  type ScanResultRow,
  type ScanResultType,
} from '../types/index.js';
import { NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

function mapRowToJob(row: JobRow): Job {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    filePath: row.file_path,
    fileSize: parseInt(row.file_size, 10),
    mimeType: row.mime_type,
    checksum: row.checksum,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapRowToScanResult(row: ScanResultRow): ScanResult {
  return {
    id: row.id,
    jobId: row.job_id,
    result: row.result,
    isInfected: row.is_infected,
    threatName: row.threat_name,
    threatCategory: row.threat_category,
    threatDescription: row.threat_description,
    scannerVersion: row.scanner_version,
    definitionVersion: row.definition_version,
    scanDurationMs: row.scan_duration_ms,
    scannedAt: row.scanned_at,
  };
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const id = uuidv4();

  const result = await query<JobRow>(
    `INSERT INTO jobs (
      id, original_filename, stored_filename, file_path,
      file_size, mime_type, checksum, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      id,
      input.originalFilename,
      input.storedFilename,
      input.filePath,
      input.fileSize,
      input.mimeType ?? null,
      input.checksum ?? null,
      input.priority ?? 0,
    ]
  );

  const job = mapRowToJob(result.rows[0]!);
  logger.info({ jobId: job.id, filename: job.originalFilename }, 'Job created');

  return job;
}

export async function getJobById(jobId: string): Promise<Job | null> {
  const row = await queryOne<JobRow>('SELECT * FROM jobs WHERE id = $1', [
    jobId,
  ]);

  return row ? mapRowToJob(row) : null;
}

export async function getJobByIdOrThrow(jobId: string): Promise<Job> {
  const job = await getJobById(jobId);

  if (!job) {
    throw new NotFoundError('Job', jobId);
  }

  return job;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  errorMessage?: string
): Promise<Job> {
  const updates: string[] = ['status = $2'];
  const params: unknown[] = [jobId, status];
  let paramIndex = 3;

  if (status === JobStatus.PROCESSING) {
    updates.push('started_at = NOW()');
    updates.push(`attempts = attempts + 1`);
  }

  if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
    updates.push('completed_at = NOW()');
  }

  if (errorMessage !== undefined) {
    updates.push(`error_message = $${paramIndex}`);
    params.push(errorMessage);
    paramIndex++;
  }

  const result = await query<JobRow>(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Job', jobId);
  }

  const job = mapRowToJob(result.rows[0]!);
  logger.info({ jobId, status, errorMessage }, 'Job status updated');

  return job;
}

export async function getPendingJobs(limit = 10): Promise<Job[]> {
  const result = await query<JobRow>(
    `SELECT * FROM jobs
     WHERE status = 'pending'
     ORDER BY priority DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRowToJob);
}

export async function getRetryableJobs(limit = 10): Promise<Job[]> {
  const result = await query<JobRow>(
    `SELECT * FROM jobs
     WHERE status = 'failed'
     AND attempts < max_attempts
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRowToJob);
}

export async function saveScanResult(
  jobId: string,
  resultData: {
    result: ScanResultType;
    isInfected: boolean;
    threatName?: string;
    threatCategory?: string;
    threatDescription?: string;
    scannerVersion?: string;
    definitionVersion?: string;
    scanDurationMs: number;
  }
): Promise<ScanResult> {
  const id = uuidv4();

  const result = await query<ScanResultRow>(
    `INSERT INTO scan_results (
      id, job_id, result, is_infected, threat_name, threat_category,
      threat_description, scanner_version, definition_version, scan_duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      id,
      jobId,
      resultData.result,
      resultData.isInfected,
      resultData.threatName ?? null,
      resultData.threatCategory ?? null,
      resultData.threatDescription ?? null,
      resultData.scannerVersion ?? null,
      resultData.definitionVersion ?? null,
      resultData.scanDurationMs,
    ]
  );

  const scanResult = mapRowToScanResult(result.rows[0]!);
  logger.info(
    {
      jobId,
      isInfected: resultData.isInfected,
      threatName: resultData.threatName,
    },
    'Scan result saved'
  );

  return scanResult;
}

export async function getScanResultByJobId(
  jobId: string
): Promise<ScanResult | null> {
  const row = await queryOne<ScanResultRow>(
    'SELECT * FROM scan_results WHERE job_id = $1',
    [jobId]
  );

  return row ? mapRowToScanResult(row) : null;
}

export async function getInfectedFiles(
  page = 1,
  limit = 20
): Promise<{
  files: Array<{
    jobId: string;
    filename: string;
    fileSize: number;
    threatName: string;
    threatCategory: string | null;
    scannedAt: Date;
  }>;
  total: number;
}> {
  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM scan_results WHERE is_infected = true'
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const result = await query<{
    job_id: string;
    original_filename: string;
    file_size: string;
    threat_name: string;
    threat_category: string | null;
    scanned_at: Date;
  }>(
    `SELECT
       sr.job_id,
       j.original_filename,
       j.file_size,
       sr.threat_name,
       sr.threat_category,
       sr.scanned_at
     FROM scan_results sr
     JOIN jobs j ON sr.job_id = j.id
     WHERE sr.is_infected = true
     ORDER BY sr.scanned_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return {
    files: result.rows.map((row) => ({
      jobId: row.job_id,
      filename: row.original_filename,
      fileSize: parseInt(row.file_size, 10),
      threatName: row.threat_name,
      threatCategory: row.threat_category,
      scannedAt: row.scanned_at,
    })),
    total,
  };
}

export async function completeJobWithResult(
  jobId: string,
  scanResult: {
    result: ScanResultType;
    isInfected: boolean;
    threatName?: string;
    scanDurationMs: number;
  }
): Promise<void> {
  await withTransaction(async (client) => {
    // Save scan result
    await client.query(
      `INSERT INTO scan_results (
        id, job_id, result, is_infected, threat_name, scan_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv4(),
        jobId,
        scanResult.result,
        scanResult.isInfected,
        scanResult.threatName ?? null,
        scanResult.scanDurationMs,
      ]
    );

    await client.query(
      `UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [jobId]
    );
  });

  logger.info(
    { jobId, isInfected: scanResult.isInfected },
    'Job completed with result'
  );
}

export default {
  createJob,
  getJobById,
  getJobByIdOrThrow,
  updateJobStatus,
  getPendingJobs,
  getRetryableJobs,
  saveScanResult,
  getScanResultByJobId,
  getInfectedFiles,
  completeJobWithResult,
};

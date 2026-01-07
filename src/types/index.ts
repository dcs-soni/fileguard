export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ScanResultType {
  CLEAN = 'clean',
  INFECTED = 'infected',
  ERROR = 'error',
}

export interface Job {
  id: string;
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  checksum: string | null;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface JobRow {
  [key: string]: unknown;
  id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  file_size: string; // PostgreSQL BIGINT comes as string
  mime_type: string | null;
  checksum: string | null;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface ScanResult {
  id: string;
  jobId: string;
  result: ScanResultType;
  isInfected: boolean;
  threatName: string | null;
  threatCategory: string | null;
  threatDescription: string | null;
  scannerVersion: string | null;
  definitionVersion: string | null;
  scanDurationMs: number;
  scannedAt: Date;
}

export interface ScanResultRow {
  [key: string]: unknown;
  id: string;
  job_id: string;
  result: ScanResultType;
  is_infected: boolean;
  threat_name: string | null;
  threat_category: string | null;
  threat_description: string | null;
  scanner_version: string | null;
  definition_version: string | null;
  scan_duration_ms: number;
  scanned_at: Date;
}

export interface ScanUploadResponse {
  success: true;
  data: {
    jobId: string;
    filename: string;
    fileSize: number;
    status: JobStatus;
    message: string;
  };
}

export interface JobStatusResponse {
  success: true;
  data: {
    jobId: string;
    filename: string;
    status: JobStatus;
    progress: JobProgress;
    result: ScanResultSummary | null;
    timestamps: {
      createdAt: string;
      startedAt: string | null;
      completedAt: string | null;
    };
  };
}

export interface JobProgress {
  stage: 'queued' | 'downloading' | 'scanning' | 'complete';
  percentage: number;
  message: string;
}

export interface ScanResultSummary {
  isInfected: boolean;
  threatName: string | null;
  scanDurationMs: number;
}

export interface InfectedFilesResponse {
  success: true;
  data: {
    totalInfected: number;
    files: InfectedFileInfo[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface InfectedFileInfo {
  jobId: string;
  filename: string;
  fileSize: number;
  threatName: string;
  threatCategory: string | null;
  scannedAt: string;
}

export interface CreateJobInput {
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  fileSize: number;
  mimeType?: string;
  checksum?: string;
  priority?: number;
}

export interface ClamScanResult {
  isInfected: boolean;
  viruses: string[];
  scannedFiles: number;
  scanDurationMs: number;
  error?: string;
}

export interface ScanJobPayload {
  jobId: string;
  filePath: string;
  attempt: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  QUEUE_ERROR = 'QUEUE_ERROR',
  SCANNER_ERROR = 'SCANNER_ERROR',
  SCANNER_UNAVAILABLE = 'SCANNER_UNAVAILABLE',
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  logLevel: string;

  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
  };

  redis: {
    host: string;
    port: number;
    password: string | undefined;
  };

  storage: {
    type: 'local' | 's3';
    uploadDir: string;
    maxFileSizeMb: number;
  };

  clamav: {
    host: string;
    port: number;
    timeout: number;
  };

  worker: {
    concurrency: number;
    jobTimeoutMs: number;
  };
}

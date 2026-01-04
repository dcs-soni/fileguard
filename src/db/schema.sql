-- This schema is automatically executed when PostgreSQL container starts
-- for the first time (via docker-entrypoint-initdb.d)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE job_status AS ENUM (
    'pending',      -- Job created, waiting in queue
    'processing',   -- Worker picked up the job
    'completed',    -- Scan finished successfully
    'failed',       -- Scan encountered an error
    'cancelled'     -- Job was cancelled
);

CREATE TYPE scan_result AS ENUM (
    'clean',        -- No threats detected
    'infected',     -- Virus/malware detected
    'error'         -- Could not scan (corrupted file, etc.)
);

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    checksum VARCHAR(64),  
    
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,  
    
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE scan_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    
    result scan_result NOT NULL,
    is_infected BOOLEAN NOT NULL DEFAULT false,
    
    threat_name VARCHAR(255),
    threat_category VARCHAR(100),
    threat_description TEXT,
    
    scanner_version VARCHAR(50),
    definition_version VARCHAR(50),
    scan_duration_ms INTEGER NOT NULL,
    
    scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fast lookup by status (for worker polling and dashboard)
CREATE INDEX idx_jobs_status ON jobs(status);

-- Fast lookup for pending jobs ordered by priority and creation time
CREATE INDEX idx_jobs_pending_priority ON jobs(status, priority DESC, created_at ASC)
    WHERE status = 'pending';

CREATE INDEX idx_jobs_checksum ON jobs(checksum) WHERE checksum IS NOT NULL;

CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- Results lookup by infection status
CREATE INDEX idx_scan_results_infected ON scan_results(is_infected, scanned_at DESC)
    WHERE is_infected = true;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE VIEW job_details AS
SELECT 
    j.id,
    j.original_filename,
    j.file_size,
    j.mime_type,
    j.status,
    j.created_at,
    j.completed_at,
    sr.result AS scan_result,
    sr.is_infected,
    sr.threat_name,
    sr.scan_duration_ms
FROM jobs j
LEFT JOIN scan_results sr ON j.id = sr.job_id;

CREATE VIEW scan_statistics AS
SELECT 
    COUNT(*) AS total_jobs,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') AS processing_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    (
        SELECT COUNT(*) FROM scan_results WHERE is_infected = true
    ) AS infected_files,
    (
        SELECT COALESCE(AVG(scan_duration_ms), 0) FROM scan_results
    ) AS avg_scan_duration_ms
FROM jobs;

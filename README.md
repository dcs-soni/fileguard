# FileGuard

A file virus scanning service built with Node.js, TypeScript, and ClamAV. Files are queued and processed asynchronously with full job tracking.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start PostgreSQL, Redis, and ClamAV
docker-compose up -d

# Terminal 1: Start API server
npm run dev

# Terminal 2: Start worker
npm run dev:worker
```

## API Endpoints

| Method | Endpoint         | Description                |
| ------ | ---------------- | -------------------------- |
| POST   | `/scan`          | Upload a file for scanning |
| GET    | `/status/:jobId` | Check scan job status      |
| GET    | `/results`       | List infected files        |
| GET    | `/results/stats` | Get scanning statistics    |
| GET    | `/health`        | Service health check       |

## Usage

```bash
# Upload a file
curl -X POST http://localhost:3000/scan -F "file=@./document.pdf"

# Check status
curl http://localhost:3000/status/{jobId}

# View infected files
curl http://localhost:3000/results
```

## Configuration

Key environment variables (see `.env.example`):

| Variable           | Default   | Description        |
| ------------------ | --------- | ------------------ |
| PORT               | 3000      | API server port    |
| CLAMAV_HOST        | localhost | ClamAV daemon host |
| MAX_FILE_SIZE_MB   | 50        | Max upload size    |
| WORKER_CONCURRENCY | 2         | Parallel scan jobs |

## License

MIT

import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import resultsRouter from './api/routes/results.js';
import scanRouter from './api/routes/scan.js';
import statusRouter from './api/routes/status.js';
import { config } from './config/index.js';
import { closePool, isDatabaseHealthy } from './db/client.js';
import { closeQueue, isQueueHealthy } from './services/queue.service.js';
import { isScannerHealthy, getScannerVersion } from './services/scanner.service.js';
import { initStorage } from './services/storage.service.js';
import { asyncHandler } from './utils/asyncHandler.js';
import logger from './utils/logger.js';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: config.env === 'production' ? false : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));

// URL-encoded body parsing
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req: Request, _res: Response, next) => {
  logger.info(
    {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    },
    'Incoming request'
  );
  next();
});

app.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    try {
      const [dbHealthy, queueHealthy, scannerHealthy] = await Promise.all([
        isDatabaseHealthy(),
        isQueueHealthy(),
        isScannerHealthy(),
      ]);

      const scannerVersion = await getScannerVersion();

      const isHealthy = dbHealthy && queueHealthy;
      // Note: scanner might be slow to start, for now don't require it for basic health

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          database: dbHealthy ? 'up' : 'down',
          queue: queueHealthy ? 'up' : 'down',
          scanner: scannerHealthy ? 'up' : 'down',
          scannerVersion,
        },
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

app.use('/scan', scanRouter);
app.use('/status', statusRouter);
app.use('/results', resultsRouter);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'File Virus Scanner API',
    version: '1.0.0',
    endpoints: {
      'POST /scan': 'Upload a file for virus scanning',
      'GET /status/:jobId': 'Check scan job status',
      'GET /results': 'View infected files',
      'GET /results/stats': 'Get scanning statistics',
      'GET /results/recent': 'Get recent scan activity',
      'GET /health': 'Health check endpoint',
    },
    documentation: 'https://github.com/dcs-soni/fileguard',
  });
});

app.use(notFoundHandler);

app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    await initStorage();
    logger.info('Storage initialized');

    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          env: config.env,
          pid: process.pid,
        },
        `Server started on http://localhost:${config.port}`
      );
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Received shutdown signal');

      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
        await closePool();
        logger.info('Database connections closed');

        await closeQueue();
        logger.info('Queue connections closed');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      void shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void shutdown('unhandledRejection');
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

void startServer();

export default app;

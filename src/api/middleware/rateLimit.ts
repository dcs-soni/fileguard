import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

interface RateLimitErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

function createRateLimitResponse(message: string): RateLimitErrorResponse {
  return {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message,
    },
  };
}

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.env === 'development' ? 100 : 50,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request): string => {
    // Express populates req.ip correctly when trust proxy is configured
    if (!req.ip) {
      logger.warn({ path: req.path }, 'Request without identifiable IP');
      return 'unidentified-' + Date.now();
    }
    return req.ip;
  },

  handler: (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent'],
      },
      'Upload rate limit exceeded'
    );
    res
      .status(429)
      .json(
        createRateLimitResponse(
          'Too many upload requests. Please wait before uploading more files.'
        )
      );
  },

  skip: (req: Request): boolean => {
    return req.path === '/health';
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: config.env === 'development' ? 200 : 100,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request): string => {
    if (!req.ip) {
      return 'unidentified-' + Date.now();
    }
    return req.ip;
  },

  handler: (_req: Request, res: Response) => {
    res
      .status(429)
      .json(createRateLimitResponse('Too many requests. Please slow down.'));
  },
});

export default {
  uploadRateLimiter,
  apiRateLimiter,
};

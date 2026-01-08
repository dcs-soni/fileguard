import { pino, Logger } from 'pino';

import { config, isDev } from '../config/index.js';

export const logger: Logger = pino({
  level: config.logLevel,

  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  base: {
    env: config.env,
  },

  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  redact: {
    paths: ['password', 'authorization', 'cookie', '*.password', '*.secret'],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export default logger;

import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.cookie', 'password', 'passwordHash', 'token', '*.password'],
    censor: '[redacted]',
  },
});

import pino from 'pino';
import { env } from '../env';

// Paylaşılan pino instance. Prisma + requestLogger + servisler aynı logger kullanır
// → LOG_LEVEL filtresi her yerden geçerli olur.
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  // Credential'ları asla log'a düşürme — CI/log aggregation'ı public olabilir,
  // Bearer token + cookie buradan exfiltrate edilebilir.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
});

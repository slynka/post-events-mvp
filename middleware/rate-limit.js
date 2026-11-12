const buckets = new Map();
const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = 0;

export function rateLimit({ windowMs = 60_000, max = 60, keyPrefix = 'api' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup >= CLEANUP_INTERVAL_MS) {
      for (const [key, bucket] of buckets) {
        if (now - bucket.start >= windowMs) buckets.delete(key);
      }
      lastCleanup = now;
    }
    const key = `${keyPrefix}:${req.ip}`;
    const current = buckets.get(key);
    if (!current || now - current.start >= windowMs) {
      if (!current && buckets.size >= MAX_BUCKETS) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'RATE_LIMITED' });
      }
      buckets.set(key, { start: now, count: 1 });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - current.start)) / 1000)));
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    next();
  };
}

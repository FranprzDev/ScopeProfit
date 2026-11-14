const DEFAULT_WINDOW_MS = 60_000;
const MAX_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      if (this.buckets.size >= MAX_KEYS) this.prune(now);
      bucket = { windowStart: now, count: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + this.windowMs - now) / 1000)),
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets)
      if (now - bucket.windowStart >= this.windowMs) this.buckets.delete(key);
    if (this.buckets.size >= MAX_KEYS) {
      const oldest = [...this.buckets.entries()].sort(
        (a, b) => a[1].windowStart - b[1].windowStart,
      );
      for (const [key] of oldest.slice(0, this.buckets.size - MAX_KEYS + 1))
        this.buckets.delete(key);
    }
  }
}

let singleton: RateLimiter | undefined;

export function mcpRateLimiter(): RateLimiter {
  if (!singleton) singleton = new RateLimiter(Number(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? 120));
  return singleton;
}

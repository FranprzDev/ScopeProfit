import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from '../src/rate-limit';

test('allows up to the limit and blocks the next request', () => {
  const limiter = new RateLimiter(3, () => 1000);
  for (let i = 0; i < 3; i++) assert.equal(limiter.check('ip').allowed, true);
  const blocked = limiter.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test('separate keys have separate buckets', () => {
  const limiter = new RateLimiter(1, () => 1000);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
});

test('window resets after 60 seconds', () => {
  let now = 1000;
  const limiter = new RateLimiter(1, () => now);
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, false);
  now += 60_001;
  assert.equal(limiter.check('ip').allowed, true);
});

test('remaining counts down inside the window', () => {
  const limiter = new RateLimiter(2, () => 1000);
  assert.equal(limiter.check('ip').remaining, 1);
  assert.equal(limiter.check('ip').remaining, 0);
  assert.equal(limiter.check('ip').remaining, 0);
});

test('consent limiter uses a 15 minute window', () => {
  let now = 1000;
  const limiter = new RateLimiter(2, () => now, 15 * 60_000);
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, false);
  now += 60_001;
  assert.equal(limiter.check('ip').allowed, false);
  now += 14 * 60_000;
  assert.equal(limiter.check('ip').allowed, true);
});

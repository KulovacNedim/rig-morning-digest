import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

// Fixtures live in a temp runs dir; the real runs/ is read-only.
const NORMAL = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-11-09';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// Written out of job order on purpose: rows must come back sorted by job.
const normalLines = [
  line({ at: '2026-11-01T23:00:01+01:00', job: 'zeta/archive', status: 'ok', owner: 'rook' }),
  line({ at: '2026-11-01T23:00:02+01:00', job: 'alpha/sync', status: 'retry', owner: 'lane-07', error: 'timeout' }),
  line({ at: '2026-11-01T23:30:02+01:00', job: 'alpha/sync', status: 'retry', owner: 'lane-07', error: 'timeout again' }),
  line({ at: '2026-11-02T00:00:02+01:00', job: 'alpha/sync', status: 'ok', owner: 'lane-07' }),
  line({ at: '2026-11-01T23:00:03+01:00', job: 'mid/check', status: 'fail', owner: null, error: 'disk full' }),
];

const badLines = [
  line({ at: '2026-11-03T23:00:01+01:00', job: 'good/one', status: 'ok', owner: 'rook' }),
  'this is not json {{{',
  line({ at: '2026-11-03T23:00:02+01:00', job: 'good/two', status: 'ok', owner: 'rook' }),
  line({ hello: 'valid json, wrong shape' }),
];

let runsDir: string;

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

async function digestJson(night: string): Promise<NightDigest> {
  const res = await app().request(`/api/digest/${night}`);
  expect(res.status).toBe(200);
  return (await res.json()) as NightDigest;
}

// Position of each job name in the page; -1 if absent.
function jobOrderInHtml(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a normal night with every job and the null owner as —', async () => {
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha/sync', 'mid/check', 'zeta/archive']) expect(html).toContain(job);
    expect(html).toContain('—');
    expect(html).not.toMatch(/nothing ran/i);
  });

  it('404s for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('404s for something that is not a night', async () => {
    const res = await app().request('/digest/not-a-night');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/nothing ran/i);
  });

  it('still renders a night with bad lines, with the good rows present', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('good/one');
    expect(html).toContain('good/two');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as rows sorted by job, per the contract', async () => {
    const body = await digestJson(NORMAL);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync', 'mid/check', 'zeta/archive']);

    const alpha = body.rows[0] as DigestRow;
    expect(alpha).toMatchObject({
      owner: 'lane-07',
      runs: 3,
      retries: 2,
      lastStatus: 'ok',
      lastError: 'timeout again',
      firstAt: '2026-11-01T23:00:02+01:00',
      lastAt: '2026-11-02T00:00:02+01:00',
    });

    const mid = body.rows[1] as DigestRow;
    expect(mid).toMatchObject({ owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full' });
  });

  it('404s for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns no rows for the empty night', async () => {
    const body = await digestJson(EMPTY);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts bad lines and keeps the other rows', async () => {
    const body = await digestJson(BAD);
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['good/one', 'good/two']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('lists the same jobs in the same order for %s', async (night) => {
    const body = await digestJson(night);
    const html = await (await app().request(`/digest/${night}`)).text();
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobOrderInHtml(html, jobs)).toEqual(jobs);
  });
});

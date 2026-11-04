import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 5 jobs and counts 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.night).toBe('2026-10-28');
    expect(digest!.rows).toHaveLength(5);
    expect(digest!.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('aggregates runs, retries, status, error and times with the offset kept', () => {
    const row = (job: string) => digest!.rows.find((r) => r.job === job);
    expect(row('lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('rig/rotate-logs')).toMatchObject({ runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('keeps a null owner', () => {
    expect(digest!.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1 });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a missing night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'latest.jsonl'), '');
    expect(readNight(dir, 'latest')).toBeNull();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('keeps owner null and counts wrongly shaped lines without throwing', () => {
    const lines = [
      '{"at":"2026-11-02T01:00:00+01:00","job":"a/job","status":"ok","owner":null}',
      '{"at":"2026-11-02T02:00:00+01:00","job":"a/job","status":"retry","owner":null,"error":"boom"}',
      '{"at":"2026-11-02T03:00:00+01:00","job":"b/job","status":"maybe","owner":"x"}',
      '[1,2,3]',
      'null',
      '{"job":"c/job","status":"ok","owner":"x"}',
      'not json',
    ];
    writeFileSync(join(dir, '2026-11-02.jsonl'), lines.join('\n') + '\n');
    const digest = readNight(dir, '2026-11-02');
    expect(digest).toEqual({
      night: '2026-11-02',
      badLines: 5,
      rows: [
        {
          job: 'a/job',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'retry',
          lastError: 'boom',
          firstAt: '2026-11-02T01:00:00+01:00',
          lastAt: '2026-11-02T02:00:00+01:00',
        },
      ],
    });
  });
});

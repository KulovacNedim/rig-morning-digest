// Plan morning-digest § 1. The contract § 2a–2d build against; issue #1 fills in readNight.
// Import types and readNight from this file: the path stays the same once the reader lands.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. Times are the log's `at` strings, offset kept (never converted to UTC).
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null; views show `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // most recent `error` seen for this job, or null
  firstAt: string; // `at` of the job's first line (file order)
  lastAt: string; // `at` of the job's last line (file order)
};

// rows are sorted by job, so the page and the JSON share one order.
// badLines counts lines that are not valid JSON or not the line shape; they are never thrown.
export type NightDigest = { night: string; rows: DigestRow[]; badLines: number };

// null = no file for that night (or `night` isn't YYYY-MM-DD): the route answers 404.
// An empty file is { rows: [], badLines: 0 }: the page says "nothing ran".
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

// The real reader (issue #1), re-exported so callers keep importing from this file.
export { readNight } from './read.js';

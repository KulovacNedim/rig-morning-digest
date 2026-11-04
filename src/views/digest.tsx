import type { DigestRow, NightDigest } from '../digest/types.js';

const MISSING = '—';
const RETRY_WARN_AT = 3;

function isWarn(row: DigestRow): boolean {
  return row.retries >= RETRY_WARN_AT || row.lastStatus === 'fail';
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr class={isWarn(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? MISSING}</td>
                <td>{row.runs}</td>
                <td>{row.retries >= RETRY_WARN_AT ? `${row.retries} ⚠` : row.retries}</td>
                <td>{row.lastStatus === 'fail' ? 'fail ⚠' : row.lastStatus}</td>
                <td>{row.lastError ?? MISSING}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 ? (
        <p class="mute">
          <small>{digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'} skipped</small>
        </p>
      ) : null}
    </>
  );
}

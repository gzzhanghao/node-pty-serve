import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../src/cli.ts');

const SOCKET_PATH = `/tmp/pty-serve-test-${process.pid}.sock`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpRequest(
  socketPath: string,
  method: string,
  urlPath: string,
  body?: string | Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        method,
        path: urlPath,
        headers:
          body !== undefined
            ? { 'Content-Length': Buffer.byteLength(body) }
            : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function waitForSocket(
  socketPath: string,
  retries = 20,
  interval = 100,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await httpRequest(socketPath, 'GET', '/');
      return;
    } catch {
      await sleep(interval);
    }
  }
  throw new Error(`Socket ${socketPath} never became available`);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('pty-serve CLI', () => {
  let proc: ChildProcess;

  before(async () => {
    // Spawn: tsx src/cli.ts --socket <path> -- cat
    proc = spawn(
      'pnpm',
      ['exec', 'tsx', CLI_PATH, '--socket', SOCKET_PATH, 'cat'],
      {
        cwd: path.resolve(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    proc.stderr?.on('data', () => {
      // Suppress stderr noise during tests; uncomment to debug:
      // process.stderr.write(d);
    });

    await waitForSocket(SOCKET_PATH);
  });

  after(async () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
    // Give the process a moment to clean up the socket file
    await sleep(200);
  });

  // -------------------------------------------------------------------------
  // /resize
  // -------------------------------------------------------------------------
  describe('POST /resize', () => {
    it('returns 200 with { code: 0 } on valid dimensions', async () => {
      const res = await httpRequest(
        SOCKET_PATH,
        'POST',
        '/resize',
        JSON.stringify({ cols: 120, rows: 40 }),
      );
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });

    it('returns 400 when body is not JSON', async () => {
      const res = await httpRequest(SOCKET_PATH, 'POST', '/resize', 'not-json');
      assert.equal(res.status, 400);
      const parsed = JSON.parse(res.body);
      assert.equal(parsed.code, -1);
      assert.ok(typeof parsed.message === 'string');
    });

    it('returns 400 when method is GET (parseBody rejects non-POST)', async () => {
      const res = await httpRequest(SOCKET_PATH, 'GET', '/resize');
      assert.equal(res.status, 400);
      assert.equal(JSON.parse(res.body).code, -1);
    });
  });

  // -------------------------------------------------------------------------
  // /write
  // -------------------------------------------------------------------------
  describe('POST /write', () => {
    it('returns 200 after writing data to the PTY', async () => {
      const res = await httpRequest(SOCKET_PATH, 'POST', '/write', 'hello\n');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });

    it('returns 200 for an empty write', async () => {
      const res = await httpRequest(SOCKET_PATH, 'POST', '/write', '');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // /clear
  // -------------------------------------------------------------------------
  describe('GET /clear', () => {
    it('returns 200 with { code: 0 }', async () => {
      const res = await httpRequest(SOCKET_PATH, 'GET', '/clear');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // /pause & /resume
  // -------------------------------------------------------------------------
  describe('GET /pause and GET /resume', () => {
    it('pause returns 200', async () => {
      const res = await httpRequest(SOCKET_PATH, 'GET', '/pause');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });

    it('resume returns 200 after pause', async () => {
      const res = await httpRequest(SOCKET_PATH, 'GET', '/resume');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Unknown routes
  // -------------------------------------------------------------------------
  describe('unknown routes', () => {
    it('returns 200 with { code: 0 } (handleRequest falls through silently)', async () => {
      const res = await httpRequest(SOCKET_PATH, 'GET', '/nonexistent');
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.body), { code: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // /kill  (run last – it terminates the PTY process)
  // -------------------------------------------------------------------------
  describe('POST /kill', () => {
    it('kills the PTY process and the server closes', async () => {
      const res = await httpRequest(
        SOCKET_PATH,
        'POST',
        '/kill',
        JSON.stringify({ signal: 'SIGTERM' }),
      );
      // The server may close before or after sending the response; either is fine.
      // We just assert that if we got a response it was a success.
      if (res.status !== 0) {
        assert.equal(res.status, 200);
      }

      // Wait for the child process to exit
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once('exit', () => resolve());
        // Timeout safety
        setTimeout(resolve, 3000);
      });

      assert.ok(
        proc.exitCode !== null || proc.killed,
        'Process should have exited after /kill',
      );
    });
  });
});

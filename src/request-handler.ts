import { IncomingMessage, ServerResponse } from 'http';
import { IPty } from 'node-pty';

export async function handlePtyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ptyProcess: IPty,
) {
  try {
    await handleRequest(ptyProcess, req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0 }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: -1, message: String(error) }));
  }
}

async function handleRequest(ptyProcess: IPty, req: IncomingMessage) {
  switch (req.url) {
    case '/resize': {
      const data = await parseBody<{ cols: number; rows: number }>(req);
      ptyProcess.resize(data.cols, data.rows);
      return;
    }

    case '/clear':
      ptyProcess.clear();
      return;

    case '/write':
      for await (const chunk of req) {
        ptyProcess.write(chunk);
      }
      return;

    case '/kill': {
      const data = await parseBody<{ signal?: string }>(req);
      ptyProcess.kill(data.signal);
      return;
    }

    case '/pause':
      ptyProcess.pause();
      return;

    case '/resume':
      ptyProcess.resume();
      return;
  }
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  if (req.method !== 'POST') {
    throw new Error(`Can't parse body for ${req.method} request`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

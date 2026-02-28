import { createServer, IncomingMessage } from 'node:http';

import { program } from 'commander';
import * as pty from 'node-pty';

program
  .option('-o, --options <string>', 'JSON options forwarded to `node-pty`')
  .option('-s, --socket <string>', 'Unix socket path to listen on')
  .option('-h, --hostname <string>', 'Hostname for TCP listener')
  .option('-p, --port <number>', 'TCP port to listen on')
  .allowExcessArguments()
  .parse();

const opts = program.opts<{
  options: string;
  socket?: string;
  hostname?: string;
  port?: number;
}>();

const server = createServer();

const ptyProcess = pty.spawn(
  program.args[0],
  program.args.slice(1),
  opts.options && JSON.parse(opts.options),
);

console.log('PTY spawned with PID:', ptyProcess.pid);

ptyProcess.onData((chunk) => {
  process.stdout.write(chunk);
});

let hasExit = false;

ptyProcess.onExit((info) => {
  hasExit = true;
  server.close();
  process.exit(info.exitCode);
});

const EXIT_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

EXIT_SIGNALS.forEach((signal) => {
  process.on(signal, () => {
    if (!hasExit) {
      ptyProcess.kill(process.platform === 'win32' ? undefined : signal);
    }
    server.close();
    process.exit(0);
  });
});

server.on('request', async (req, res) => {
  try {
    await handleRequest(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0 }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: -1, message: String(error) }));
  }
});

if (opts.socket) {
  server.listen(opts.socket);
} else {
  server.listen(opts.port, opts.hostname);
}

async function handleRequest(req: IncomingMessage) {
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

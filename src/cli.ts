import { unlinkSync } from 'node:fs';
import { createServer } from 'node:http';

import { program } from 'commander';
import { spawn } from 'node-pty';

import { handlePtyRequest } from './request-handler.js';

program
  .enablePositionalOptions()
  .passThroughOptions()
  .name('pty-serv')
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

server.on('listening', () => {
  const ptyProcess = spawn(
    program.args[0],
    program.args.slice(1),
    opts.options && JSON.parse(opts.options),
  );

  ptyProcess.onData((chunk) => {
    process.stdout.write(chunk);
  });

  ptyProcess.onExit((info) => {
    server.close(() => {
      process.exit(info.exitCode);
    });
    setTimeout(() => {
      process.exit(info.exitCode);
    }, 0).unref();
  });

  server.on('request', (req, res) => {
    handlePtyRequest(req, res, ptyProcess);
  });
});

if (opts.socket) {
  tryUnlink(opts.socket);
  server.listen(opts.socket);
} else if (opts.port != null) {
  server.listen(opts.port, opts.hostname);
} else {
  program
    .addHelpText('after', '\nEither --socket or --port must be specified')
    .help({ error: true });
}

function tryUnlink(filename: string) {
  try {
    unlinkSync(filename);
  } catch {
    // noop
  }
}

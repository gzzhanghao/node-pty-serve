import path from 'node:path';

import { IPtyForkOptions, IWindowsPtyForkOptions } from 'node-pty';

export interface SpawnPtyOptions {
  /**
   * Options forwarded to `node-pty`
   */
  ptyOptions?: IPtyForkOptions | IWindowsPtyForkOptions;
  /**
   * Unix socket path to listen on
   */
  socket?: string;
  /**
   * Hostname for TCP listener
   */
  hostname?: string;
  /**
   * TCP port to listen on
   */
  port?: number;
}

export function getSpawnPtyArgs(
  command: string,
  args?: string[],
  options?: SpawnPtyOptions,
) {
  const nodeArgs = [path.resolve(import.meta.dirname, 'cli.js')];
  if (options?.ptyOptions) {
    nodeArgs.push('--options', JSON.stringify(options.ptyOptions));
  }
  if (options?.socket) {
    nodeArgs.push('--socket', options.socket);
  }
  if (options?.hostname) {
    nodeArgs.push('--hostname', options.hostname);
  }
  if (options?.port != null) {
    nodeArgs.push('--port', String(options.port));
  }
  nodeArgs.push(command);
  if (args) {
    nodeArgs.push(...args);
  }
  return nodeArgs;
}

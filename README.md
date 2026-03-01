# pty-serv

Spawns a command in a [node-pty](https://github.com/microsoft/node-pty) pseudo-terminal and exposes an HTTP endpoint to interact with it at runtime.

## Usage

Run a shell, then send a command from another process:

```bash
# Terminal 1 – start the PTY server
npx pty-serv -s /tmp/pty-serv-0.sock -- bash

# Terminal 2 – interact with it
curl --unix-socket /tmp/pty-serv-0.sock 'http://[::]/write' --data $'echo hello\r'
```

## CLI Options

| Flag | Description |
|------|-------------|
| `-s, --socket <path>` | Unix socket path to listen on |
| `-p, --port <number>` | TCP port to listen on |
| `-h, --hostname <string>` | Hostname for TCP listener (default: all interfaces) |
| `-o, --options <json>` | JSON options forwarded to [node-pty](https://github.com/microsoft/node-pty) |

## HTTP Endpoint

#### `POST /write`

Write raw data to the PTY's stdin. The request body is streamed directly to the PTY.

```bash
curl 'http://[::]/write' -d $'ls\r'
```

#### `POST /resize`

Resize the PTY window.

```bash
curl 'http://[::]/resize' -d '{"cols":220,"rows":50}'
```

#### `POST /kill`

Send a signal to the PTY process.

```bash
curl 'http://[::]/kill' -d '{"signal":"SIGTERM"}'
```

#### `POST /clear`

Clear the PTY screen buffer.

```bash
curl 'http://[::]/clear' -X POST
```

#### `POST /pause` / `POST /resume`

Pause or resume data flow from the PTY.

```bash
curl 'http://[::]/pause' -X POST
curl 'http://[::]/resume' -X POST
```

## JS APIs

### `getSpawnPtyArgs(command, args?, options?)`

Returns the argument array needed to spawn the PTY server as a child process.

```ts
import { spawn } from 'node:child_process';
import { getSpawnPtyArgs } from 'pty-serv';

const nodeArgs = getSpawnPtyArgs('bash', [], {
  socket: '/tmp/pty-serv-0.sock',
  ptyOptions: { cols: 220, rows: 50 },
});

const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' });
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | `string` | The command to run inside the PTY |
| `args` | `string[]` | Arguments passed to the command |
| `options` | `SpawnPtyOptions` | Optional configuration (see below) |

#### `SpawnPtyOptions`

| Option | Type | Description |
|--------|------|-------------|
| `socket` | `string` | Unix socket path to listen on |
| `port` | `number` | TCP port to listen on |
| `hostname` | `string` | Hostname for TCP listener (default: all interfaces) |
| `ptyOptions` | `IPtyForkOptions \| IWindowsPtyForkOptions` | Options forwarded to [node-pty](https://github.com/microsoft/node-pty) |

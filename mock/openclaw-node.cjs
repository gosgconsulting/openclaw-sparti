/* eslint-disable no-console */
/**
 * Windows-friendly mock OpenClaw CLI used by tests.
 *
 * Mirrors the behaviors that the wrapper server relies on:
 * - `openclaw gateway run ...` starts an HTTP + WebSocket server (JSON-RPC-ish)
 * - `openclaw onboard ...` writes openclaw.json in OPENCLAW_STATE_DIR
 * - `openclaw config set --json key value` merges JSON into config
 * - minimal stubs for commands used by /onboard and /lite endpoints
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function hasArg(args, name) {
  return args.includes(name);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function setDeep(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const args = argv.slice(1);

const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(process.cwd(), '.openclaw');
const configPath = path.join(stateDir, 'openclaw.json');

async function cmdGateway() {
  // Expected shape from wrapper: gateway run --bind loopback --port <port> --auth token --token <token> --verbose
  const port = parseInt(getArgValue(args, '--port') || '18789', 10);

  // Minimal HTTP server to satisfy health checks
  const server = http.createServer((req, res) => {
    const body = JSON.stringify({
      status: 'ok',
      mock: true,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });

  // Lazy-load ws (it is in dependencies)
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'mock', ts: Date.now() },
      })
    );

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type !== 'req') return;

      if (msg.method === 'connect') {
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { protocol: 3 } }));
        return;
      }

      if (msg.method === 'sessions.list') {
        ws.send(
          JSON.stringify({
            type: 'res',
            id: msg.id,
            ok: true,
            result: { count: 0, sessions: [] },
          })
        );
        return;
      }

      if (msg.method === 'config.get') {
        const rawConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '{}';
        const hash = crypto.createHash('sha256').update(rawConfig).digest('hex').slice(0, 16);
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { raw: rawConfig, hash } }));
        return;
      }

      if (msg.method === 'config.set') {
        const raw = msg.params?.raw;
        if (raw) {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            writeJson(configPath, parsed);
          } catch {
            // ignore
          }
        }
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { applied: true } }));
        return;
      }

      if (msg.method === 'usage.cost') {
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { daily: [], totals: {} } }));
        return;
      }

      ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: false, error: { message: `unknown method: ${msg.method}` } }));
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[mock-gateway] Listening on 127.0.0.1:${port} (HTTP + WebSocket)`);
  });

  const shutdown = () => {
    try {
      wss.close();
      server.close(() => process.exit(0));
    } catch {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function cmdOnboard() {
  // Wrapper calls: onboard --non-interactive --accept-risk --json [auth flags...]
  const jsonMode = hasArg(args, '--json');

  fs.mkdirSync(stateDir, { recursive: true });

  const config = {
    agent: { name: 'openclaw-dev', model: 'anthropic/claude-sonnet-4' },
    platforms: {},
    gateway: { port: 18789 },
  };
  writeJson(configPath, config);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ success: true, message: 'Configuration written', configPath }) + '\n');
  } else {
    process.stdout.write(`[mock-onboard] Configuration written to ${configPath}\n`);
  }
  process.exit(0);
}

function cmdConfig() {
  const sub = args[0] || '';
  const rest = args.slice(1);
  if (sub !== 'set') {
    process.stderr.write('Usage: openclaw config set --json KEY VALUE\n');
    process.exit(1);
  }

  const jsonMode = rest[0] === '--json';
  const withoutJson = jsonMode ? rest.slice(1) : rest;
  const key = withoutJson[0];
  const valueRaw = withoutJson[1];
  if (!key || valueRaw == null) {
    process.stderr.write('Usage: openclaw config set --json KEY VALUE\n');
    process.exit(1);
  }

  const existing = readJson(configPath, {});
  let value;
  try {
    value = JSON.parse(valueRaw);
  } catch {
    value = valueRaw;
  }
  setDeep(existing, key, value);
  writeJson(configPath, existing);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ success: true, key }) + '\n');
  } else {
    process.stdout.write(`[mock-config] Set ${key}\n`);
  }
  process.exit(0);
}

function cmdPlugins() {
  // Wrapper calls: openclaw plugins install <pkg>
  const sub = args[0] || '';
  if (sub === 'install') {
    process.stdout.write(JSON.stringify({ success: true }) + '\n');
    process.exit(0);
  }
  process.stdout.write('[]\n');
  process.exit(0);
}

function cmdMemory() {
  // Minimal stubs so /lite endpoints don't blow up in tests
  const sub = args[0] || '';
  const jsonMode = hasArg(args, '--json');
  if (sub === 'index') {
    process.stdout.write('ok\n');
    process.exit(0);
  }
  if (sub === 'status') {
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ status: { fts: { available: true }, files: 0 }, scan: { totalFiles: 0 } }) + '\n');
    } else {
      process.stdout.write('active\n');
    }
    process.exit(0);
  }
  if (sub === 'search') {
    process.stdout.write((jsonMode ? '[]' : '') + '\n');
    process.exit(0);
  }
  process.stdout.write((jsonMode ? '[]' : '') + '\n');
  process.exit(0);
}

switch (command) {
  case 'gateway':
    if (args[0] === 'run') {
      cmdGateway();
      break;
    }
    process.stderr.write('Usage: openclaw gateway run ...\n');
    process.exit(1);
    break;
  case 'onboard':
    cmdOnboard();
    break;
  case 'config':
    cmdConfig();
    break;
  case 'plugins':
    cmdPlugins();
    break;
  case 'memory':
    cmdMemory();
    break;
  case '--version':
  case 'version':
    process.stdout.write('openclaw 0.0.0-mock\n');
    process.exit(0);
    break;
  default:
    process.stdout.write('OpenClaw CLI (mock)\n');
    process.exit(0);
}


import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// End-to-end coverage for the pi extension's server-spawning path. These tests
// drive the *built* extension exactly as pi does and assert that a real server
// process comes up — catching the class of bug where the extension references
// a server entry point that does not exist in the build output (issues #5, #3,
// and the --webui-listen path of #1).

// PID_FILE is bound to homedir() when the extension module first loads, so HOME
// must be redirected into a temp dir before the dynamic import below.
const HOME_DIR = mkdtempSync(join(tmpdir(), "pi-web-ui-home-"));
process.env.HOME = HOME_DIR;

let webuiExtension;
const spawned = new Set();

before(async () => {
  ({ default: webuiExtension } = await import("../dist/extension/index.js"));
});

beforeEach(() => {
  // each test starts from a clean pid file so runStart never short-circuits on
  // a stale "already running" check.
  const pidFile = join(HOME_DIR, ".pi", "extensions", "webui.pid");
  if (existsSync(pidFile)) unlinkSync(pidFile);
});

after(() => {
  for (const pid of spawned) {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
  rmSync(HOME_DIR, { recursive: true, force: true });
});

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function setupServerEnv() {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-ui-run-"));
  process.env.PI_AGENT_DIR = join(dir, "agent");
  process.env.PI_SESSION_DIR = join(dir, "sessions");
  process.env.PI_PROJECT_CWD = join(dir, "proj");
  process.env.PI_WEBUI_HOST = "127.0.0.1";
}

function readPid() {
  const pidFile = join(HOME_DIR, ".pi", "extensions", "webui.pid");
  return parseInt(readFileSync(pidFile, "utf8").trim(), 10);
}

// poll the bind address until the server answers or we give up. a non-existent
// server entry exits immediately, so this resolves false well before timeout.
async function waitForListening(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function makeFakePi(flags = {}) {
  const commands = {};
  return {
    commands,
    registerFlag: () => {},
    registerCommand: (name, def) => { commands[name] = def; },
    on: () => {},
    getFlag: (name) => flags[name],
  };
}

test("/webui start brings up a reachable server", async () => {
  setupServerEnv();
  const port = await freePort();
  process.env.PI_WEBUI_PORT = String(port);

  const pi = makeFakePi();
  webuiExtension(pi);
  const notes = [];
  const ctx = { ui: { notify: (m, l) => notes.push([l, m]) } };
  await pi.commands.webui.handler("start", ctx);

  assert.ok(existsSync(join(HOME_DIR, ".pi", "extensions", "webui.pid")), "pid file written");
  spawned.add(readPid());
  assert.equal(await waitForListening(port), true, "server should be reachable after /webui start");
});

test("--webui-listen binds the requested address", async () => {
  setupServerEnv();
  const port = await freePort();
  delete process.env.PI_WEBUI_PORT;

  const pi = makeFakePi({ "webui-listen": `127.0.0.1:${port}`, webui: false });
  webuiExtension(pi);
  // the auto-start path runs on a deferred tick; let it fire.
  await new Promise((r) => setImmediate(r));

  assert.ok(existsSync(join(HOME_DIR, ".pi", "extensions", "webui.pid")), "pid file written");
  spawned.add(readPid());
  assert.equal(await waitForListening(port), true, "server should bind the --webui-listen address");
});

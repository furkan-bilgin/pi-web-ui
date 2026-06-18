/**
 * webui extension
 *
 * provides a /webui command to control the pi-web-ui server.
 *
 * usage:
 * /webui            - show interactive picker
 * /webui start      - launch the server
 * /webui status     - check if the server is running
 * /webui stop       - stop the server
 * /webui open       - open the webui in the default browser
 */

import { spawn, exec, execSync, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";

// Resolve npx path at init time in case pi spawns extensions with a clean/minimal PATH.
const NPX_PATH = (() => {
  try {
    return execSync("which npx", { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    return "npx";
  }
})();
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const PID_FILE = join(homedir(), ".pi", "extensions", "webui.pid");
const WEBUI_URL = "http://127.0.0.1:4096";
// window after spawn during which an exit is treated as a launch failure
const SERVER_STARTUP_GRACE_MS = 2000;

// Notify always writes to stderr so output is visible regardless of TUI mode.
function notify(msg: string, level: string = "info") {
  process.stderr.write(`[pi-web-ui] ${level}: ${msg}\n`);
}

// Tracks a server spawned by --webui in this pi process so we can terminate
// it on session_shutdown. /webui start spawns detached and is NOT tracked
// here -- those servers intentionally outlive pi.
let ownedChild: ChildProcess | null = null;

const SUBCOMMANDS: Array<{ name: string; label: string }> = [
  { name: "start", label:  "start  - launch the server" },
  { name: "status", label: "status - check server status" },
  { name: "stop", label:   "stop   - stop the server" },
  { name: "open", label:   "open   - open webui in browser" },
];

function getPid(): number | null {
  try {
    if (existsSync(PID_FILE)) {
      return parseInt(readFileSync(PID_FILE, "utf8").trim(), 10) || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setPid(pid: number) {
  try {
    const dir = dirname(PID_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PID_FILE, pid.toString());
  } catch (error) {
    console.error(`failed to write pid file: ${error}`);
  }
}

function clearPid() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openUrl(url: string) {
  const platform = process.platform;
  let command = "";
  if (platform === "darwin") command = `open "${url}"`;
  else if (platform === "win32") command = `start "" "${url}"`;
  else command = `xdg-open "${url}"`;

  exec(command);
}

interface StartOptions {
  listen?: string;
  // When true, the spawned server is tied to this pi process (terminated on
  // session_shutdown). When false, the server is detached and survives pi exit.
  owned?: boolean;
}

function resolveUrl(listen?: string): string {
  if (!listen) return WEBUI_URL;
  const m = listen.match(/:?(\d+)$/);
  const port = m ? m[1] : "4096";
  const host = listen.startsWith(":")
    ? "127.0.0.1"
    : listen.replace(/:?\d+$/, "") || "127.0.0.1";
  return `http://${host}:${port}`;
}

function runStart(_ctx: ExtensionCommandContext, opts: StartOptions = {}) {
  const pid = getPid();
  if (pid && isRunning(pid)) {
    notify(`pi-web-ui is already running (pid: ${pid})`, "info");
    return;
  }
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(__dirname, "..", "..");
    const logFile = join(homedir(), ".pi", "extensions", "webui-server.log");
    const logFd = openSync(logFile, "a");

    // Ensure the client build exists so the new React app is served instead of
    // the legacy vanilla JS app that lacks base path support.
    const clientBuildIndex = join(projectRoot, "dist", "client", "index.html");
    if (!existsSync(clientBuildIndex)) {
      notify("building client (vite build)…", "info");
      try {
        // Use local vite from node_modules if available, otherwise fall back to npx.
        const localVite = join(projectRoot, "node_modules", ".bin", "vite");
        const viteCmd = existsSync(localVite) ? localVite : `${NPX_PATH} --yes vite`;
        execSync(`${viteCmd} build`, {
          cwd: projectRoot,
          stdio: "inherit",
          timeout: 180_000,
        });
      } catch (buildErr) {
        const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
        notify(`client build failed: ${msg}; check that node_modules has vite installed`, "error");
      }
    }

    // Try pre-built dist/server first, then fall back to TS source
    let serverPath = join(projectRoot, "dist", "server", "index.js");
    if (!existsSync(serverPath)) {
      serverPath = join(__dirname, "..", "server", "index.ts");
    }
    const isTs = serverPath.endsWith(".ts");
    // Use tsx to run TS source (handles import resolution)
    const runtime = isTs ? "npx" : "node";
    const execArgs: string[] = [];
    if (isTs) {
      execArgs.push("--yes", "tsx");
    }
    execArgs.push(serverPath);
    if (opts.listen) execArgs.push("--listen", opts.listen);
    const detached = !opts.owned;
    const bin = isTs ? NPX_PATH : "node";
    // Use a stable CWD — pi's extension tmp dir may be cleaned up after
    // extension loading, causing ENOENT on process.cwd() when npm or other
    // tools try to resolve the working dir.
    // At the same time, tell the server what the real project directory is
    // (captured at extension load time before pi potentially changes CWD).
    const child = spawn(bin, execArgs, {
      cwd: homedir(),
      env: {
        ...process.env,
        PI_PROJECT_CWD: PI_CWD,
      },
      detached,
      stdio: ["ignore", logFd, logFd],
    });
    const newPid = child.pid!;
    setPid(newPid);
    let booting = true;
    const fail = (message: string) => {
      if (!booting) return;
      booting = false;
      clearPid();
      if (ownedChild === child) ownedChild = null;
      notify(message, "error");
    };
    child.once("error", (err) => fail(`failed to launch pi-web-ui: ${err.message}`));
    child.once("exit", (code) => {
      if (code) fail(`pi-web-ui exited unexpectedly (code ${code}); check the install`);
    });
    setTimeout(() => { booting = false; }, SERVER_STARTUP_GRACE_MS).unref();
    if (detached) {
      child.unref();
    } else {
      ownedChild = child;
      child.once("exit", () => {
        if (ownedChild === child) ownedChild = null;
        clearPid();
      });
    }
    const url = resolveUrl(opts.listen);
    notify(`launching pi-web-ui server at ${url} (pid: ${newPid})`, "info");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify(`failed to launch pi-web-ui: ${message}`, "error");
  }
}

function runStatus(_ctx: ExtensionCommandContext) {
  const pid = getPid();
  if (pid && isRunning(pid)) {
    notify(`pi-web-ui is running (pid: ${pid}) at ${WEBUI_URL}`, "info");
  } else {
    notify("pi-web-ui is not running", "info");
  }
}

function runStop(_ctx: ExtensionCommandContext) {
  const pid = getPid();
  if (!pid || !isRunning(pid)) {
    notify("pi-web-ui is not running", "info");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    clearPid();
    notify(`stopped pi-web-ui (pid: ${pid})`, "info");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify(`failed to stop pi-web-ui: ${message}`, "error");
  }
}

function runOpen(_ctx: ExtensionCommandContext) {
  const pid = getPid();
  if (!pid || !isRunning(pid)) {
    notify("pi-web-ui is not running. run /webui start first.", "error");
    return;
  }
  openUrl(WEBUI_URL);
  notify(`opening ${WEBUI_URL} in browser`, "info");
}

function dispatch(name: string, ctx: ExtensionCommandContext): boolean {
  switch (name) {
    case "start": runStart(ctx); return true;
    case "status": runStatus(ctx); return true;
    case "stop": runStop(ctx); return true;
    case "open": runOpen(ctx); return true;
    default: return false;
  }
}

async function pickAndRun(ctx: ExtensionCommandContext) {
  const labels = SUBCOMMANDS.map((s) => s.label);
  const selected = await ctx.ui.select("pi-web-ui", labels);
  if (!selected) return;
  const sub = SUBCOMMANDS.find((s) => s.label === selected);
  if (sub) dispatch(sub.name, ctx);
}

// Capture pi's CWD at extension load time (before pi might change to tmp dir).
// The server uses this to scope sessions to the directory where pi was launched.
const PI_CWD = process.cwd();

export default function webuiExtension(pi: ExtensionAPI) {
  pi.registerCommand("webui", {
    description: "control the pi-web-ui server",
    handler: async (args, ctx) => {
      const command = (args || "").trim().toLowerCase();

      if (!command || command === "help") {
        await pickAndRun(ctx);
        return;
      }

      if (!dispatch(command, ctx)) {
        notify(`unknown subcommand: ${command}`, "error");
        await pickAndRun(ctx);
      }
    },
  });

  const killOwned = () => {
    const child = ownedChild;
    if (!child) return;
    ownedChild = null;
    clearPid();
    // Remove from the event loop so process.exit() isn't blocked by the
    // child handle staying alive while the server shuts down.
    child.unref();
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    // Aggressive force-kill after a short grace period
    setTimeout(() => {
      try {
        child?.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 200).unref();
  };

  pi.on("session_shutdown", killOwned);
  // Catch additional exit paths so the server doesn't outlive pi.
  // Must use process.exit() directly (not inside setImmediate) because the
  // child handle may keep the loop alive and prevent setImmediate from firing.
  process.on("exit", killOwned);
  process.on("SIGINT", () => { killOwned(); process.exit(130); });
  process.on("SIGTERM", () => { killOwned(); process.exit(143); });

  // Auto-start via environment variables:
  //   PI_WEBUI=1              start server on default port
  //   PI_WEBUI_LISTEN=:5000   start server on custom address
  setImmediate(() => {
    const fromEnv = process.env.PI_WEBUI === "1" || process.env.PI_WEBUI === "true";
    const listenFromEnv = (process.env.PI_WEBUI_LISTEN || "").trim();
    if (!fromEnv && !listenFromEnv) return;
    const runOpts: StartOptions = { listen: listenFromEnv || undefined, owned: true };
    notify(`auto-start triggered (listen=${runOpts.listen || "default"})`, "info");
    runStart({} as unknown as ExtensionCommandContext, runOpts);
  });
}

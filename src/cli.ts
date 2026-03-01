import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = os.platform() === 'win32';

function getPortForSession(session: string): number {
  let hash = 0;
  for (let i = 0; i < session.length; i++) {
    hash = (hash << 5) - hash + session.charCodeAt(i);
    hash |= 0;
  }
  return 49152 + (Math.abs(hash) % 16383);
}

function getSocketPath(session: string): string {
  const socketDir =
    process.env.AGENT_BROWSER_SOCKET_DIR ||
    process.env.XDG_RUNTIME_DIR ||
    path.join(os.homedir(), '.agent-browser');
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }
  return path.join(socketDir, `${session}.sock`);
}

async function isDaemonRunning(session: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);

    const cleanup = () => {
      socket.destroy();
      socket.removeAllListeners();
    };

    socket.on('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.on('error', () => {
      cleanup();
      resolve(false);
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(false);
    });

    if (isWindows) {
      socket.connect(getPortForSession(session), '127.0.0.1');
    } else {
      socket.connect(getSocketPath(session));
    }
  });
}

function startDaemon(session: string, headed: boolean = false, profile?: string) {
  const daemonPath = path.join(__dirname, 'daemon.ts');
  const env: any = {
    ...process.env,
    AGENT_BROWSER_SESSION: session,
    AGENT_BROWSER_DAEMON: '1',
  };

  if (headed) env.AGENT_BROWSER_HEADED = '1';
  if (profile) env.AGENT_BROWSER_PROFILE = profile;

  const child = spawn('npx', ['tsx', daemonPath], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(__dirname),
    env,
    shell: true,
  });

  child.unref();
}

async function sendCommand(session: string, command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';

    socket.on('connect', () => {
      socket.write(
        JSON.stringify({ id: Math.random().toString(36).substring(7), ...command }) + '\n'
      );
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.endsWith('\n')) {
        try {
          resolve(JSON.parse(data.trim()));
          socket.destroy();
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    if (isWindows) {
      socket.connect(getPortForSession(session), '127.0.0.1');
    } else {
      socket.connect(getSocketPath(session));
    }
  });
}

function showHelp() {
  console.log(`
Agent-Browser CLI - Control browser sessions and tabs

Usage:
  agent-browser [--session <name>] [--headed] [--profile <path>] <action> [args]

Options:
  --session <name>  Use a specific browser session (default: "default")
  --headed          Start the browser in headed mode (visible window)
  --profile <path>  Path to a persistent browser profile directory
  --help, -h        Show this help message

Basic Actions:
  launch [url]      Launch a new browser session (and navigate to URL)
  open [url]        Same as launch
  navigate <url>    Navigate the active tab to a URL
  snapshot          Get an accessibility tree snapshot of the current page
  screenshot <path> Save a screenshot of the current page
  close             Close the current session and daemon
  stop              Same as close

Tab Management:
  tab list          List all tabs in the current window
  tab new [url]     Open a new tab
  tab switch <idx>  Switch to tab at index
  tab close <idx>   Close tab at index

Window Management:
  window list       List all open windows
  window <id> tab <action>  Perform tab actions on a specific window

Session Management:
  session list      List all active background sessions

Storage Actions:
  storage get <type> [key]      Get localStorage or sessionStorage (type: local|session)
  storage clear <type> [key]    Clear storage items
`);
}

async function main() {
  const args = process.argv.slice(2);
  let session = 'default';
  let headless = true;
  let headed = false;
  let profile: string | undefined;

  // Simple arg parser
  const cleanArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session' && args[i + 1]) {
      session = args[i + 1];
      i++;
    } else if (args[i] === '--headed') {
      headless = false;
      headed = true;
    } else if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
      return;
    } else {
      cleanArgs.push(args[i]);
    }
  }

  const action = cleanArgs[0];
  if (!action || action === 'help') {
    showHelp();
    process.exit(action === 'help' ? 0 : 1);
  }

  // Handle multi-word actions and modifiers like "window 0 tab list"
  let finalAction = action;
  let remainingArgs = cleanArgs.slice(1);
  let modifierWindowIndex: number | undefined = undefined;

  const multiWordActions = [
    'session',
    'tab',
    'window',
    'cookies',
    'storage',
    'state',
    'record',
    'trace',
    'profiler',
    'har',
    'video',
    'auth',
    'screencast',
  ];

  if (
    action === 'window' &&
    remainingArgs[0] &&
    !isNaN(parseInt(remainingArgs[0], 10)) &&
    remainingArgs[1] === 'tab'
  ) {
    modifierWindowIndex = parseInt(remainingArgs[0], 10);
    const subAction = remainingArgs[2];
    if (subAction) {
      finalAction = `tab_${subAction}`;
      remainingArgs = remainingArgs.slice(3);
    }
  } else if (multiWordActions.includes(action) && remainingArgs[0]) {
    // Multi-word sub-actions like "tab new" -> "tab_new"
    finalAction = `${action}_${remainingArgs[0]}`;
    remainingArgs = remainingArgs.slice(1);
  }

  // Check for --window flag in remaining args
  const windowFlagIdx = remainingArgs.indexOf('--window');
  if (windowFlagIdx !== -1 && remainingArgs[windowFlagIdx + 1]) {
    modifierWindowIndex = parseInt(remainingArgs[windowFlagIdx + 1], 10);
    // Note: we don't slice it out here to avoid messing up index-based remainingArgs,
    // but we'll use it in command construction.
  }

  // Auto-start daemon if needed
  const isRunning = await isDaemonRunning(session);
  const isPassiveAction =
    finalAction === 'close' ||
    finalAction === 'stop' ||
    finalAction === 'window_list' ||
    finalAction === 'tab_list';

  if (!isRunning) {
    if (isPassiveAction) {
      if (finalAction === 'window_list') {
        console.log(JSON.stringify({ success: true, data: { windows: [], active: -1 } }, null, 2));
      } else if (finalAction === 'tab_list') {
        console.log(JSON.stringify({ success: true, data: { tabs: [], active: -1 } }, null, 2));
      } else {
        console.log(`Session "${session}" is not running (already closed)`);
      }
      return;
    }
    if (finalAction !== 'session_list') {
      console.log(`Starting daemon for session "${session}"...`);
      try {
        startDaemon(session, headed, profile);
        // Wait for it to be ready
        let ready = false;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 300));
          if (await isDaemonRunning(session)) {
            ready = true;
            break;
          }
        }
        if (!ready) throw new Error('Daemon timed out starting');
      } catch (e: any) {
        console.error('Failed to start daemon:', e.message);
        process.exit(1);
      }
    }
  }

  if (finalAction === 'session_list') {
    const socketDir =
      process.env.AGENT_BROWSER_SOCKET_DIR ||
      process.env.XDG_RUNTIME_DIR ||
      path.join(os.homedir(), '.agent-browser');
    if (fs.existsSync(socketDir)) {
      const files = fs.readdirSync(socketDir);
      const sessions = files
        .filter((f) => f.endsWith('.sock') || f.endsWith('.port'))
        .map((f) => f.replace(/\.(sock|port)$/, ''));
      const uniqueSessions = Array.from(new Set(sessions));
      if (uniqueSessions.length === 0) {
        console.log('No active sessions');
      } else {
        console.log('Active sessions:');
        uniqueSessions.forEach((s) => console.log(`  ${s}`));
      }
    } else {
      console.log('No active sessions');
    }
    return;
  }

  const command: any = { action: finalAction };
  if (modifierWindowIndex !== undefined) command.windowIndex = modifierWindowIndex;

  // Normalize actions
  if (action === 'launch' || action === 'open') {
    command.action = 'launch';
    command.headless = headless;
    if (profile) command.profile = profile;

    // Check if we need to open a URL too
    const url = cleanArgs[1] || (action === 'open' ? null : null);
    if (url) {
      try {
        const launchResponse = await sendCommand(session, command);
        if (launchResponse.error) throw new Error(launchResponse.error);

        const navigateResponse = await sendCommand(session, { action: 'navigate', url });
        if (navigateResponse.error) throw new Error(navigateResponse.error);

        console.log(`Launched and navigated to ${url}`);
        return;
      } catch (e: any) {
        console.error('Error during launch/open:', e.message);
        process.exit(1);
      }
    }
  } else {
    // General arg mapping
    if (action === 'navigate' && remainingArgs[0]) command.url = remainingArgs[0];
    if (action === 'screenshot' && remainingArgs[0]) command.path = remainingArgs[0];

    // Tab mappings
    if (finalAction === 'tab_new' && remainingArgs[0]) command.url = remainingArgs[0];
    if (finalAction === 'tab_switch' && remainingArgs[0])
      command.index = parseInt(remainingArgs[0], 10);
    if (finalAction === 'tab_close' && remainingArgs[0])
      command.index = parseInt(remainingArgs[0], 10);

    // Storage mappings
    if ((finalAction === 'storage_get' || finalAction === 'storage_clear') && remainingArgs[0]) {
      command.type = remainingArgs[0] as 'local' | 'session';
      if (remainingArgs[1]) command.key = remainingArgs[1];
    }

    if (action === 'snapshot') {
      command.interactive = true;
      command.cursor = true;
    }
    if (action === 'close') command.action = 'close';
    if (action === 'stop') command.action = 'close';
  }

  try {
    const response = await sendCommand(session, command);
    if (response.error) {
      console.error('Error:', response.error);
      process.exit(1);
    } else {
      if (action === 'snapshot') {
        console.log(response.result?.snapshot || response.result);
      } else if (response.message) {
        console.log(response.message);
      } else {
        console.log(JSON.stringify(response.result || response, null, 2));
      }
    }
  } catch (err: any) {
    console.error('Failed to communicate with daemon:', err.message);
    process.exit(1);
  }
}

main();

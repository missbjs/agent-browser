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
  --tab-url <prefix> Target a specific tab starting with this URL
  --window <index>   Target a specific window (context) index
  --help, -h        Show this help message

Quick Start:
  open <url>              Navigate to URL
  snapshot                Get page accessibility tree with refs
  click @e1               Click element by ref
  fill @e2 "text"         Fill input by ref
  screenshot [path]       Take screenshot
  close                   Close browser session

### Core Commands

  open <url>              Navigate to URL (aliases: goto, navigate)
  click <sel>             Click element (--new-tab to open in new tab)
  dblclick <sel>          Double-click element
  focus <sel>             Focus element
  type <sel> <text>       Type into element
  fill <sel> <text>       Clear and fill
  press <key>             Press key (Enter, Tab, Control+a) (alias: key)
  keyboard type <text>    Type with real keystrokes (no selector, current focus)
  keyboard inserttext <text>  Insert text without key events (no selector)
  keydown <key>           Hold key down
  keyup <key>             Release key
  hover <sel>             Hover element
  select <sel> <val>      Select dropdown option
  check <sel>             Check checkbox
  uncheck <sel>           Uncheck checkbox
  scroll <dir> [px]       Scroll (up/down/left/right, --selector <sel>)
  scrollintoview <sel>    Scroll element into view (alias: scrollinto)
  drag <src> <tgt>        Drag and drop
  upload <sel> <files>    Upload files
  screenshot [path]       Take screenshot (--full for full page, saves to a temporary directory if no path)
  screenshot --annotate   Annotated screenshot with numbered element labels
  pdf <path>              Save as PDF
  snapshot                Accessibility tree with refs (best for AI)
  eval <js>               Run JavaScript (-b for base64, --stdin for piped input)
  connect <port>          Connect to browser via CDP
  close                   Close browser (aliases: quit, exit)

### Get Info

  get text <sel>          Get text content
  get html <sel>          Get innerHTML
  get value <sel>         Get input value
  get attr <sel> <attr>   Get attribute
  get title               Get page title
  get url                 Get current URL
  get count <sel>         Count matching elements
  get box <sel>           Get bounding box
  get styles <sel>        Get computed styles

### Check State

  is visible <sel>        Check if visible
  is enabled <sel>        Check if enabled
  is checked <sel>        Check if checked

### Find Elements (Semantic Locators)

  find role <role> <action> [value]       By ARIA role
  find text <text> <action>               By text content
  find label <label> <action> [value]     By label
  find placeholder <ph> <action> [value]  By placeholder
  find alt <text> <action>                By alt text
  find title <text> <action>              By title attr
  find testid <id> <action> [value]       By data-testid
  find first <sel> <action> [value]       First match
  find last <sel> <action> [value]        Last match
  find nth <n> <sel> <action> [value]     Nth match

**Actions:** click, fill, type, hover, focus, check, uncheck, text

**Options:** --name <name> (filter role by accessible name), --exact (require exact text match)

### Wait

  wait <selector>         Wait for element to be visible
  wait <ms>               Wait for time (milliseconds)
  wait --text "Welcome"   Wait for text to appear
  wait --url "**/dash"    Wait for URL pattern
  wait --load networkidle Wait for load state
  wait --fn "window.ready === true"  Wait for JS condition

**Load states:** load, domcontentloaded, networkidle

### Mouse Control

  mouse move <x> <y>      Move mouse
  mouse down [button]     Press button (left/right/middle)
  mouse up [button]       Release button
  mouse wheel <dy> [dx]   Scroll wheel

### Browser Settings

  set viewport <w> <h>    Set viewport size
  set device <name>       Emulate device ("iPhone 14")
  set geo <lat> <lng>     Set geolocation
  set offline [on|off]    Toggle offline mode
  set headers <json>      Extra HTTP headers
  set credentials <u> <p> HTTP basic auth
  set media [dark|light]  Emulate color scheme

### Cookies & Storage

  cookies                 Get all cookies
  cookies set <name> <val> Set cookie
  cookies clear           Clear cookies

  storage local           Get all localStorage
  storage local <key>     Get specific key
  storage local set <k> <v>  Set value
  storage local clear     Clear all

  storage session         Same for sessionStorage

### Network

  network route <url>              Intercept requests
  network route <url> --abort      Block requests
  network route <url> --body <json>  Mock response
  network unroute [url]            Remove routes
  network requests                 View tracked requests
  network requests --filter api    Filter requests

### Tabs & Windows

  tab                     List tabs
  tab new [url]           New tab (optionally with URL)
  tab <n>                 Switch to tab n
  tab close [n]           Close tab
  window new              New window

### Frames

  frame <sel>             Switch to iframe
  frame main              Back to main frame

### Dialogs

  dialog accept [text]    Accept (with optional prompt text)
  dialog dismiss          Dismiss

### Diff

  diff snapshot                              Compare current vs last snapshot
  diff snapshot --baseline before.txt        Compare current vs saved snapshot file
  diff snapshot --selector "#main" --compact Scoped snapshot diff
  diff screenshot --baseline before.png      Visual pixel diff against baseline
  diff screenshot --baseline b.png -o d.png  Save diff image to custom path
  diff screenshot --baseline b.png -t 0.2    Adjust color threshold (0-1)
  diff url https://v1.com https://v2.com     Compare two URLs (snapshot diff)
  diff url https://v1.com https://v2.com --screenshot  Also visual diff
  diff url https://v1.com https://v2.com --wait-until networkidle  Custom wait strategy
  diff url https://v1.com https://v2.com --selector "#main"  Scope to element

### Debug

  trace start [path]      Start recording trace
  trace stop [path]       Stop and save trace
  profiler start          Start Chrome DevTools profiling
  profiler stop [path]    Stop and save profile (.json)
  console                 View console messages (log, error, warn, info)
  console --clear         Clear console
  errors                  View page errors (uncaught JavaScript exceptions)
  errors --clear          Clear errors
  highlight <sel>         Highlight element
  state save <path>       Save auth state
  state load <path>       Load auth state
  state list              List saved state files
  state show <file>       Show state summary
  state rename <old> <new> Rename state file
  state clear [name]      Clear states for session
  state clear --all       Clear all saved states
  state clean --older-than <days>  Delete old states

### Navigation

  back                    Go back
  forward                 Go forward
  reload                  Reload page

### Setup

  install                 Download Chromium browser
  install --with-deps     Also install system deps (Linux)

### Sessions

Run multiple isolated browser instances:

  --session <name>        Use isolated session (or AGENT_BROWSER_SESSION env)
  --session-name <name>   Auto-save/restore session state (or AGENT_BROWSER_SESSION_NAME env)
  --profile <path>        Persistent browser profile directory (or AGENT_BROWSER_PROFILE env)
  --state <path>          Load storage state from JSON file (or AGENT_BROWSER_STATE env)

Each session has its own:
- Browser instance
- Cookies and storage
- Navigation history
- Authentication state
`);
}

async function main() {
  const args = process.argv.slice(2);
  let session = process.env.AGENT_BROWSER_SESSION || 'default';
  let headless = true;
  let headed = false;
  let profile: string | undefined;
  let modifierWindowIndex: number | undefined = undefined;

  // Simple arg parser
  const cleanArgs: string[] = [];
  let tabUrl: string | undefined = undefined;
  let evalBase64Value: string | undefined = undefined;
  let evalStdin = false;
  let stdinScript: string | undefined = undefined;
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
    } else if (args[i] === '--tab-url' && args[i + 1]) {
      tabUrl = args[i + 1];
      i++;
    } else if (args[i] === '--window' && args[i + 1]) {
      modifierWindowIndex = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
      return;
    } else if (args[i] === '-b' && args[i + 1]) {
      // Base64 encoded script for eval - capture the value and skip both
      evalBase64Value = args[i + 1];
      i++;
    } else if (args[i] === '--stdin') {
      // Read script from stdin
      evalStdin = true;
    } else {
      cleanArgs.push(args[i]);
    }
  }

  // Read stdin if --stdin flag was provided
  if (evalStdin) {
    stdinScript = fs.readFileSync(0, 'utf-8').trim();
  }

  const action = cleanArgs[0];
  if (!action || action === 'help') {
    showHelp();
    process.exit(action === 'help' ? 0 : 1);
  }

  // Handle multi-word actions and modifiers like "window 0 tab list"
  let finalAction = action;
  let remainingArgs = cleanArgs.slice(1);

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
    'get',
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

  let command: any = { action: finalAction };
  if (modifierWindowIndex !== undefined) command.windowIndex = modifierWindowIndex;
  if (tabUrl !== undefined) command.tabUrl = tabUrl;

  // Normalize actions
  if (command.action === 'get_url') command.action = 'url';
  if (command.action === 'get_title') command.action = 'title';
  if (command.action === 'get_snapshot') command.action = 'snapshot';

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
    if (action === 'download' && remainingArgs[0]) {
      command.selector = remainingArgs[0];
      command.path = remainingArgs[1] || '';
    }
    if (action === 'click' && remainingArgs[0]) command.selector = remainingArgs[0];
    if (action === 'dblclick' && remainingArgs[0]) command.selector = remainingArgs[0];
    if (action === 'focus' && remainingArgs[0]) command.selector = remainingArgs[0];
    if (action === 'check' && remainingArgs[0]) command.selector = remainingArgs[0];
    if (action === 'uncheck' && remainingArgs[0]) command.selector = remainingArgs[0];
    if (action === 'fill' && remainingArgs[0]) {
      command.selector = remainingArgs[0];
      command.value = remainingArgs[1] || '';
    }
    if (action === 'upload' && remainingArgs[0]) {
      command.selector = remainingArgs[0];
      command.files = remainingArgs.slice(1);
    }
    // Enable dragdrop for testing
    if (action === 'dragdrop' && remainingArgs[0]) {
      command.target = remainingArgs[0];
      command.files = remainingArgs.slice(1);
    }
    if (action === 'press' && remainingArgs[0]) command.key = remainingArgs[0];
    if (action === 'wait' && remainingArgs[0]) {
      if (isNaN(parseInt(remainingArgs[0], 10))) {
        command.selector = remainingArgs[0];
      } else {
        command.timeout = parseInt(remainingArgs[0], 10);
      }
    }
    if (action === 'scroll' && remainingArgs[0]) {
      if (remainingArgs[0] === 'up' || remainingArgs[0] === 'down') {
        command.direction = remainingArgs[0];
      } else {
        command.selector = remainingArgs[0];
      }
    }
    if (action === 'eval') {
      command.action = 'evaluate';

      // Handle base64 encoded script
      if (evalBase64Value) {
        command.script = Buffer.from(evalBase64Value, 'base64').toString('utf-8');
      } else if (evalStdin && stdinScript) {
        // Use script read from stdin
        command.script = stdinScript;
      } else if (remainingArgs[0]) {
        command.script = remainingArgs[0];
      }
    }
    if (action === 'dispatch' && remainingArgs[0]) {
      command.selector = remainingArgs[0];
      command.event = remainingArgs[1] || 'click';
    }
    if (action.startsWith('getby') && remainingArgs[0]) {
      command.action = action;
      command.name = remainingArgs[0];
      command.subaction = remainingArgs[1] || 'click';
      if (action === 'getbyrole') {
        command.role = remainingArgs[0];
        command.name = remainingArgs[1];
        command.subaction = remainingArgs[2] || 'click';
      }
    }

    // New switch for press, keyboard, and type actions
    switch (action) {
      case 'press':
        const pressKeys = remainingArgs.join('+');
        command = { action: 'press', key: pressKeys };
        break;
      case 'keyboard':
        command = {
          action: 'keyboard',
          subaction: remainingArgs[0],
          text: remainingArgs.slice(1).join(' '),
        };
        break;
      case 'type':
        // Check if we have two arguments (selector and text) or just one (text for focused element)
        if (remainingArgs.length >= 2 && remainingArgs[0].startsWith('e')) {
          // Assuming 'e' prefix for selector
          command = {
            action: 'type',
            selector: remainingArgs[0],
            text: remainingArgs.slice(1).join(' '),
          };
        } else {
          command = { action: 'keyboard', subaction: 'type', text: remainingArgs.join(' ') };
        }
        break;
    }

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
    if (!response.success) {
      console.error('Error:', response.error || 'Unknown error');
      process.exit(1);
    } else {
      if (response.message && !response.data) {
        console.log(response.message);
      } else {
        console.log(JSON.stringify(response, null, 2));
      }
    }
  } catch (err: any) {
    console.error('Failed to communicate with daemon:', err.message);
    process.exit(1);
  }
}

main();

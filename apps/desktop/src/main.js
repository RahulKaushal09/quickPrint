// SeedhaPrint for Windows: the shop's dashboard in its own window, plus the
// print agent running behind it. Opens when Windows starts, and closing the
// window keeps it printing from the tray.
//
// Electron 22 is the last version that runs on Windows 7, so don't upgrade it.
// With no more security fixes coming, this app only ever opens SeedhaPrint's own
// pages: anything else goes to the normal browser.

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const config = require('./config.json');

const dev = process.argv.includes('--dev');
const webUrl = process.env.SEEDHAPRINT_WEB_URL || config.webUrl;
const agentPath = process.env.SEEDHAPRINT_AGENT || path.join(process.resourcesPath, 'agent', 'SeedhaPrintAgent.exe');
const agentArgs = dev ? ['--dev', '--no-browser'] : ['--no-browser'];
const icon = path.join(__dirname, 'icon.png');

let win = null;
let tray = null;
let agent = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

// ---------------------------------------------------------------- print agent

function startAgent() {
  if (quitting) return;
  agent = spawn(agentPath, ['run', ...agentArgs], { cwd: path.dirname(agentPath), stdio: 'ignore', windowsHide: true });
  agent.on('error', (e) => console.error('agent', e.message));
  agent.on('exit', () => {
    agent = null;
    // A crash must not stop the shop printing.
    setTimeout(startAgent, 3000);
  });
}

function stopAgent() {
  return new Promise((resolve) => {
    if (!agent) return resolve();
    const running = agent;
    running.removeAllListeners('exit');
    running.once('exit', () => resolve());
    running.kill();
    agent = null;
  });
}

/** Which shop PC this computer is, if it has been connected. Mirrors dataDir() in the agent. */
ipcMain.handle('device-id', () => {
  const dir = dev ? path.join(path.dirname(agentPath), 'dev-data') : path.join(process.env.ProgramData || 'C:\\ProgramData', 'SeedhaPrintAgent');
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).deviceId || null;
  } catch {
    return null;
  }
});

ipcMain.handle('pair', async (_event, code, server) => {
  await stopAgent();
  try {
    return await new Promise((resolve, reject) => {
      execFile(agentPath, [...(dev ? ['--dev'] : []), 'pair', String(code), String(server)], { cwd: path.dirname(agentPath), windowsHide: true, timeout: 60_000 }, (err, stdout) => {
        const message = String(stdout || '').trim();
        if (err) reject(new Error(message || 'This PC could not be connected.'));
        else resolve(message);
      });
    });
  } finally {
    startAgent();
  }
});

/** Opens Windows' own Add a printer wizard (Windows 7 to 11). The agent sees the new printer within seconds. */
ipcMain.handle('add-printer', () => {
  spawn('rundll32.exe', ['printui.dll,PrintUIEntry', '/il'], { detached: true, stdio: 'ignore' }).unref();
});
ipcMain.handle('printer-settings', () => {
  spawn('control.exe', ['printers'], { detached: true, stdio: 'ignore' }).unref();
});

// ---------------------------------------------------------------- corner pop-up
// The agent's status port says what is printing. A new job, or one waiting for
// the pages to be turned over, opens a small box in the bottom-right corner
// without taking the keyboard away from whatever the shop is typing.

const AGENT = 'http://127.0.0.1:47210';
const PANEL_WIDTH = 380;
const SHOW_DONE_FOR = 10_000; // a finished job stays this long, then the box hides itself

let panel = null;
let panelHeight = 120;
let seen = null; // job ids already known, so jobs from before the app started don't pop up
let hiddenUntilNew = false;
let lastJobs = [];

function agentRequest(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${AGENT}${pathname}`, { method, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode < 300 ? resolve(body) : reject(new Error(body.trim() || `HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function placePanel() {
  if (!panel) return;
  const area = screen.getPrimaryDisplay().workArea;
  const height = Math.min(panelHeight, area.height - 24);
  panel.setBounds({ x: area.x + area.width - PANEL_WIDTH - 12, y: area.y + area.height - height - 12, width: PANEL_WIDTH, height });
}

function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_WIDTH,
    height: panelHeight,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // clicks still work, but typing stays where it was
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), contextIsolation: true, sandbox: true },
  });
  panel.setAlwaysOnTop(true, 'screen-saver');
  panel.loadFile(path.join(__dirname, 'panel.html')).catch(() => {});
  panel.webContents.on('did-finish-load', () => panel.webContents.send('jobs', lastJobs));
  panel.on('closed', () => (panel = null));
  placePanel();
}

ipcMain.on('panel-height', (_e, h) => {
  panelHeight = Math.max(60, Math.round(Number(h) || 0) + 2);
  placePanel();
});
ipcMain.on('panel-hide', () => {
  hiddenUntilNew = true;
  panel?.hide();
});
ipcMain.on('panel-open', showWindow);
ipcMain.handle('flip', async (_e, id) => {
  await agentRequest('POST', `/api/flip?job=${encodeURIComponent(String(id))}`).catch(() => {});
  void pollAgent();
});

async function pollAgent() {
  let state;
  try {
    state = JSON.parse(await agentRequest('GET', '/api/state'));
  } catch {
    return; // the agent is starting or restarting
  }
  const jobs = Array.isArray(state.jobs) ? state.jobs : [];
  const now = Date.now();
  const fresh = seen !== null && jobs.some((j) => !seen.has(j.id));
  const flip = jobs.some((j) => j.status === 'flip');
  if (seen === null) seen = new Set();
  for (const j of jobs) seen.add(j.id);

  // Shown: everything still printing, plus jobs that finished a moment ago.
  lastJobs = jobs.filter((j) => !['printed', 'failed'].includes(j.status) || now - new Date(j.at).getTime() < SHOW_DONE_FOR).slice(0, 6);
  if (fresh || flip) hiddenUntilNew = false;
  if (!lastJobs.length || hiddenUntilNew) {
    panel?.hide();
    return;
  }
  if (!panel) createPanel();
  panel.webContents.send('jobs', lastJobs);
  if (!panel.isVisible()) {
    placePanel();
    panel.showInactive();
  }
  if (fresh) shell.beep();
  if (flip && win && !win.isFocused()) win.flashFrame(true);
}

// ---------------------------------------------------------------- window

const isOurs = (url) => {
  try {
    return new URL(url).origin === new URL(webUrl).origin;
  } catch {
    return false;
  }
};

function loadApp() {
  win.loadURL(`${webUrl}/dashboard`).catch(() => {});
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'SeedhaPrint',
    icon,
    backgroundColor: '#f6f5f1',
    autoHideMenuBar: true,
    show: !process.argv.includes('--hidden'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.on('page-title-updated', (e) => e.preventDefault());

  // Links to anywhere else (Razorpay, WhatsApp) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOurs(url) && !url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  // No internet at startup is normal: show a calm page and keep trying.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3 || url.startsWith('file:')) return;
    void win.loadFile(path.join(__dirname, 'offline.html'));
    setTimeout(loadApp, 10_000);
  });

  // Closing the window must not stop printing.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    win = null;
  });

  loadApp();
}

function showWindow() {
  if (!app.isReady()) return; // still starting: the window is about to open anyway
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function confirmQuit() {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Keep running', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit SeedhaPrint?',
    message: 'Customers’ jobs will not print while SeedhaPrint is closed.',
  });
  if (response === 1) {
    quitting = true;
    await stopAgent();
    app.quit();
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
  tray.setToolTip('SeedhaPrint is running');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open SeedhaPrint', click: showWindow }, { type: 'separator' }, { label: 'Quit', click: confirmQuit }]));
  tray.on('click', showWindow);
}

app.whenReady().then(() => {
  app.setAppUserModelId('in.seedhaprint.app');
  startAgent();
  createWindow();
  createTray();
  setInterval(() => void pollAgent(), 1500);
});

app.on('window-all-closed', () => {}); // stays alive in the tray
app.on('before-quit', () => {
  quitting = true;
  if (agent) {
    agent.removeAllListeners('exit');
    agent.kill();
  }
});

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseNovel } = require('./src/novel-parser');

const DEFAULT_CONFIG = {
  intervalMin: 8,
  bossKey: 'CommandOrControl+Shift+K',
  autoStart: false,
  lastFile: null,
  openFull: true,
  // 阅读快捷键（在弹窗聚焦时生效；boss 键为全局）
  shortcuts: {
    prev: 'Alt+ArrowUp',
    next: 'Alt+ArrowDown',
    scrollUp: 'ArrowUp',
    scrollDown: 'ArrowDown',
  },
  progress: { ci: 0, shown: 1, full: false, scrollTop: 0 },
};

const SAMPLE_PATH = path.join(__dirname, 'src', 'sample-novel.json');
let sampleData = null;
try {
  sampleData = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
} catch (e) {
  console.warn('内置示例小说加载失败', e);
}

let win = null;
let tray = null;
let config = null;
let popupTimer = null;
let isQuiting = false;

function loadConfig() {
  const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch { /* 无配置文件，用默认 */ }
  // 浅合并顶层字段，再对 shortcuts/progress 做深合并，避免旧配置升级丢字段
  const cfg = Object.assign({}, DEFAULT_CONFIG, saved);
  cfg.shortcuts = Object.assign({}, DEFAULT_CONFIG.shortcuts, saved.shortcuts || {});
  cfg.progress = Object.assign({}, DEFAULT_CONFIG.progress, saved.progress || {});
  return cfg;
}

function saveConfig() {
  try {
    const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.warn('保存配置失败', e);
  }
}

function createWindow() {
  const width = 360;
  const height = 480;
  const primary = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width,
    height,
    x: primary.width - width - 16,
    y: primary.height - height - 16,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'popup.html'));
  win.webContents.on('did-finish-load', () => {
    if (sampleData) win.webContents.send('sample', sampleData);
  });
  // Alt+F4 / 点× 都不真正关闭，只收进托盘；仅在退出流程(isQuiting)时允许关闭
  win.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault();
      hidePopup();
    }
  });
  win.on('closed', () => { win = null; });
}

function showPopup() {
  if (!win) return;
  if (win.isVisible()) return;
  win.show();
  win.focus();
}

function hidePopup() {
  if (win && win.isVisible()) win.hide();
}

function startTimer() {
  if (popupTimer) clearInterval(popupTimer);
  const ms = Math.max(1, config.intervalMin) * 60 * 1000;
  popupTimer = setInterval(() => { showPopup(); }, ms);
}

function registerShortcuts() {
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  const ok = globalShortcut.register(config.bossKey, () => {
    if (!win) return;
    if (win.isVisible()) hidePopup();
    else showPopup();
  });
  if (!ok) console.warn('Boss 键注册失败:', config.bossKey);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createFromBuffer(Buffer.from([]));
  }
  tray = new Tray(icon);
  const toggleLabel = () => (win && win.isVisible() ? '隐藏弹窗' : '显示弹窗');
  const buildMenu = () => Menu.buildFromTemplate([
    { label: toggleLabel(), click: () => (win && win.isVisible() ? hidePopup() : showPopup()) },
    { label: '设置', click: () => { showPopup(); win && win.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuiting = true; app.quit(); } },
  ]);
  tray.setToolTip('资讯阅读器');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => { win && win.isVisible() ? hidePopup() : showPopup(); });
}

// ---- IPC ----
ipcMain.on('hide', () => hidePopup());
ipcMain.on('show', () => showPopup());
ipcMain.on('toggle', () => { if (win && win.isVisible()) hidePopup(); else showPopup(); });

ipcMain.handle('open-file', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '文本文件', extensions: ['txt'] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const p = res.filePaths[0];
  const text = fs.readFileSync(p, 'utf8');
  const chapters = parseNovel(text, path.basename(p, '.txt'));
  config.lastFile = p;
  saveConfig();
  return { name: path.basename(p), path: p, chapters };
});

// 按路径重新读取并解析 txt（重启时恢复导入的小说）
ipcMain.handle('load-file', async (e, p) => {
  try {
    const text = fs.readFileSync(p, 'utf8');
    return { name: path.basename(p), path: p, chapters: parseNovel(text, path.basename(p, '.txt')) };
  } catch {
    return null;
  }
});

// 轻量保存阅读进度（不重注册快捷键/定时器）
ipcMain.handle('save-progress', (e, prog) => {
  config.progress = prog;
  saveConfig();
  return config;
});

// 同步保存进度，用于 beforeunload 等必须立即落盘的场景
ipcMain.on('save-progress-sync', (e, prog) => {
  config.progress = prog;
  saveConfig();
});

ipcMain.handle('get-sample', () => sampleData);
ipcMain.handle('get-config', () => config);
ipcMain.handle('save-config', (e, cfg) => {
  config = { ...config, ...cfg };
  if (cfg.shortcuts) config.shortcuts = { ...config.shortcuts, ...cfg.shortcuts };
  saveConfig();
  registerShortcuts();
  startTimer();
  try {
    app.setLoginItemSettings({ openAtLogin: !!config.autoStart, path: app.getPath('exe') });
  } catch (err) {
    console.warn('设置开机自启失败', err);
  }
  return config;
});

app.whenReady().then(() => {
  config = loadConfig();
  try {
    app.setLoginItemSettings({ openAtLogin: !!config.autoStart, path: app.getPath('exe') });
  } catch (err) {
    console.warn('设置开机自启失败', err);
  }
  createWindow();
  createTray();
  registerShortcuts();
  startTimer();
  setTimeout(showPopup, 1500);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// 关闭窗口只隐藏，保持托盘常驻
app.on('window-all-closed', (e) => e.preventDefault());

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
});

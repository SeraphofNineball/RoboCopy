const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';

// ── File browser IPC handlers ─────────────────────────────────────────────────

// List drives with volume labels.
// Probe A-Z for present drives, then fetch labels for both local and
// network/mapped drives using two PowerShell queries merged into one script.
ipcMain.handle('fs:listDrives', async () => {

  // Step 1: find which drive letters exist on this machine
  const present = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const root = letter + ':\\';
    try {
      fs.accessSync(root);
      present.push({ name: letter + ':', root, label: '', unc: '' });
    } catch {}
  }

  if (present.length === 0) return present;

  // Step 2: one PowerShell script that covers both local and network drives.
  //
  //   Get-Volume       → local drives: letter + FileSystemLabel
  //   Get-PSDrive      → all FS drives including mapped: letter + DisplayRoot (UNC)
  //
  // Output format per line:  TYPE|LETTER|VALUE
  //   local|C|WIN
  //   net|Y|\\server\share
  //
  // No embedded quotes in the script — pipe-delimited plain text only.
  const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const psCmd = [
    // Local drive labels
    'Get-Volume | Where-Object {$_.DriveLetter} |',
    'ForEach-Object { "local|" + $_.DriveLetter + "|" + $_.FileSystemLabel };',
    // Network/mapped drive UNC paths
    'Get-PSDrive -PSProvider FileSystem |',
    'Where-Object {$_.DisplayRoot} |',
    'ForEach-Object { "net|" + $_.Name + "|" + $_.DisplayRoot }',
  ].join(' ');

  try {
    const out = execFileSync(psPath, [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', psCmd,
    ], { encoding: 'utf8', windowsHide: true, timeout: 8000 });

    const localLabels = {};  // "C" -> "WIN"
    const netLabels   = {};  // "Y" -> "\\server\share"

    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split('|');
      if (parts.length < 3) continue;
      const type   = parts[0].trim();
      const letter = parts[1].trim().toUpperCase();
      const value  = parts.slice(2).join('|').trim(); // rejoin in case UNC had pipes
      if (letter.length !== 1) continue;
      if (type === 'local') localLabels[letter] = value;
      if (type === 'net')   netLabels[letter]   = value;
    }

    for (const d of present) {
      const letter = d.name[0].toUpperCase();
      const unc    = netLabels[letter] || '';
      const label  = localLabels[letter] || '';
      // Network drives: show UNC path as the label if no volume label
      d.label = unc ? (label || unc) : label;
      d.unc   = unc;
    }
  } catch {
    // PowerShell failed — drives shown without labels (silent fallback)
  }

  return present;
});

// Expand %ENVVAR% tokens and resolve the path
ipcMain.handle('fs:expandPath', async (event, p) => {
  const expanded = p.replace(/%([^%]+)%/g, (_, v) =>
    process.env[v] || process.env[v.toUpperCase()] || ('%' + v + '%')
  );
  try { return path.resolve(expanded); } catch { return expanded; }
});

// List directory contents
ipcMain.handle('fs:readDir', async (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(e => {
      let size = null, modified = null;
      try {
        const stat = fs.statSync(path.join(dirPath, e.name));
        size     = e.isFile() ? stat.size : null;
        modified = stat.mtime.toLocaleDateString('en-US', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        });
      } catch {}
      return { name: e.name, isDir: e.isDirectory(), size, modified };
    });
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return { ok: true, entries: result };
  } catch (err) {
    return { ok: false, error: err.message, entries: [] };
  }
});

// Resolve/normalise a plain path
ipcMain.handle('fs:resolvePath', async (event, p) => {
  try { return path.resolve(p); } catch { return p; }
});

// Read file for preview — returns type + content (capped at 256 KB for text)
ipcMain.handle('fs:previewFile', async (event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();

    const imgExts = ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.ico','.svg'];
    if (imgExts.includes(ext)) {
      const buf  = fs.readFileSync(filePath);
      const mime = ext === '.svg'  ? 'image/svg+xml'
                 : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                 : ext === '.gif'  ? 'image/gif'
                 : ext === '.webp' ? 'image/webp'
                 : ext === '.bmp'  ? 'image/bmp'
                 : ext === '.ico'  ? 'image/x-icon'
                 : 'image/png';
      return { type: 'image', mime, data: buf.toString('base64'), size: stat.size, ext };
    }

    const textExts = [
      '.txt','.md','.log','.csv','.json','.xml','.html','.htm','.css','.js',
      '.jsx','.ts','.tsx','.py','.bat','.cmd','.ps1','.sh','.yaml','.yml',
      '.ini','.cfg','.conf','.toml','.sql','.c','.cpp','.h','.cs','.java',
      '.rb','.php','.go','.rs','.vue','.env','.gitignore','.dockerfile',
    ];
    if (textExts.includes(ext) || stat.size < 512 * 1024) {
      const MAX = 256 * 1024;
      const buf = Buffer.alloc(Math.min(stat.size, MAX));
      const fd  = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const text = buf.toString('utf8');
      const truncated = stat.size > MAX;
      const sample = buf.slice(0, 512);
      let nonPrint = 0;
      for (let i = 0; i < sample.length; i++) {
        const b = sample[i];
        if (b < 9 || (b > 13 && b < 32)) nonPrint++;
      }
      if (nonPrint / sample.length > 0.05) {
        return { type: 'binary', size: stat.size, ext };
      }
      return { type: 'text', text, truncated, size: stat.size, ext, lines: text.split('\n').length };
    }

    return { type: 'info', size: stat.size, ext, modified: stat.mtime.toISOString() };
  } catch (err) {
    return { type: 'error', message: err.message };
  }
});

// Legacy folder picker (fallback)
ipcMain.handle('dialog:openFolder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Robocopy execution ────────────────────────────────────────────────────────
let runningChild = null;

ipcMain.handle('robocopy:run', async (event, args) => {
  return new Promise((resolve) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const sendLine = (line) => {
      if (!win.isDestroyed()) win.webContents.send('robocopy:output', line);
    };
    runningChild = spawn('robocopy', args, { shell: false, windowsHide: true });
    runningChild.stdout.on('data', (data) => {
      String(data).split(/\r?\n/).forEach(l => { if (l.trim()) sendLine(l); });
    });
    runningChild.stderr.on('data', (data) => {
      String(data).split(/\r?\n/).forEach(l => { if (l.trim()) sendLine('STDERR: ' + l); });
    });
    runningChild.on('close', (code) => {
      runningChild = null;
      resolve({ code, success: code !== null && code <= 7 });
    });
    runningChild.on('error', (err) => {
      sendLine('ERROR: ' + err.message);
      runningChild = null;
      resolve({ code: -1, success: false });
    });
  });
});

ipcMain.handle('robocopy:cancel', async () => {
  if (runningChild) { runningChild.kill(); runningChild = null; return true; }
  return false;
});

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 980, height: 860,
    minWidth: 480, minHeight: 400,
    show: false,
    title: 'RoboCopy GUI',
    backgroundColor: '#0d0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../public/icon.png'),
    autoHideMenuBar: true,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

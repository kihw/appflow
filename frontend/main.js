const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Try to pick a suitable Python executable on all platforms
const PYTHON_BIN = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const RULES_DIR = path.join(__dirname, 'public', 'rules');

let mainWindow;
let tray;
let engineProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'), // Add icon
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Enable development tools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const trayIconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  tray = new Tray(trayIconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AppFlow',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Start Engine',
      click: () => {
        mainWindow.webContents.send('start-engine-request');
      }
    },
    {
      label: 'Stop Engine',
      click: () => {
        mainWindow.webContents.send('stop-engine-request');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('AppFlow - Application Manager');
  
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// IPC Handlers
ipcMain.on('run-rule', (event, ruleName) => {
  const script = path.join(__dirname, '../main/appflow.py');
  const child = spawn(PYTHON_BIN, [script, '--run', ruleName, '--rules-dir', RULES_DIR], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
});

ipcMain.handle('start-engine', (event) => {
  if (engineProcess) {
    return { success: false, message: 'Engine already running' };
  }
  
  try {
    const script = path.join(__dirname, '../main/appflow.py');
    engineProcess = spawn(PYTHON_BIN, [
      script,
      '--log',
      path.join(__dirname, '../appflow.log'),
      '--rules-dir',
      RULES_DIR,
    ]);
    
    engineProcess.on('exit', (code) => {
      engineProcess = null;
      mainWindow.webContents.send('engine-status-changed', false);
    });
    
    engineProcess.on('error', (err) => {
      console.error('Failed to start engine:', err);
      engineProcess = null;
      mainWindow.webContents.send('engine-status-changed', false);
    });
    
    mainWindow.webContents.send('engine-status-changed', true);
    return { success: true, message: 'Engine started' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('stop-engine', (event) => {
  if (engineProcess) {
    engineProcess.kill();
    engineProcess = null;
  }
  mainWindow.webContents.send('engine-status-changed', false);
  return { success: true, message: 'Engine stopped' };
});

ipcMain.handle('engine-status', () => {
  return Boolean(engineProcess);
});

ipcMain.on('save-rule', (event, rule) => {
  try {
    const customFile = path.join(RULES_DIR, 'custom.yaml');
    let data = [];
    
    if (fs.existsSync(customFile)) {
      try {
        const content = fs.readFileSync(customFile, 'utf8');
        const parsed = yaml.load(content);
        if (Array.isArray(parsed)) data = parsed;
      } catch (e) {
        console.error('Error reading custom.yaml:', e);
      }
    }
    
    data.push(rule);
    fs.writeFileSync(customFile, yaml.dump(data), 'utf8');
    event.sender.send('rule-saved', { success: true });
  } catch (error) {
    event.sender.send('rule-saved', { success: false, error: error.message });
  }
});

ipcMain.handle('delete-rule', async (event, ruleName) => {
  try {
    const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.yaml'));
    let found = false;
    
    for (const file of files) {
      const filePath = path.join(RULES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(content);
      
      if (Array.isArray(data)) {
        const filteredData = data.filter(rule => rule.name !== ruleName);
        if (filteredData.length !== data.length) {
          fs.writeFileSync(filePath, yaml.dump(filteredData), 'utf8');
          found = true;
          break;
        }
      }
    }
    
    return { success: found, message: found ? 'Rule deleted' : 'Rule not found' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('open-rules-folder', () => {
  const { shell } = require('electron');
  shell.openPath(RULES_DIR);
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Keep app running in background on all platforms
  // Don't quit the app when all windows are closed
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (engineProcess) {
    engineProcess.kill();
  }
});

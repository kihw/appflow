const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, shell } = require('electron');
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
      contextIsolation: false,
      enableRemoteModule: false
    },
    icon: getAppIcon(),
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Center the window
    mainWindow.center();
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on first minimize
      if (!mainWindow.hasShownTrayNotification) {
        showTrayNotification('AppFlow continue de fonctionner en arrière-plan');
        mainWindow.hasShownTrayNotification = true;
      }
    }
  });

  // Enable development tools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function getAppIcon() {
  // Try to find appropriate icon for the platform
  const iconPath = path.join(__dirname, '..', 'assets');
  
  if (process.platform === 'win32') {
    return path.join(iconPath, 'icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(iconPath, 'icon.icns');
  } else {
    return path.join(iconPath, 'icon.png');
  }
}

function createTray() {
  const trayIconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  
  // Fallback to a simple icon if tray icon doesn't exist
  let iconToUse = trayIconPath;
  if (!fs.existsSync(trayIconPath)) {
    iconToUse = getAppIcon();
  }
  
  try {
    tray = new Tray(iconToUse);
  } catch (error) {
    console.log('Could not create tray icon:', error.message);
    return;
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Afficher AppFlow',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Démarrer le moteur',
      click: () => {
        mainWindow.webContents.send('start-engine-request');
      }
    },
    {
      label: 'Arrêter le moteur',
      click: () => {
        mainWindow.webContents.send('stop-engine-request');
      }
    },
    { type: 'separator' },
    {
      label: 'À propos',
      click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'À propos d\'AppFlow',
          message: 'AppFlow v0.1.0',
          detail: 'Gestionnaire intelligent de lancement et d\'arrêt d\'applications\n\nDéveloppé avec ❤️ par l\'équipe AppFlow'
        });
      }
    },
    {
      label: 'Quitter',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('AppFlow - Gestionnaire d\'applications');
  
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function showTrayNotification(message) {
  if (tray) {
    tray.displayBalloon({
      title: 'AppFlow',
      content: message,
      icon: getAppIcon()
    });
  }
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

ipcMain.handle('start-engine', async (event) => {
  if (engineProcess) {
    return { success: false, message: 'Le moteur est déjà en cours d\'exécution' };
  }
  
  try {
    const script = path.join(__dirname, '../main/appflow.py');
    const logPath = path.join(__dirname, '../appflow.log');
    
    engineProcess = spawn(PYTHON_BIN, [
      script,
      '--log', logPath,
      '--rules-dir', RULES_DIR,
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    engineProcess.on('exit', (code, signal) => {
      console.log(`Engine process exited with code ${code}, signal ${signal}`);
      engineProcess = null;
      mainWindow.webContents.send('engine-status-changed', false);
    });
    
    engineProcess.on('error', (err) => {
      console.error('Failed to start engine:', err);
      engineProcess = null;
      mainWindow.webContents.send('engine-status-changed', false);
      return { success: false, message: 'Erreur lors du démarrage: ' + err.message };
    });
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (engineProcess && !engineProcess.killed) {
      mainWindow.webContents.send('engine-status-changed', true);
      showTrayNotification('Moteur AppFlow démarré');
      return { success: true, message: 'Moteur démarré avec succès' };
    } else {
      return { success: false, message: 'Le moteur n\'a pas pu démarrer correctement' };
    }
  } catch (error) {
    engineProcess = null;
    return { success: false, message: 'Erreur lors du démarrage: ' + error.message };
  }
});

ipcMain.handle('stop-engine', (event) => {
  if (engineProcess) {
    engineProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (engineProcess && !engineProcess.killed) {
        engineProcess.kill('SIGKILL');
      }
    }, 5000);
    
    engineProcess = null;
    showTrayNotification('Moteur AppFlow arrêté');
  }
  mainWindow.webContents.send('engine-status-changed', false);
  return { success: true, message: 'Moteur arrêté' };
});

ipcMain.handle('engine-status', () => {
  return engineProcess !== null && !engineProcess.killed;
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
    console.error('Error saving rule:', error);
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
    
    return { success: found, message: found ? 'Règle supprimée' : 'Règle non trouvée' };
  } catch (error) {
    console.error('Error deleting rule:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('open-rules-folder', () => {
  shell.openPath(RULES_DIR);
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Create application menu
  createApplicationMenu();
});

function createApplicationMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouvelle règle',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('create-new-rule');
          }
        },
        {
          label: 'Actualiser les règles',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('refresh-rules');
          }
        },
        { type: 'separator' },
        {
          label: 'Ouvrir le dossier des règles',
          click: () => {
            shell.openPath(RULES_DIR);
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.isQuiting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Moteur',
      submenu: [
        {
          label: 'Démarrer',
          click: () => {
            mainWindow.webContents.send('start-engine-request');
          }
        },
        {
          label: 'Arrêter',
          click: () => {
            mainWindow.webContents.send('stop-engine-request');
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Recharger',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: 'Outils de développement',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom réel',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow.webContents.setZoomLevel(0);
          }
        },
        {
          label: 'Zoom avant',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
          }
        },
        {
          label: 'Zoom arrière',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
          }
        }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/kihw/appflow/wiki');
          }
        },
        {
          label: 'Signaler un problème',
          click: () => {
            shell.openExternal('https://github.com/kihw/appflow/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'À propos d\'AppFlow',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'À propos d\'AppFlow',
              message: 'AppFlow v0.1.0',
              detail: 'Gestionnaire intelligent de lancement et d\'arrêt d\'applications\n\nDéveloppé avec ❤️ par l\'équipe AppFlow\n\nPour plus d\'informations, visitez:\nhttps://github.com/kihw/appflow',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'À propos d\'AppFlow',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'À propos d\'AppFlow',
              message: 'AppFlow v0.1.0',
              detail: 'Gestionnaire intelligent de lancement et d\'arrêt d\'applications',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        { type: 'separator' },
        {
          label: 'Masquer AppFlow',
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Masquer les autres',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Tout afficher',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'Command+Q',
          click: () => {
            app.isQuiting = true;
            app.quit();
          }
        }
      ]
    });

    // Window menu for macOS
    template[4].submenu = [
      {
        label: 'Fermer',
        accelerator: 'CmdOrCtrl+W',
        role: 'close'
      },
      {
        label: 'Réduire',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: 'Zoom',
        role: 'zoom'
      },
      { type: 'separator' },
      {
        label: 'Tout au premier plan',
        role: 'front'
      }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('window-all-closed', () => {
  // Keep app running in background on all platforms
  // Don't quit the app when all windows are closed
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  
  // Clean shutdown of engine process
  if (engineProcess) {
    engineProcess.kill('SIGTERM');
    
    // Force kill after 3 seconds
    setTimeout(() => {
      if (engineProcess && !engineProcess.killed) {
        engineProcess.kill('SIGKILL');
      }
    }, 3000);
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // For development, ignore certificate errors
  if (process.argv.includes('--dev')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow navigation to local files only
    if (parsedUrl.protocol !== 'file:') {
      navigationEvent.preventDefault();
    }
  });
});

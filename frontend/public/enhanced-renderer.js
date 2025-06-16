1);
  const dataPoints = Math.floor(Math.random() * 1000) + 500;
  
  const elements = {
    'patterns-learned': patternsLearned,
    'accuracy-score': `${accuracyScore}%`,
    'data-points': dataPoints
  };
  
  Object.entries(elements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

function loadSettingsForm() {
  // Load current settings into form
  const settings = appState.settings;
  
  const formFields = {
    'polling-interval': settings.pollingInterval,
    'log-level': settings.logLevel,
    'startup-engine': settings.startupEngine,
    'minimize-to-tray': settings.minimizeToTray,
    'notifications-enabled': settings.notificationsEnabled,
    'max-concurrent-rules': settings.maxConcurrentRules,
    'rule-timeout': settings.ruleTimeout,
    'backup-frequency': settings.backupFrequency,
    'debug-mode': settings.debugMode,
    'performance-monitoring': settings.performanceMonitoring
  };
  
  Object.entries(formFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      if (element.type === 'checkbox') {
        element.checked = value;
      } else {
        element.value = value;
      }
    }
  });
}

function saveSettings() {
  // Collect form data
  const formData = {
    pollingInterval: parseFloat(document.getElementById('polling-interval').value),
    logLevel: document.getElementById('log-level').value,
    startupEngine: document.getElementById('startup-engine').checked,
    minimizeToTray: document.getElementById('minimize-to-tray').checked,
    notificationsEnabled: document.getElementById('notifications-enabled').checked,
    maxConcurrentRules: parseInt(document.getElementById('max-concurrent-rules').value),
    ruleTimeout: parseInt(document.getElementById('rule-timeout').value),
    backupFrequency: parseInt(document.getElementById('backup-frequency').value),
    debugMode: document.getElementById('debug-mode').checked,
    performanceMonitoring: document.getElementById('performance-monitoring').checked
  };
  
  // Validate data
  if (formData.pollingInterval < 0.5 || formData.pollingInterval > 60) {
    showToast('L\'intervalle de vérification doit être entre 0.5 et 60 secondes', 'error');
    return;
  }
  
  if (formData.maxConcurrentRules < 1 || formData.maxConcurrentRules > 50) {
    showToast('Le nombre de règles simultanées doit être entre 1 et 50', 'error');
    return;
  }
  
  // Update app state
  Object.assign(appState.settings, formData);
  appState.saveSettings();
  
  showToast('Paramètres sauvegardés avec succès', 'success');
}

function resetSettings() {
  if (confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) {
    // Reset to defaults
    appState.settings = {
      theme: 'dark',
      pollingInterval: 2.0,
      logLevel: 'info',
      startupEngine: false,
      minimizeToTray: true,
      notificationsEnabled: true,
      maxConcurrentRules: 10,
      ruleTimeout: 30,
      backupFrequency: 24,
      debugMode: false,
      performanceMonitoring: true
    };
    
    appState.saveSettings();
    loadSettingsForm();
    
    showToast('Paramètres réinitialisés', 'info');
  }
}

function exportSettings() {
  try {
    const settingsJson = JSON.stringify(appState.settings, null, 2);
    const blob = new Blob([settingsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `appflow-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Paramètres exportés avec succès', 'success');
  } catch (error) {
    showToast('Erreur lors de l\'export des paramètres', 'error');
  }
}

function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        
        // Validate settings structure
        const requiredKeys = ['pollingInterval', 'logLevel', 'theme'];
        const hasRequiredKeys = requiredKeys.every(key => key in settings);
        
        if (!hasRequiredKeys) {
          throw new Error('Fichier de paramètres invalide');
        }
        
        appState.settings = { ...appState.settings, ...settings };
        appState.saveSettings();
        loadSettingsForm();
        
        showToast('Paramètres importés avec succès', 'success');
      } catch (error) {
        showToast('Erreur lors de l\'import: ' + error.message, 'error');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

// Enhanced rule management functions
function refreshRules() {
  rulesManager.loadRules().then(() => {
    updateStats();
  });
}

function executeRule(ruleName) {
  if (ruleName) {
    ipcRenderer.send('run-rule', ruleName);
    showToast(`Exécution de la règle "${ruleName}"`, 'info');
    
    // Add to analytics
    analyticsManager.data.executions.push({
      timestamp: new Date(),
      ruleName: ruleName,
      success: true
    });
  }
}

function editRule(ruleId) {
  const rule = rulesManager.rules.find(r => r.id === ruleId);
  if (!rule) return;
  
  appState.isEditing = true;
  appState.editingRuleName = rule.name;
  
  document.getElementById('modal-title').textContent = 'Éditer la règle';
  document.getElementById('rule-name').value = rule.name || '';
  document.getElementById('rule-description').value = rule.description || '';
  document.getElementById('rule-cooldown').value = rule.cooldown || '';
  document.getElementById('rule-enabled').checked = rule.enabled !== false;
  
  appState.editorTriggers = rule.triggers || [];
  appState.editorActions = rule.actions || [];
  
  dragDropManager.renderBuilder();
  openRuleModal();
}

async function deleteRule(ruleName) {
  if (confirm(`Êtes-vous sûr de vouloir supprimer la règle "${ruleName}" ?`)) {
    const result = await ipcRenderer.invoke('delete-rule', ruleName);
    if (result.success) {
      showToast('Règle supprimée avec succès !', 'success');
      refreshRules();
    } else {
      showToast('Erreur lors de la suppression : ' + result.message, 'error');
    }
  }
}

function selectAllRules() {
  const allSelected = rulesManager.selectedRules.size === rulesManager.filteredRules.length;
  
  if (allSelected) {
    rulesManager.selectedRules.clear();
  } else {
    rulesManager.filteredRules.forEach(rule => {
      rulesManager.selectedRules.add(rule.id);
    });
  }
  
  // Update checkboxes
  document.querySelectorAll('.rule-checkbox').forEach((checkbox, index) => {
    const rule = rulesManager.filteredRules[index];
    if (rule) {
      checkbox.checked = rulesManager.selectedRules.has(rule.id);
    }
  });
  
  rulesManager.updateBulkActions();
}

function bulkEnableRules() {
  const selectedRules = Array.from(rulesManager.selectedRules);
  selectedRules.forEach(ruleId => {
    const rule = rulesManager.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = true;
      rulesManager.saveRule(rule);
    }
  });
  
  rulesManager.selectedRules.clear();
  rulesManager.renderRules();
  showToast(`${selectedRules.length} règles activées`, 'success');
}

function bulkDisableRules() {
  const selectedRules = Array.from(rulesManager.selectedRules);
  selectedRules.forEach(ruleId => {
    const rule = rulesManager.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = false;
      rulesManager.saveRule(rule);
    }
  });
  
  rulesManager.selectedRules.clear();
  rulesManager.renderRules();
  showToast(`${selectedRules.length} règles désactivées`, 'warning');
}

function bulkDeleteRules() {
  const selectedCount = rulesManager.selectedRules.size;
  
  if (confirm(`Êtes-vous sûr de vouloir supprimer ${selectedCount} règles ?`)) {
    const selectedRules = Array.from(rulesManager.selectedRules);
    
    selectedRules.forEach(async (ruleId) => {
      const rule = rulesManager.rules.find(r => r.id === ruleId);
      if (rule) {
        await ipcRenderer.invoke('delete-rule', rule.name);
      }
    });
    
    rulesManager.selectedRules.clear();
    refreshRules();
    showToast(`${selectedCount} règles supprimées`, 'info');
  }
}

// Engine management functions
async function startEngine() {
  const result = await ipcRenderer.invoke('start-engine');
  if (result.success) {
    showToast('Moteur démarré avec succès !', 'success');
    appState.engineRunning = true;
    updateEngineStatus();
  } else {
    showToast('Erreur lors du démarrage : ' + result.message, 'error');
  }
}

async function stopEngine() {
  const result = await ipcRenderer.invoke('stop-engine');
  if (result.success) {
    showToast('Moteur arrêté', 'info');
    appState.engineRunning = false;
    updateEngineStatus();
  }
}

async function updateEngineStatus() {
  const running = await ipcRenderer.invoke('engine-status');
  appState.engineRunning = running;
  
  const statusText = document.getElementById('engine-status-text');
  const statusDot = document.getElementById('engine-dot');
  const startBtn = document.getElementById('start-engine');
  const stopBtn = document.getElementById('stop-engine');
  
  if (statusText) statusText.textContent = running ? 'En cours' : 'Arrêté';
  if (statusDot) statusDot.className = running ? 'status-dot running' : 'status-dot';
  if (startBtn) startBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
}

// Modal management
function openRuleModal() {
  if (!appState.isEditing) {
    // Reset form for new rule
    document.getElementById('modal-title').textContent = 'Créer nouvelle règle';
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-description').value = '';
    document.getElementById('rule-cooldown').value = '';
    document.getElementById('rule-enabled').checked = true;
    appState.editorTriggers = [];
    appState.editorActions = [];
    dragDropManager.renderBuilder();
  }
  
  document.getElementById('rule-modal').classList.add('show');
}

function closeRuleModal() {
  document.getElementById('rule-modal').classList.remove('show');
  appState.isEditing = false;
  appState.editingRuleName = null;
}

function saveRule() {
  const name = document.getElementById('rule-name').value.trim();
  const description = document.getElementById('rule-description').value.trim();
  const cooldown = document.getElementById('rule-cooldown').value;
  const enabled = document.getElementById('rule-enabled').checked;
  
  if (!name) {
    showToast('Le nom de la règle est requis', 'error');
    return;
  }
  
  if (appState.editorTriggers.length === 0 && appState.editorActions.length === 0) {
    showToast('Ajoutez au moins un déclencheur ou une action', 'error');
    return;
  }
  
  const rule = {
    name: name,
    triggers: appState.editorTriggers,
    actions: appState.editorActions,
    enabled: enabled
  };
  
  if (description) {
    rule.description = description;
  }
  
  if (cooldown && !isNaN(parseFloat(cooldown))) {
    rule.cooldown = parseFloat(cooldown);
  }
  
  ipcRenderer.send('save-rule', rule);
}

function removeRuleElement(type, index) {
  if (type === 'trigger') {
    appState.editorTriggers.splice(index, 1);
  } else {
    appState.editorActions.splice(index, 1);
  }
  dragDropManager.renderBuilder();
}

// Suggestions management
async function generateSuggestions() {
  const container = document.getElementById('suggestions-container');
  container.innerHTML = '<div style="color: var(--text-gray); text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Génération des suggestions...</div>';
  
  try {
    const { spawn } = require('child_process');
    const script = path.join(__dirname, '../../main/appflow.py');
    const logPath = path.join(__dirname, '../../appflow.log');
    const pythonBin = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    
    const child = spawn(pythonBin, [script, '--suggest', '--log', logPath]);
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        displaySuggestions(output);
      } else {
        container.innerHTML = '<div style="color: var(--danger-color); text-align: center;">Erreur lors de la génération des suggestions</div>';
      }
    });
    
    child.on('error', (error) => {
      console.error('Error generating suggestions:', error);
      container.innerHTML = '<div style="color: var(--danger-color); text-align: center;">Erreur: ' + error.message + '</div>';
    });
    
  } catch (error) {
    container.innerHTML = '<div style="color: var(--danger-color); text-align: center;">Erreur: ' + error.message + '</div>';
  }
}

function displaySuggestions(output) {
  const container = document.getElementById('suggestions-container');
  const lines = output.split('\n').filter(line => line.trim());
  
  if (lines.length === 0 || lines.some(line => line.includes('No suggestions'))) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-gray);">
        <i class="fas fa-lightbulb fa-3x" style="opacity: 0.3; margin-bottom: 20px;"></i>
        <div>Aucune suggestion disponible pour le moment.</div>
        <div style="font-size: 0.9rem; margin-top: 10px;">Utilisez AppFlow davantage pour générer des suggestions intelligentes.</div>
      </div>
    `;
    return;
  }
  
  const suggestionsList = document.createElement('div');
  suggestionsList.className = 'suggestions-list';
  
  lines.forEach(line => {
    if (line.trim() && !line.includes('Suggested workflows:')) {
      const suggestion = document.createElement('div');
      suggestion.className = 'suggestion-item';
      suggestion.innerHTML = `
        <i class="suggestion-icon fas fa-lightbulb"></i>
        <span>${line.replace(/^-\s*/, '')}</span>
        <button class="btn" onclick="applySuggestion('${line.replace(/^-\s*/, '').replace(/'/g, "\\'")}')">
          <i class="fas fa-plus"></i>
          Appliquer
        </button>
      `;
      suggestionsList.appendChild(suggestion);
    }
  });
  
  container.innerHTML = '';
  container.appendChild(suggestionsList);
}

function applySuggestion(suggestion) {
  // Parse suggestion and create rule template
  showToast('Fonction d\'application de suggestion en développement', 'info');
}

// Statistics and analytics
function updateStats() {
  const rulesCount = rulesManager.rules.filter(r => r.enabled !== false).length;
  const executionsCount = getExecutionsCount();
  
  document.getElementById('rules-count').textContent = rulesCount;
  document.getElementById('executions-count').textContent = executionsCount;
}

function getExecutionsCount() {
  const logContent = logManager.loadLogContent();
  const today = new Date().toISOString().split('T')[0];
  const todayExecutions = (logContent.match(new RegExp(`\\[${today}.*?\\].*?Executing rule:`, 'g')) || []).length;
  return todayExecutions;
}

function loadAnalyticsData() {
  analyticsManager.loadAnalyticsData();
}

function renderLogs() {
  logManager.loadLogs();
}

// Event listeners setup
function initializeEventListeners() {
  // Engine controls
  document.getElementById('start-engine')?.addEventListener('click', startEngine);
  document.getElementById('stop-engine')?.addEventListener('click', stopEngine);
  
  // Rules management
  document.getElementById('refresh-rules')?.addEventListener('click', refreshRules);
  document.getElementById('create-rule-btn')?.addEventListener('click', openRuleModal);
  document.getElementById('save-rule')?.addEventListener('click', saveRule);
  
  // Bulk actions
  document.getElementById('select-all-rules')?.addEventListener('click', selectAllRules);
  document.getElementById('bulk-enable')?.addEventListener('click', bulkEnableRules);
  document.getElementById('bulk-disable')?.addEventListener('click', bulkDisableRules);
  document.getElementById('bulk-delete')?.addEventListener('click', bulkDeleteRules);
  
  // Log management
  document.getElementById('refresh-log')?.addEventListener('click', () => logManager.loadLogs());
  document.getElementById('clear-log')?.addEventListener('click', () => logManager.clearLogs());
  document.getElementById('export-log')?.addEventListener('click', () => logManager.exportLogs());
  document.getElementById('auto-refresh-toggle')?.addEventListener('click', () => logManager.toggleAutoRefresh());
  
  // Suggestions
  document.getElementById('generate-suggestions')?.addEventListener('click', generateSuggestions);
  
  // Settings
  document.getElementById('save-settings')?.addEventListener('click', saveSettings);
  document.getElementById('reset-settings')?.addEventListener('click', resetSettings);
  document.getElementById('export-settings')?.addEventListener('click', exportSettings);
  document.getElementById('import-settings')?.addEventListener('click', importSettings);
  
  // Theme switcher
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      themeManager.applyTheme(btn.dataset.theme);
    });
  });
  
  // Search filters
  document.getElementById('rules-search')?.addEventListener('input', (e) => {
    appState.filters.rules = e.target.value;
    rulesManager.applyFilters();
  });
  
  document.getElementById('log-filter')?.addEventListener('input', (e) => {
    appState.filters.logs = e.target.value;
    logManager.applyLogFilters();
  });
  
  // Other actions
  document.getElementById('open-rules-folder')?.addEventListener('click', () => {
    ipcRenderer.invoke('open-rules-folder');
  });
  
  // IPC listeners
  ipcRenderer.on('engine-status-changed', (_, running) => {
    appState.engineRunning = running;
    updateEngineStatus();
  });
  
  ipcRenderer.on('rule-saved', (_, result) => {
    if (result.success) {
      showToast('Règle sauvegardée avec succès !', 'success');
      closeRuleModal();
      refreshRules();
    } else {
      showToast('Erreur lors de la sauvegarde : ' + result.error, 'error');
    }
  });
  
  ipcRenderer.on('start-engine-request', startEngine);
  ipcRenderer.on('stop-engine-request', stopEngine);
}

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'n':
          e.preventDefault();
          openRuleModal();
          break;
        case 'r':
          e.preventDefault();
          if (appState.currentTab === 'rules') {
            refreshRules();
          } else if (appState.currentTab === 'logs') {
            logManager.loadLogs();
          }
          break;
        case 's':
          if (document.getElementById('rule-modal').classList.contains('show')) {
            e.preventDefault();
            saveRule();
          } else if (appState.currentTab === 'settings') {
            e.preventDefault();
            saveSettings();
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
          e.preventDefault();
          const tabIndex = parseInt(e.key) - 1;
          const tabs = ['dashboard', 'rules', 'suggestions', 'analytics', 'logs', 'settings'];
          if (tabs[tabIndex]) {
            navigationManager.switchTab(tabs[tabIndex]);
          }
          break;
      }
    }
    
    if (e.key === 'Escape') {
      closeRuleModal();
    }
    
    if (e.key === 'F5') {
      e.preventDefault();
      location.reload();
    }
  });
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 AppFlow Enhanced starting...');
  
  // Initialize all components
  initializeEventListeners();
  initializeKeyboardShortcuts();
  
  // Load initial data
  refreshRules();
  updateEngineStatus();
  updateSystemMetrics();
  loadRecentActivity();
  
  // Set up auto-refresh intervals
  setInterval(() => {
    if (appState.currentTab === 'dashboard') {
      updateSystemMetrics();
      loadRecentActivity();
    } else if (appState.currentTab === 'analytics') {
      analyticsManager.loadAnalyticsData();
    } else if (appState.currentTab === 'suggestions') {
      updateAIMetrics();
    }
  }, 5000);
  
  // Start log auto-refresh if enabled
  logManager.startAutoRefresh();
  
  // Set up periodic stats updates
  setInterval(updateStats, 10000);
  
  // Initialize navigation from URL hash
  const hash = window.location.hash.replace('#', '');
  if (hash && ['dashboard', 'rules', 'suggestions', 'analytics', 'logs', 'settings'].includes(hash)) {
    navigationManager.switchTab(hash, false);
  }
  
  console.log('✅ AppFlow Enhanced initialized successfully');
  
  // Show welcome message
  showToast('Bienvenue dans AppFlow Enhanced ! 🎉', 'success', 3000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  logManager.stopAutoRefresh();
  if (window.themeIntervals) {
    window.themeIntervals.forEach(clearInterval);
  }
});

// Export for global access
window.AppFlow = {
  state: appState,
  managers: {
    theme: themeManager,
    navigation: navigationManager,
    rules: rulesManager,
    analytics: analyticsManager,
    log: logManager,
    dragDrop: dragDropManager
  },
  utils: {
    showToast,
    updateSystemMetrics,
    loadRecentActivity,
    updateAIMetrics
  }
};
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const yaml = require('js-yaml');

// Global variables
let currentRules = [];
let editorTriggers = [];
let editorActions = [];
let isEditing = false;
let editingRuleName = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  refreshRules();
  renderLog();
  updateEngineStatus();
  
  // Auto-refresh intervals
  setInterval(renderLog, 3000);
  setInterval(refreshRules, 10000);
  setInterval(updateStats, 5000);
});

function initializeEventListeners() {
  // Engine controls
  document.getElementById('start-engine').addEventListener('click', startEngine);
  document.getElementById('stop-engine').addEventListener('click', stopEngine);
  document.getElementById('open-rules-folder').addEventListener('click', () => {
    ipcRenderer.invoke('open-rules-folder');
  });

  // Rules management
  document.getElementById('refresh-rules').addEventListener('click', refreshRules);
  document.getElementById('create-rule-btn').addEventListener('click', openRuleModal);
  document.getElementById('save-rule').addEventListener('click', saveRule);

  // Log management
  document.getElementById('refresh-log').addEventListener('click', renderLog);
  document.getElementById('clear-log').addEventListener('click', clearLog);

  // Suggestions
  document.getElementById('generate-suggestions').addEventListener('click', generateSuggestions);

  // IPC listeners
  ipcRenderer.on('engine-status-changed', (_, running) => {
    updateEngineButtons(running);
  });

  ipcRenderer.on('rule-saved', (_, result) => {
    if (result.success) {
      showNotification('Règle sauvegardée avec succès !', 'success');
      closeRuleModal();
      refreshRules();
    } else {
      showNotification('Erreur lors de la sauvegarde : ' + result.error, 'error');
    }
  });

  ipcRenderer.on('start-engine-request', startEngine);
  ipcRenderer.on('stop-engine-request', stopEngine);

  // Drag and drop setup
  initializeDragAndDrop();
}

function loadRules() {
  const rulesDir = path.resolve(__dirname, 'rules');
  try {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml'));
    const rules = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(rulesDir, file), 'utf8');
        const data = yaml.load(content);
        if (Array.isArray(data)) {
          rules.push(...data.map(rule => ({ ...rule, source: file })));
        }
      } catch (err) {
        console.error('Failed to parse', file, err);
      }
    }
    return rules;
  } catch (error) {
    console.error('Error loading rules:', error);
    return [];
  }
}

function refreshRules() {
  currentRules = loadRules();
  renderRules(currentRules);
  updateStats();
}

function renderRules(rules) {
  const list = document.getElementById('rules-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (rules.length === 0) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-gray);">Aucune règle trouvée. Créez votre première règle !</div>';
    return;
  }
  
  for (const rule of rules) {
    const item = document.createElement('div');
    item.className = 'rule-item';
    
    const info = document.createElement('div');
    info.className = 'rule-info';
    
    const name = document.createElement('div');
    name.className = 'rule-name';
    name.textContent = rule.name || 'Règle sans nom';
    
    const description = document.createElement('div');
    description.className = 'rule-description';
    description.textContent = getReadableRuleDescription(rule);
    
    info.appendChild(name);
    info.appendChild(description);
    
    const actions = document.createElement('div');
    actions.className = 'rule-actions';
    
    const runBtn = document.createElement('button');
    runBtn.className = 'btn success';
    runBtn.innerHTML = '▶️ Exécuter';
    runBtn.addEventListener('click', () => executeRule(rule.name));
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.innerHTML = '✏️ Éditer';
    editBtn.addEventListener('click', () => editRule(rule));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.innerHTML = '🗑️ Supprimer';
    deleteBtn.addEventListener('click', () => deleteRule(rule.name));
    
    actions.appendChild(runBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    
    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

function getReadableRuleDescription(rule) {
  const triggers = rule.triggers || [];
  const actions = rule.actions || [];
  
  let desc = '';
  if (triggers.length > 0) {
    desc += 'Déclencheurs: ' + triggers.map(t => {
      const key = Object.keys(t)[0];
      const value = t[key];
      return `${key}(${value})`;
    }).join(', ');
  }
  
  if (actions.length > 0) {
    if (desc) desc += ' | ';
    desc += 'Actions: ' + actions.map(a => {
      const key = Object.keys(a)[0];
      return key;
    }).join(', ');
  }
  
  return desc || 'Aucune description disponible';
}

function executeRule(ruleName) {
  if (ruleName) {
    ipcRenderer.send('run-rule', ruleName);
    showNotification(`Exécution de la règle "${ruleName}"`, 'info');
  }
}

function editRule(rule) {
  isEditing = true;
  editingRuleName = rule.name;
  
  document.getElementById('modal-title').textContent = 'Éditer la règle';
  document.getElementById('rule-name').value = rule.name || '';
  document.getElementById('rule-description').value = rule.description || '';
  document.getElementById('rule-cooldown').value = rule.cooldown || '';
  
  editorTriggers = rule.triggers || [];
  editorActions = rule.actions || [];
  
  renderBuilder();
  openRuleModal();
}

async function deleteRule(ruleName) {
  if (confirm(`Êtes-vous sûr de vouloir supprimer la règle "${ruleName}" ?`)) {
    const result = await ipcRenderer.invoke('delete-rule', ruleName);
    if (result.success) {
      showNotification('Règle supprimée avec succès !', 'success');
      refreshRules();
    } else {
      showNotification('Erreur lors de la suppression : ' + result.message, 'error');
    }
  }
}

async function startEngine() {
  const result = await ipcRenderer.invoke('start-engine');
  if (result.success) {
    showNotification('Moteur démarré avec succès !', 'success');
  } else {
    showNotification('Erreur lors du démarrage : ' + result.message, 'error');
  }
}

async function stopEngine() {
  const result = await ipcRenderer.invoke('stop-engine');
  if (result.success) {
    showNotification('Moteur arrêté', 'info');
  }
}

async function updateEngineStatus() {
  const running = await ipcRenderer.invoke('engine-status');
  updateEngineButtons(running);
}

function updateEngineButtons(running) {
  const startBtn = document.getElementById('start-engine');
  const stopBtn = document.getElementById('stop-engine');
  const statusText = document.getElementById('engine-status');
  const statusDot = document.getElementById('engine-dot');
  
  if (startBtn) startBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
  
  if (statusText) {
    statusText.textContent = running ? 'Moteur en cours' : 'Moteur arrêté';
  }
  
  if (statusDot) {
    statusDot.className = running ? 'status-dot running' : 'status-dot';
  }
}

function loadLog() {
  const logPath = path.resolve(__dirname, '../../appflow.log');
  try {
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8');
    }
  } catch (error) {
    console.error('Error reading log:', error);
  }
  return '';
}

function renderLog() {
  const container = document.getElementById('log-container');
  if (!container) return;
  
  const logContent = loadLog();
  const lines = logContent.split('\n').filter(line => line.trim());
  
  container.innerHTML = '';
  
  if (lines.length === 0) {
    container.innerHTML = '<div style="color: var(--text-gray); font-style: italic;">Aucun log disponible</div>';
    return;
  }
  
  // Show last 50 lines
  const recentLines = lines.slice(-50);
  
  recentLines.forEach(line => {
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    
    // Parse timestamp and message
    const match = line.match(/^\[(.*?)\]\s+(.*)$/);
    if (match) {
      const timestamp = match[1];
      const message = match[2];
      
      logLine.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-message">${message}</span>`;
    } else {
      logLine.innerHTML = `<span class="log-message">${line}</span>`;
    }
    
    container.appendChild(logLine);
  });
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  if (confirm('Êtes-vous sûr de vouloir vider les logs ?')) {
    const logPath = path.resolve(__dirname, '../../appflow.log');
    try {
      fs.writeFileSync(logPath, '', 'utf8');
      renderLog();
      showNotification('Logs vidés', 'info');
    } catch (error) {
      showNotification('Erreur lors du vidage des logs', 'error');
    }
  }
}

async function generateSuggestions() {
  const container = document.getElementById('suggestions-container');
  container.innerHTML = '<div style="color: var(--text-gray);">Génération des suggestions...</div>';
  
  try {
    // Call Python script to generate suggestions
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
        container.innerHTML = '<div style="color: var(--danger-color);">Erreur lors de la génération des suggestions</div>';
      }
    });
    
    child.on('error', (error) => {
      console.error('Error generating suggestions:', error);
      container.innerHTML = '<div style="color: var(--danger-color);">Erreur: ' + error.message + '</div>';
    });
    
  } catch (error) {
    container.innerHTML = '<div style="color: var(--danger-color);">Erreur: ' + error.message + '</div>';
  }
}

function displaySuggestions(output) {
  const container = document.getElementById('suggestions-container');
  const lines = output.split('\n').filter(line => line.trim());
  
  if (lines.length === 0 || lines.some(line => line.includes('No suggestions'))) {
    container.innerHTML = '<div style="color: var(--text-gray); font-style: italic;">Aucune suggestion disponible pour le moment. Utilisez AppFlow davantage pour générer des suggestions intelligentes.</div>';
    return;
  }
  
  const suggestionsList = document.createElement('div');
  suggestionsList.className = 'suggestions-list';
  
  lines.forEach(line => {
    if (line.trim() && !line.includes('Suggested workflows:')) {
      const suggestion = document.createElement('div');
      suggestion.className = 'suggestion-item';
      suggestion.textContent = line.replace(/^-\s*/, '');
      suggestionsList.appendChild(suggestion);
    }
  });
  
  container.innerHTML = '';
  container.appendChild(suggestionsList);
}

function updateStats() {
  const rulesCount = document.getElementById('rules-count');
  const executionsCount = document.getElementById('executions-count');
  
  if (rulesCount) {
    rulesCount.textContent = currentRules.length;
  }
  
  if (executionsCount) {
    // Count executions from log
    const logContent = loadLog();
    const executions = (logContent.match(/Executing rule:/g) || []).length;
    executionsCount.textContent = executions;
  }
}

// Modal functions
function openRuleModal() {
  if (!isEditing) {
    // Reset form for new rule
    document.getElementById('modal-title').textContent = 'Créer nouvelle règle';
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-description').value = '';
    document.getElementById('rule-cooldown').value = '';
    editorTriggers = [];
    editorActions = [];
    renderBuilder();
  }
  
  document.getElementById('rule-modal').classList.add('show');
}

function closeRuleModal() {
  document.getElementById('rule-modal').classList.remove('show');
  isEditing = false;
  editingRuleName = null;
}

// Drag and drop functionality
function initializeDragAndDrop() {
  const builder = document.getElementById('rule-builder');
  if (!builder) return;

  builder.addEventListener('dragover', (e) => {
    e.preventDefault();
    builder.classList.add('drag-over');
  });

  builder.addEventListener('dragleave', (e) => {
    e.preventDefault();
    builder.classList.remove('drag-over');
  });

  builder.addEventListener('drop', (e) => {
    e.preventDefault();
    builder.classList.remove('drag-over');
    
    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;
    
    const value = prompt(`Valeur pour ${type}:`);
    if (value === null) return;
    
    const obj = {};
    obj[type] = ['wait', 'battery_below', 'cpu_above', 'network_above', 'cooldown'].includes(type) 
      ? parseFloat(value) : value;
    
    if (['app_start','app_exit','at_time','battery_below','cpu_above','network_above'].includes(type)) {
      editorTriggers.push(obj);
    } else {
      editorActions.push(obj);
    }
    
    renderBuilder();
  });

  // Setup draggable elements
  document.querySelectorAll('.draggable').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.type);
    });
  });
}

function renderBuilder() {
  const builder = document.getElementById('rule-builder');
  if (!builder) return;
  
  const parts = [];
  
  if (editorTriggers.length > 0) {
    parts.push('🎯 Déclencheurs: ' + editorTriggers.map(t => {
      const key = Object.keys(t)[0];
      const value = t[key];
      return `${key}(${value})`;
    }).join(', '));
  }
  
  if (editorActions.length > 0) {
    parts.push('⚡ Actions: ' + editorActions.map(a => {
      const key = Object.keys(a)[0];
      const value = a[key];
      return `${key}(${value})`;
    }).join(', '));
  }
  
  builder.textContent = parts.join('\n\n') || 'Glissez les éléments ici pour construire votre règle';
}

function saveRule() {
  const name = document.getElementById('rule-name').value.trim();
  const description = document.getElementById('rule-description').value.trim();
  const cooldown = document.getElementById('rule-cooldown').value;
  
  if (!name) {
    showNotification('Le nom de la règle est requis', 'error');
    return;
  }
  
  if (editorTriggers.length === 0 && editorActions.length === 0) {
    showNotification('Ajoutez au moins un déclencheur ou une action', 'error');
    return;
  }
  
  const rule = {
    name: name,
    triggers: editorTriggers,
    actions: editorActions,
    enabled: true
  };
  
  if (description) {
    rule.description = description;
  }
  
  if (cooldown && !isNaN(parseFloat(cooldown))) {
    rule.cooldown = parseFloat(cooldown);
  }
  
  ipcRenderer.send('save-rule', rule);
}

// Notification system
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    transition: all 0.3s ease;
    transform: translateX(100%);
  `;
  
  // Set color based on type
  switch (type) {
    case 'success':
      notification.style.background = 'var(--success-color)';
      break;
    case 'error':
      notification.style.background = 'var(--danger-color)';
      break;
    case 'warning':
      notification.style.background = 'var(--warning-color)';
      break;
    default:
      notification.style.background = 'var(--primary-color)';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'n':
        e.preventDefault();
        openRuleModal();
        break;
      case 'r':
        e.preventDefault();
        refreshRules();
        break;
      case 's':
        if (document.getElementById('rule-modal').classList.contains('show')) {
          e.preventDefault();
          saveRule();
        }
        break;
    }
  }
  
  if (e.key === 'Escape') {
    closeRuleModal();
  }
});

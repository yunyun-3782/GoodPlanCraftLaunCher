/* 
 * CaelLab BY-SA Code License 
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS 

 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher 
 */

let GAME_DIR = null;

async function initGameDir() {
  if (!GAME_DIR) {
    GAME_DIR = await window.gpcl.getGameDir();
  }
  return GAME_DIR;
}


const usernameInput = document.getElementById('username');
const versionSelect = document.getElementById('version');
const launchBtn = document.getElementById('launch-btn');
const statusDiv = document.getElementById('status');

// Download page elements
const cancelDownloadBtn = document.getElementById('cancel-download-btn');
const downloadBtn = document.getElementById('download-btn-page');
const versionListContainer = document.getElementById('version-list-container');
const versionListSection = document.getElementById('version-list-section');
const versionDetailPage = document.getElementById('version-detail-page');
const detailBackBtn = document.getElementById('detail-back-btn');
const detailDownloadBtn = document.getElementById('detail-download-btn');
const versionCountLabel = document.getElementById('version-count-label');

const menuDownload = document.getElementById('menu-download');
const menuLaunch = document.getElementById('menu-launch');
const menuSettings = document.getElementById('menu-settings');
const downloadPage = document.getElementById('download-page');
const launchPanel = document.getElementById('launch-panel');
const mainContent = document.querySelector('.main-content .container');

const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');

// Toast notification system
const toastContainer = document.getElementById('toast-container');
const toastHistory = new Map();
const TOAST_DEDUP_MS = 3000;

const dialogOverlay = document.getElementById('dialog-overlay');
const dialogIcon = document.getElementById('dialog-icon');
const dialogTitle = document.getElementById('dialog-title');
const dialogMessage = document.getElementById('dialog-message');
const dialogFooterSingle = document.getElementById('dialog-footer-single');
const dialogFooterConfirm = document.getElementById('dialog-footer-confirm');
const dialogBtnOk = document.getElementById('dialog-btn-ok');
const dialogBtnYes = document.getElementById('dialog-btn-yes');
const dialogBtnCancel = document.getElementById('dialog-btn-cancel');

let dialogResolve = null;

function showDialog(options) {
  return new Promise((resolve) => {
    dialogResolve = resolve;

    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      question: '❓'
    };

    dialogIcon.textContent = icons[options.type] || icons.info;
    dialogTitle.textContent = options.title || '提示';
    dialogMessage.textContent = options.message || '';

    if (options.type === 'confirm' || options.buttons) {
      dialogFooterSingle.classList.add('hidden');
      dialogFooterConfirm.classList.remove('hidden');
    } else {
      dialogFooterSingle.classList.remove('hidden');
      dialogFooterConfirm.classList.add('hidden');
    }

    dialogOverlay.classList.remove('hidden');
  });
}

function hideDialog() {
  dialogOverlay.classList.add('hidden');
  dialogResolve = null;
}

if (dialogBtnOk) {
  dialogBtnOk.addEventListener('click', () => {
    if (dialogResolve) dialogResolve(true);
    hideDialog();
  });
}

if (dialogBtnYes) {
  dialogBtnYes.addEventListener('click', () => {
    if (dialogResolve) dialogResolve(true);
    hideDialog();
  });
}

if (dialogBtnCancel) {
  dialogBtnCancel.addEventListener('click', () => {
    if (dialogResolve) dialogResolve(false);
    hideDialog();
  });
}

// 监听下载时关闭窗口的询问
if (window.gpcl && window.gpcl.onConfirmCloseWhileDownloading) {
  window.gpcl.onConfirmCloseWhileDownloading(async () => {
    const result = await showDialog({
      type: 'confirm',
      title: '确认关闭',
      message: '当前正在下载中，关闭会停止下载并清理已下载的文件。确定要关闭吗？'
    });

    if (result) {
      // 用户点击"是"，确认关闭并清理
      if (window.gpcl && window.gpcl.confirmCloseDownload) {
        await window.gpcl.confirmCloseDownload();
      }
    } else {
      // 用户点击"否"，取消关闭
      if (window.gpcl && window.gpcl.cancelClose) {
        await window.gpcl.cancelClose();
      }
    }
  });
}

function showToast(title, message, type = 'info', key = null) {
  if (!toastContainer) return;
  if (key) {
    const last = toastHistory.get(key);
    if (last && Date.now() - last < TOAST_DEDUP_MS) return;
    toastHistory.set(key, Date.now());
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div style="flex:1">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Chart elements
let chartLoaded = false;

function loadChartJs() {
  return new Promise((resolve) => {
    if (chartLoaded || window.Chart) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/chart.umd.js';
    script.onload = () => {
      chartLoaded = true;
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

let speedChart = null;
let speedData = [];
let peakSpeed = 0;
const downloadPanel = document.getElementById('download-panel');

let currentPage = 'launch';

function getMaxConcurrentFromSettings() {
  return DEFAULT_MAX_THREADS;
}

function showPage(name) {
  currentPage = name;

  const settingsPage = document.getElementById('settings-page');
  const settingsSidebar = document.getElementById('settings-sidebar');

  if (name === 'download') {
    if (downloadPage) downloadPage.classList.remove('hidden');
    if (launchPanel) launchPanel.classList.add('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
  } else if (name === 'launch') {
    if (downloadPage) downloadPage.classList.add('hidden');
    if (launchPanel) launchPanel.classList.remove('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
  } else if (name === 'settings') {
    if (downloadPage) downloadPage.classList.add('hidden');
    if (launchPanel) launchPanel.classList.add('hidden');
    if (settingsPage) settingsPage.classList.remove('hidden');
    // 默认选中第一个子页面（游戏）
    switchSettingsTab('game');
  }

  if (menuDownload) menuDownload.classList.toggle('active', name === 'download');
  if (menuLaunch) menuLaunch.classList.toggle('active', name === 'launch');
  if (menuSettings) menuSettings.classList.toggle('active', name === 'settings');
}

function switchSettingsTab(tabName) {
  const sidebarItems = document.querySelectorAll('.settings-sidebar-item');
  const contentPanels = document.querySelectorAll('.settings-content-panel');

  sidebarItems.forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });

  contentPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `settings-content-${tabName}`);
    panel.classList.toggle('hidden', panel.id !== `settings-content-${tabName}`);
  });
}

// 更新菜单选中状态（确保菜单始终与当前页面同步）
function updateMenuActive(pageName) {
  if (menuDownload) menuDownload.classList.toggle('active', pageName === 'download');
  if (menuLaunch) menuLaunch.classList.toggle('active', pageName === 'launch');
  if (menuSettings) menuSettings.classList.toggle('active', pageName === 'settings');
}

if (menuDownload) menuDownload.addEventListener('click', () => showPage('download'));
if (menuLaunch) menuLaunch.addEventListener('click', () => showPage('launch'));
if (menuSettings) menuSettings.addEventListener('click', () => showPage('settings'));
if (minimizeBtn) minimizeBtn.addEventListener('click', () => { if (window.gpcl && window.gpcl.minimizeWindow) window.gpcl.minimizeWindow(); });
if (closeBtn) closeBtn.addEventListener('click', () => { 
  if (window.gpcl && typeof window.gpcl.closeWindow === 'function') {
    window.gpcl.closeWindow();
  } else {
    // 备选方案：尝试直接关闭窗口
    window.close();
  }
});

const customSelectHandlers = new Map();

function initCustomSelect(selectId, onChangeCallback) {
  const selectContainer = document.querySelector(`.custom-select[data-select-id="${selectId}"]`);
  if (!selectContainer) return;

  const trigger = selectContainer.querySelector('.custom-select-trigger');
  const dropdown = selectContainer.querySelector('.custom-select-dropdown');
  const valueSpan = selectContainer.querySelector('.custom-select-value');
  const options = selectContainer.querySelectorAll('.custom-select-option');

  // 保存初始状态
  let currentValue = null;
  options.forEach(option => {
    if (option.classList.contains('selected')) {
      currentValue = option.dataset.value;
    }
  });

  // 点击触发器打开/关闭下拉框
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      dropdown.classList.add('open');
      trigger.classList.add('active');
    }
  });

  // 点击选项
  options.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      if (option.classList.contains('disabled')) return;

      const value = option.dataset.value;
      const label = option.textContent;

      // 更新选中状态
      options.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      valueSpan.textContent = label;
      currentValue = value;

      // 关闭下拉框
      closeAllCustomSelects();

      // 调用回调
      if (onChangeCallback) {
        onChangeCallback(value);
      }
    });
  });

  // 保存处理函数以便后续使用
  customSelectHandlers.set(selectId, {
    setValue: (value, label) => {
      options.forEach(opt => opt.classList.remove('selected'));
      const targetOpt = selectContainer.querySelector(`.custom-select-option[data-value="${value}"]`);
      if (targetOpt) {
        targetOpt.classList.add('selected');
        valueSpan.textContent = targetOpt.textContent;
        currentValue = value;
      } else if (label) {
        valueSpan.textContent = label;
        currentValue = value;
      }
    },
    getValue: () => currentValue
  });
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('active'));
}

// 点击页面其他地方关闭下拉框
document.addEventListener('click', closeAllCustomSelects);

// 提供全局访问方法
function setCustomSelectValue(selectId, value, label) {
  const handler = customSelectHandlers.get(selectId);
  if (handler) {
    handler.setValue(value, label);
  }
}

function getCustomSelectValue(selectId) {
  const handler = customSelectHandlers.get(selectId);
  return handler ? handler.getValue() : null;
}

const DEFAULT_MAX_THREADS = 64;
const MAX_THREADS_LIMIT = 128;

// Java版本 - 官方runtime目录名映射（用于显示提示）
const JAVA_RUNTIME_NAME_MAP = {
  "8": "jre-legacy",
  "16": "java-runtime-beta",
  "17": "java-runtime-gamma",
  "21": "java-runtime-delta",
  "25": "java-runtime-epsilon"
};

// Java版本说明（改进版，更准确的推荐）
const JAVA_VERSION_DESC = {
  "8": { mcVersions: "1.7.10 - 1.16.5", desc: "经典版本兼容" },
  "17": { mcVersions: "1.17 - 1.20.4", desc: "最稳定，推荐使用" },
  "21": { mcVersions: "1.20.5 - 1.21+", desc: "最新LTS版本" },
  "25": { mcVersions: "1.21+", desc: "最新尝鲜版" }
};

function getJavaRuntimeName(javaVersion) {
  return JAVA_RUNTIME_NAME_MAP[javaVersion] || `jre${javaVersion}`;
}

// 初始化Java版本状态检测
async function initJavaVersionStatus() {
  const javaVersions = ["8", "17", "21", "25"];

  for (const ver of javaVersions) {
    try {
      const result = await window.gpcl.checkJava(ver);
      const card = document.querySelector(`.java-version-card[data-version="${ver}"]`);
      const badge = document.getElementById(`java-${ver}-status`);
      const btn = card?.querySelector('.java-install-btn');

      if (result.installed) {
        if (card) card.classList.add('installed');
        if (badge) {
          badge.textContent = '已安装';
          badge.className = 'java-version-badge installed';
        }
        if (btn) {
          btn.textContent = '卸载';
          btn.classList.add('installed');
          btn.disabled = false;
        }
      }
    } catch (e) {
      console.error(`检查Java ${ver} 状态失败`, e);
    }
  }

  // 更新Java安装状态提示
  updateJavaInstallStatus();
}

// 更新Java安装状态提示
function updateJavaInstallStatus() {
  const statusEl = document.getElementById('java-install-status');
  if (!statusEl) return;

  const javaVersions = ["8", "17", "21", "25"];
  const installed = [];
  const notInstalled = [];

  javaVersions.forEach(ver => {
    const card = document.querySelector(`.java-version-card[data-version="${ver}"]`);
    if (card?.classList.contains('installed')) {
      installed.push(ver);
    } else {
      notInstalled.push(ver);
    }
  });

  if (installed.length === javaVersions.length) {
    statusEl.textContent = '✅ 所有Java版本均已安装，可以运行任何Minecraft版本';
    statusEl.style.background = 'rgba(76, 175, 80, 0.15)';
  } else {
    statusEl.textContent = `已安装 Java ${installed.join(', ') || '无'} | 未安装 Java ${notInstalled.join(', ')}`;
    statusEl.style.background = 'rgba(79, 195, 247, 0.08)';
  }
}

// 绑定Java安装按钮事件
function bindJavaInstallButtons() {
  const buttons = document.querySelectorAll('.java-install-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const version = btn.dataset.version;
      if (btn.classList.contains('installed')) {
        await uninstallJavaWithPanel(version);
      } else {
        await installJavaWithPanel(version);
      }
    });
  });
}

// 使用通用面板安装Java
async function installJavaWithPanel(javaVersion) {
  const filenameEl = document.getElementById('download-filename');
  const downloadStatusEl = document.getElementById('download-status');
  const downloadPanel = document.getElementById('download-panel');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const cancelBtn = document.getElementById('cancel-download-btn');

  // 滚动到下载页面顶部（用户主动操作）
  const downloadPage = document.getElementById('download-page');
  if (downloadPage) {
    downloadPage.scrollTop = 0;
  }

  // 显示通用下载面板
  if (downloadPanel) {
    downloadPanel.classList.remove('hidden');
    downloadPanel.classList.add('download-panel-container');
  }
  if (filenameEl) filenameEl.textContent = `正在安装: Java ${javaVersion}`;
  if (downloadStatusEl) downloadStatusEl.textContent = `准备下载 Java ${javaVersion}...`;
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '0%';
  if (cancelBtn) cancelBtn.disabled = false;

  // 禁用Java安装按钮
  document.querySelectorAll('.java-install-btn').forEach(btn => {
    btn.disabled = true;
  });

  try {
    const result = await window.gpcl.installJava(javaVersion);

    if (result.success) {
      if (downloadStatusEl) downloadStatusEl.textContent = `✅ Java ${javaVersion} 安装成功！`;
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '100%';

      showToast('安装成功', `Java ${javaVersion} 已安装完成`, 'success', 'java-install-success');

      // 更新Java卡片状态
      const card = document.querySelector(`.java-version-card[data-version="${javaVersion}"]`);
      const badge = document.getElementById(`java-${javaVersion}-status`);
      const btn = card?.querySelector('.java-install-btn');

      if (card) card.classList.add('installed');
      if (badge) {
        badge.textContent = '已安装';
        badge.className = 'java-version-badge installed';
      }
      if (btn) {
        btn.textContent = '卸载';
        btn.classList.add('installed');
        btn.disabled = false;
      }

      updateJavaInstallStatus();

      setTimeout(() => {
        if (downloadPanel) {
          downloadPanel.classList.add('hidden');
          downloadPanel.classList.remove('download-panel-container');
        }
      }, 2000);
    } else {
      throw new Error(result.error || '安装失败');
    }
  } catch (err) {
    if (downloadStatusEl) downloadStatusEl.textContent = `❌ 安装失败: ${err.message || err}`;
    showToast('安装失败', err.message || String(err), 'error', 'java-install-failed');
  }

  // 重新启用Java安装按钮
  document.querySelectorAll('.java-install-btn').forEach(btn => {
    if (!btn.classList.contains('installed')) {
      btn.disabled = false;
    }
  });
  if (cancelBtn) cancelBtn.disabled = true;
}

// 卸载Java运行时（使用弹窗确认）
async function uninstallJavaWithPanel(javaVersion) {
  const confirmed = await showDialog({
    type: 'confirm',
    title: '确认卸载',
    message: `确定要卸载 Java ${javaVersion} 吗？`
  });

  if (!confirmed) return;

  showToast('正在卸载', `正在卸载 Java ${javaVersion}...`, 'info', 'java-uninstalling');

  try {
    const result = await window.gpcl.uninstallJava(javaVersion);

    if (result.success) {
      showToast('卸载成功', `Java ${javaVersion} 已卸载`, 'success', 'java-uninstall-success');

      // 更新Java卡片状态
      const card = document.querySelector(`.java-version-card[data-version="${javaVersion}"]`);
      const badge = document.getElementById(`java-${javaVersion}-status`);
      const btn = card?.querySelector('.java-install-btn');

      if (card) card.classList.remove('installed');
      if (badge) {
        badge.textContent = '';
        badge.className = 'java-version-badge';
      }
      if (btn) {
        btn.textContent = '安装';
        btn.classList.remove('installed');
        btn.disabled = false;
      }

      updateJavaInstallStatus();
    } else {
      throw new Error(result.error || '卸载失败');
    }
  } catch (err) {
    showToast('卸载失败', err.message || String(err), 'error', 'java-uninstall-failed');
  }
}

// 改进的Java版本推荐（基于Minecraft版本JSON）
function getRecommendedJavaVersionFromMC(mcVersion) {
  // 解析Minecraft版本号
  const parts = mcVersion.split('.');
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  let patch = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;

  // 处理无效 major
  if (isNaN(major)) major = 1;

  // Minecraft版本对应Java版本（Mojang官方推荐）
  // 1.7-1.16: Java 8
  // 1.17-1.20.4: Java 17
  // 1.20.5-1.21.4: Java 21
  // 1.22+ / 21+: Java 21
  // 26+: Java 21

  // 处理像 "26" 这种只有 major 没有 minor 的情况
  if (isNaN(minor)) {
    // 26 及以上使用 Java 25
    if (major >= 26) {
      return { version: '25', reason: `Minecraft ${mcVersion} 推荐使用 Java 25` };
    }
    // 21-25 使用 Java 21
    if (major >= 21) {
      return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
    }
    return { version: '17', reason: '使用推荐的稳定版' };
  }

  // 处理 1.x.x 的旧版本
  if (major === 1) {
    if (minor <= 16) {
      return { version: '8', reason: `Minecraft ${mcVersion} 官方推荐 Java 8` };
    } else if (minor <= 20 || (minor === 20 && patch <= 4)) {
      return { version: '17', reason: `Minecraft ${mcVersion} 官方推荐 Java 17` };
    } else if (minor === 20 && patch >= 5) {
      return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
    } else if (minor >= 21) {
      return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
    }
  }

  // 处理 2.x.x 和更大的版本（21, 24, 26, ...）
  if (major >= 2) {
    // 26 及以上使用 Java 25
    if (major >= 26) {
      return { version: '25', reason: `Minecraft ${mcVersion} 推荐使用 Java 25` };
    }
    return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
  }

  // 默认返回最稳定的版本
  return { version: '17', reason: '使用推荐的稳定版' };
}

// 监听Java下载进度
if (window.gpcl && window.gpcl.onDownloadProgress) {
  const originalCallback = window.gpcl.onDownloadProgress;
  window.gpcl.onDownloadProgress((data) => {
    // 更新通用下载面板的进度
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const filenameEl = document.getElementById('download-filename');
    const downloadStatusEl = document.getElementById('download-status');

    if (progressFill && progressText) {
      const percent = data.percent || 0;
      progressFill.style.width = percent + '%';
      progressText.textContent = percent.toFixed(1) + '%';
    }
    if (data.label && filenameEl) {
      filenameEl.textContent = data.label;
    }
    if (data.label && downloadStatusEl) {
      downloadStatusEl.textContent = `正在下载: ${data.label}`;
    }

    // 更新漂浮通知的进度
    const floatProgressFill = document.getElementById('float-progress-fill');
    const floatProgressText = document.getElementById('float-progress-text');
    const floatNotification = document.getElementById('float-notification');
    
    if (floatProgressFill && floatProgressText && !floatNotification.classList.contains('hidden')) {
      const percent = data.percent || 0;
      floatProgressFill.style.width = percent + '%';
      floatProgressText.textContent = percent.toFixed(1) + '%';
    }

    // 调用原始回调
    if (typeof originalCallback === 'function') {
      originalCallback(data);
    }
  });
}

// 漂浮通知控制函数
function showFloatNotification(title, text) {
  const notification = document.getElementById('float-notification');
  const titleEl = document.getElementById('float-notification-title');
  const textEl = document.getElementById('float-notification-text');
  
  if (notification && titleEl && textEl) {
    titleEl.textContent = title;
    textEl.textContent = text;
    
    // 重置进度
    const progressFill = document.getElementById('float-progress-fill');
    const progressText = document.getElementById('float-progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    notification.classList.remove('hidden');
  }
}

function hideFloatNotification() {
  const notification = document.getElementById('float-notification');
  if (notification) {
    notification.classList.add('hidden');
  }
}

// 监听自动下载开始事件（通过游戏日志检测）
if (window.gpcl && window.gpcl.onGameLog) {
  window.gpcl.onGameLog((text) => {
    if (text.includes('Java') && text.includes('未安装') && text.includes('自动开始下载')) {
      const match = text.match(/Java\s+(\d+)/);
      if (match) {
        showFloatNotification(
          `正在下载 Java ${match[1]}`,
          `检测到您没有 Java ${match[1]}，正在自动下载`
        );
      }
    }
  });
}

// 绑定漂浮通知关闭按钮
const floatCloseBtn = document.getElementById('float-notification-close');
if (floatCloseBtn) {
  floatCloseBtn.addEventListener('click', hideFloatNotification);
}

// 监听Java下载完成
if (window.gpcl && window.gpcl.onJavaDownloadCompleted) {
  window.gpcl.onJavaDownloadCompleted((data) => {
    const { javaVersion } = data;
    const downloadStatusEl = document.getElementById('download-status');
    if (downloadStatusEl) {
      downloadStatusEl.textContent = '✅ 下载完成，正在解压安装...';
    }
  });
}

// 监听Java下载失败
if (window.gpcl && window.gpcl.onJavaDownloadFailed) {
  window.gpcl.onJavaDownloadFailed((data) => {
    const { error } = data;
    const downloadStatusEl = document.getElementById('download-status');
    if (downloadStatusEl) {
      downloadStatusEl.textContent = `❌ 下载失败: ${error}`;
    }
    showToast('下载失败', error, 'error', 'java-download-failed');
  });
}

async function loadSettingFromStorage() {
  try {
    const settings = await loadSettings();
    return settings.download?.maxConcurrent || DEFAULT_MAX_THREADS;
  } catch (e) {
    return DEFAULT_MAX_THREADS;
  }
}
async function saveSettingToStorage(maxConcurrent) {
  try {
    const settings = await loadSettings();
    settings.download.maxConcurrent = maxConcurrent;
    await gpcl.saveSettings(settings);
    return true;
  } catch (e) { return false; }
}
const settingsNumInput = document.getElementById('num-threads');
const settingsBtnMinus = document.getElementById('btn-minus');
const settingsBtnPlus = document.getElementById('btn-plus');
const settingsBtnSave = document.getElementById('btn-save');
if (settingsNumInput) {
  (async () => {
    settingsNumInput.value = await loadSettingFromStorage();
  })();
  function clampSettingsInput() {
    let v = parseInt(settingsNumInput.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > MAX_THREADS_LIMIT) v = MAX_THREADS_LIMIT;
    settingsNumInput.value = v;
  }
  settingsNumInput.addEventListener('change', clampSettingsInput);
  settingsNumInput.addEventListener('blur', clampSettingsInput);
  if (settingsBtnMinus) {
    settingsBtnMinus.addEventListener('click', () => {
      let v = parseInt(settingsNumInput.value, 10) || 1;
      if (v > 1) { settingsNumInput.value = v - 1; clampSettingsInput(); }
    });
  }
  if (settingsBtnPlus) {
    settingsBtnPlus.addEventListener('click', () => {
      let v = parseInt(settingsNumInput.value, 10) || 1;
      if (v < MAX_THREADS_LIMIT) { settingsNumInput.value = v + 1; clampSettingsInput(); }
    });
  }
  if (settingsBtnSave) {
    settingsBtnSave.addEventListener('click', async () => {
      clampSettingsInput();
      await saveSettingToStorage(parseInt(settingsNumInput.value, 10));
      const orig = settingsBtnSave.textContent;
      settingsBtnSave.textContent = '已保存!';
      setTimeout(() => { settingsBtnSave.textContent = orig; }, 1500);
    });
  }

async function reloadAllSettingsToUI() {
  const settings = await loadSettings();
  
  const settingsMemory = document.getElementById('settings-memory');
  if (settingsMemory) {
    settingsMemory.value = settings.game?.memory || '4';
  }
  
  const settingsWindowMode = document.getElementById('settings-window-mode');
  if (settingsWindowMode) {
    settingsWindowMode.value = settings.game?.windowMode || 'windowed';
  }
  
  const settingsTheme = document.getElementById('settings-theme');
  if (settingsTheme) {
    settingsTheme.value = settings.appearance?.theme || 'dark';
    applyTheme(settings.appearance?.theme || 'dark');
  }
  
  const settingsScale = document.getElementById('settings-scale');
  if (settingsScale) {
    settingsScale.value = settings.appearance?.scale || '100';
    applyScale(settings.appearance?.scale || '100');
  }
  
  const settingsNumInput = document.getElementById('num-threads');
  if (settingsNumInput) {
    settingsNumInput.value = settings.download?.maxConcurrent || 64;
  }
  
  const javaMirrorSelect = document.getElementById('java-mirror-select');
  const customMirrorContainer = document.getElementById('custom-java-mirror-container');
  const customMirrorUrl = document.getElementById('custom-java-mirror-url');
  if (javaMirrorSelect) {
    javaMirrorSelect.value = settings.download?.javaMirror || 'tsinghua';
    if (customMirrorContainer) {
      customMirrorContainer.classList.toggle('hidden', javaMirrorSelect.value !== 'custom');
    }
    if (customMirrorUrl) {
      customMirrorUrl.value = settings.download?.customJavaMirror || '';
    }
  }
  
  const autoCheckUpdate = document.getElementById('auto-check-update');
  if (autoCheckUpdate) {
    autoCheckUpdate.checked = settings.advanced?.autoCheckUpdate !== false;
  }

  const preventMultipleLaunch = document.getElementById('prevent-multiple-launch');
  if (preventMultipleLaunch) {
    preventMultipleLaunch.checked = settings.advanced?.preventMultipleLaunch !== false;
  }

  const autoClearLogs = document.getElementById('auto-clear-logs');
  const logRetentionContainer = document.getElementById('log-retention-container');
  const logRetentionValue = document.getElementById('log-retention-value');
  const logRetentionUnit = document.getElementById('log-retention-unit');
  
  if (autoClearLogs) {
    autoClearLogs.checked = settings.advanced?.autoClearLogs !== false;
  }
  
  if (logRetentionContainer) {
    logRetentionContainer.classList.toggle('hidden', settings.advanced?.autoClearLogs === false);
  }
  
  if (logRetentionValue) {
    logRetentionValue.value = settings.advanced?.logRetentionValue || 7;
  }
  
  if (logRetentionUnit) {
    logRetentionUnit.value = settings.advanced?.logRetentionUnit || 'day';
  }

  const playStartupAnimationEl = document.getElementById('play-startup-animation');
  if (playStartupAnimationEl) {
    playStartupAnimationEl.checked = settings.advanced?.playStartupAnimation === true;
  }

  const developerModeEl = document.getElementById('developer-mode');
  if (developerModeEl) {
    developerModeEl.checked = settings.advanced?.developerMode === true;
  }
}


}

function initChart() {
  const ctx = document.getElementById('speedChart');
  if (!ctx) return;

  const chartCtx = ctx.getContext('2d');

  const gradient = chartCtx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(79, 195, 247, 0.3)');
  gradient.addColorStop(1, 'rgba(79, 195, 247, 0)');

  speedChart = new Chart(chartCtx, {
    type: 'line',
    data: {
      labels: Array(40).fill(''),
      datasets: [{
        label: '下载速度',
        data: Array(40).fill(0),
        borderColor: '#4fc3f7',
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#4fc3f7'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#4fc3f7',
          borderColor: 'rgba(79, 195, 247, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              return `速度: ${context.parsed.y.toFixed(2)} Mbps`;
            }
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          suggestedMax: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { display: false }
        }
      }
    }
  });
}

function updateChart(speed) {
  if (!speedChart) return;

  speedData.push(speed);
  if (speedData.length > 40) speedData.shift();

  speedChart.data.datasets[0].data = speedData;

  const maxSpeed = Math.max(...speedData, 1);
  speedChart.options.scales.y.suggestedMax = maxSpeed * 1.5;

  speedChart.update('none');
}

function resetChart() {
  speedData = Array(40).fill(0);
  peakSpeed = 0;

  if (speedChart) {
    speedChart.data.datasets[0].data = speedData;
    speedChart.update();
  }

  const currentSpeedEl = document.getElementById('current-speed');
  const peakSpeedEl = document.getElementById('peak-speed');
  const progressFillEl = document.getElementById('progress-fill');
  const progressTextEl = document.getElementById('progress-text');

  if (currentSpeedEl) currentSpeedEl.textContent = '0.00 Mbps';
  if (peakSpeedEl) peakSpeedEl.textContent = '0.00 Mbps';
  if (progressFillEl) progressFillEl.style.width = '0%';
  if (progressTextEl) progressTextEl.textContent = '0%';
}

// 注意：下载进度监听在 startDownload 函数中单独处理，避免全局监听器冲突

// addLog removed - using toast notifications instead

function setStatus(text, type = 'info') {
  statusDiv.textContent = text;
  statusDiv.style.color =
    type === 'error' ? '#ef5350' :
    type === 'success' ? '#66bb6a' :
    '#e0e0e0';
}

async function loadVersions(silent = false) {
  try {
    let versions = [];

    // 尝试调用主进程API
    if (window.gpcl && typeof window.gpcl.scanVersions === 'function') {
      try {
        versions = await window.gpcl.scanVersions(null, silent);
      } catch (e) {
        console.error('调用scanVersions失败:', e);
      }
    }

    // 更新启动按钮状态（无论 versionSelect 是否存在都要更新）
    if (!versions || versions.length === 0) {
      if (!silent) setStatus('没有本地版本，请先下载');
      // 切换按钮为前往下载状态
      updateLaunchButtonState(false);
    } else {
      if (!silent) setStatus(`发现 ${versions.length} 个已安装版本`);
      // 切换按钮为开始游戏状态
      updateLaunchButtonState(true);
    }

    // 检查 versionSelect 是否存在
    if (!versionSelect) {
      if (!silent) console.warn('versionSelect 元素不存在，跳过版本列表渲染');
      return;
    }

    versionSelect.innerHTML = '<option value="">请选择版本</option>';

    if (!versions || versions.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = '未发现已安装的版本';
      versionSelect.appendChild(opt);
      return;
    }

    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    for (const v of versions) {
      let displayName = `Minecraft ${v}`;
      if (window.gpcl && typeof window.gpcl.getVersionDisplayName === 'function') {
        try {
          displayName = await window.gpcl.getVersionDisplayName(v);
        } catch (e) {
          console.warn(`获取版本显示名称失败: ${v}`, e);
        }
      }
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = displayName;
      versionSelect.appendChild(opt);
    }
  } catch (err) {
    if (!silent) {
      setStatus('扫描本地版本失败', 'error');
      showToast('扫描失败', err.message || String(err), 'error');
    }
    // 出错时也更新按钮为无游戏状态
    updateLaunchButtonState(false);
  }
}

// 更新启动按钮状态
function updateLaunchButtonState(hasGame) {
  const launchBtn = document.getElementById('launch-btn');
  const launchText = launchBtn?.querySelector('.launch-text');

  if (launchBtn && launchText) {
    if (hasGame) {
      launchText.textContent = '▶ 开始游戏';
      launchBtn.dataset.mode = 'launch';
      // 移除红色样式
      launchBtn.classList.remove('no-game');
    } else {
      launchText.textContent = '⏬ 前往下载';
      launchBtn.dataset.mode = 'download';
      // 添加红色样式
      launchBtn.classList.add('no-game');
    }
  }
}

// 版本时间记录相关功能
const VERSION_HISTORY_FILE = 'gpcl_version_history.json';
const VERSION_HISTORY_PATH = 'users';

// 获取版本历史记录
async function getVersionHistory() {
  try {
    if (window.gpcl && typeof window.gpcl.readJsonFile === 'function') {
      const history = await window.gpcl.readJsonFile(VERSION_HISTORY_PATH, VERSION_HISTORY_FILE);
      return history || {};
    }
  } catch (e) {
    console.error('从文件读取版本历史失败:', e);
  }
  return {};
}

// 保存版本历史记录
async function saveVersionHistory(history) {
  if (window.gpcl && typeof window.gpcl.writeJsonFile === 'function') {
    try {
      await window.gpcl.writeJsonFile(VERSION_HISTORY_PATH, VERSION_HISTORY_FILE, history);
    } catch (e) {
      console.error('写入版本历史到文件失败:', e);
    }
  }
}

// 记录版本启动时间
async function recordVersionLaunch(versionId) {
  try {
    const history = await getVersionHistory();
    if (!history[versionId]) {
      history[versionId] = {};
    }
    history[versionId].lastLaunch = Date.now();
    await saveVersionHistory(history);
  } catch (e) {
    console.error('记录版本启动时间失败:', e);
  }
}

// 记录版本下载成功时间
async function recordVersionDownload(versionId) {
  try {
    const history = await getVersionHistory();
    if (!history[versionId]) {
      history[versionId] = {};
    }
    history[versionId].downloadTime = Date.now();
    history[versionId].lastLaunch = Date.now(); // 下载成功也作为最后启动时间
    await saveVersionHistory(history);
  } catch (e) {
    console.error('记录版本下载时间失败:', e);
  }
}

// 渲染版本选择列表
async function renderVersionSelectList() {
  const container = document.getElementById('launch-version-list');
  const countEl = document.getElementById('version-count');
  
  if (!container) return;
  
  try {
    let versions = [];
    
    // 尝试调用主进程API
    if (window.gpcl && typeof window.gpcl.scanVersions === 'function') {
      try {
        versions = await window.gpcl.scanVersions(null, true);
      } catch (e) {
        console.error('调用scanVersions失败:', e);
      }
    }
    
    const history = await getVersionHistory();
    
    if (!versions || versions.length === 0) {
      container.innerHTML = '<div class="version-list-empty">暂无已安装的版本</div>';
      countEl.textContent = '0 个版本';
      return;
    }
    
    // 按最后启动时间排序，最近启动的排在前面
    versions.sort((a, b) => {
      const timeA = history[a]?.lastLaunch || history[a]?.downloadTime || 0;
      const timeB = history[b]?.lastLaunch || history[b]?.downloadTime || 0;
      return timeB - timeA;
    });
    
    container.innerHTML = '';
    
    versions.forEach((versionId, index) => {
      const item = document.createElement('div');
      item.className = 'version-item';
      item.dataset.versionId = versionId;
      
      // 获取版本类型图标
      const icon = index === 0 && (history[versionId]?.lastLaunch || history[versionId]?.downloadTime) 
        ? '⭐' : '📦';
      
      // 格式化时间
      const lastTime = history[versionId]?.lastLaunch || history[versionId]?.downloadTime;
      let timeText = '';
      if (lastTime) {
        const date = new Date(lastTime);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        if (diff < 60000) {
          timeText = '刚刚';
        } else if (diff < 3600000) {
          timeText = `${Math.floor(diff / 60000)} 分钟前`;
        } else if (diff < 86400000) {
          timeText = `${Math.floor(diff / 3600000)} 小时前`;
        } else {
          timeText = `${date.getMonth() + 1}/${date.getDate()}`;
        }
      }
      
      item.innerHTML = `
        <span class="version-item-icon">${icon}</span>
        <span class="version-item-id">${versionId}</span>
        <span class="version-item-time">${timeText}</span>
      `;
      
      item.addEventListener('click', () => {
        selectVersion(versionId);
      });
      
      container.appendChild(item);
    });
    
    countEl.textContent = `${versions.length} 个版本`;
    
    // 如果没有选中的版本，自动选中第一个
    if (!selectedVersionId && versions.length > 0) {
      selectVersion(versions[0]);
    }
  } catch (err) {
    container.innerHTML = '<div class="version-list-empty">加载版本列表失败</div>';
    countEl.textContent = '加载失败';
  }
}

// 选择版本
function selectVersion(versionId) {
  selectedVersionId = versionId;

  // 更新UI
  const items = document.querySelectorAll('.version-item');
  items.forEach(item => {
    item.classList.toggle('selected', item.dataset.versionId === versionId);
  });

  const infoEl = document.getElementById('selected-version-info');
  const nameEl = document.getElementById('selected-version-name');

  if (infoEl && nameEl) {
    nameEl.textContent = `Minecraft ${versionId}`;
    infoEl.classList.remove('hidden');
  }

  // 更新启动按钮下方的小字显示
  const displayEl = document.getElementById('selected-version-display');
  const textEl = document.getElementById('selected-version-text');
  if (displayEl && textEl) {
    textEl.textContent = versionId;
    displayEl.classList.remove('hidden');
  }

  // 更新启动按钮状态
  updateLaunchButtonState(true);
}

// 检查版本是否已安装
async function isVersionInstalled(versionId) {
  try {
    const versions = await window.gpcl.scanVersions(null, true);
    return versions.includes(versionId);
  } catch {
    return false;
  }
}

let allVersions = [];
let selectedVersionId = null;

// 模组加载器相关状态
let modLoaderState = {
  forge: { available: false, versions: [], selected: null, expanded: false },
  fabric: { available: false, versions: [], selected: null, expanded: false },
  optifine: { available: false, versions: [], selected: null, expanded: false }
};

// 模组加载器兼容性规则
const MOD_LOADER_COMPATIBILITY = {
  // Forge 和 Fabric 互斥
  forge: ['fabric'],
  fabric: ['forge'],
  // OptiFine 与 Forge/Fabric 都互斥
  optifine: ['forge', 'fabric']
};

// 检测 Forge 可用性
async function checkForgeAvailability(mcVersion) {
  try {
    // Forge 支持 1.1 及以上版本
    const parts = mcVersion.split('.');
    const major = parseInt(parts[0], 10) || 1;
    const minor = parseInt(parts[1], 10) || 0;
    
    // 1.1 以下不支持
    if (major === 1 && minor < 1) {
      return { available: false, versions: [] };
    }
    
    // 从主进程获取 Forge 版本列表
    const result = await window.gpcl.getForgeVersions(mcVersion);
    if (result.success) {
      return { available: result.versions.length > 0, versions: result.versions };
    }
    return { available: false, versions: [] };
  } catch (e) {
    console.error('检测 Forge 可用性失败:', e);
    return { available: false, versions: [] };
  }
}

// 检测所有模组加载器的可用性
async function checkAllModLoaders(mcVersion) {
  // 重置状态
  modLoaderState = {
    forge: { available: false, versions: [], selected: null, expanded: false }
  };
  
  // 检测 Forge
  const forgeResult = await checkForgeAvailability(mcVersion);
  modLoaderState.forge = { ...modLoaderState.forge, ...forgeResult };
  
  // 更新 UI
  updateModLoaderUI();
}

// 更新模组加载器 UI
function updateModLoaderUI() {
  const loaders = ['forge'];
  
  loaders.forEach(loader => {
    const state = modLoaderState[loader];
    const card = document.getElementById(`${loader}-option`);
    const badge = document.getElementById(`${loader}-badge`);
    const content = document.getElementById(`${loader}-content`);
    const loading = document.getElementById(`${loader}-loading`);
    const versionsContainer = document.getElementById(`${loader}-versions`);
    const error = document.getElementById(`${loader}-error`);
    
    if (!card || !badge) return;
    
    // 更新徽章状态
    if (state.available) {
      badge.textContent = '可用';
      badge.className = 'detail-option-badge available';
      card.classList.remove('not-available');
    } else {
      badge.textContent = '不可用';
      badge.className = 'detail-option-badge unavailable';
      card.classList.add('not-available');
    }
    
    // 更新内容区域（仅在已展开时显示）
    if (state.expanded && state.available) {
      content.classList.remove('hidden');
      loading.classList.add('hidden');
      error.classList.add('hidden');
      versionsContainer.classList.remove('hidden');
      
      // 渲染版本列表
      renderModLoaderVersionList(loader, state.versions);
    } else if (state.expanded && !state.available) {
      content.classList.remove('hidden');
      loading.classList.add('hidden');
      versionsContainer.classList.add('hidden');
      error.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });
}

// 渲染模组加载器版本列表
function renderModLoaderVersionList(loader, versions) {
  const container = document.getElementById(`${loader}-versions`);
  if (!container) return;
  
  container.innerHTML = '';
  
  versions.forEach((version, index) => {
    const item = document.createElement('div');
    item.className = 'detail-option-version-item';
    item.dataset.versionId = version.id;
    item.dataset.version = version.version;
    
    // 如果是已选中的版本，添加选中样式
    if (modLoaderState[loader].selected === version.version) {
      item.classList.add('selected');
    }
    
    item.innerHTML = `
      <span class="detail-option-version-name">${version.name}</span>
      <span class="detail-option-version-check">✓</span>
    `;
    
    item.addEventListener('click', () => selectModLoaderVersion(loader, version.version, version.id));
    
    container.appendChild(item);
  });
}

// 选择模组加载器版本
function selectModLoaderVersion(loader, version, versionId) {
  const state = modLoaderState[loader];
  
  // 如果点击的是已选中的版本，则取消选择
  if (state.selected === version) {
    state.selected = null;
  } else {
    state.selected = version;
  }
  
  // 更新版本列表 UI
  const container = document.getElementById(`${loader}-versions`);
  if (container) {
    const items = container.querySelectorAll('.detail-option-version-item');
    items.forEach(item => {
      item.classList.toggle('selected', item.dataset.version === state.selected);
    });
  }
}

// 更新互斥 UI
function updateIncompatibilityUI() {
  // 目前只有 Forge，无需处理互斥
}

// 获取加载器显示名称
function getLoaderDisplayName(loader) {
  const names = {
    forge: 'Forge'
  };
  return names[loader] || loader;
}

// 切换模组加载器展开/折叠
function toggleModLoader(loader) {
  const state = modLoaderState[loader];
  const card = document.getElementById(`${loader}-option`);
  const content = document.getElementById(`${loader}-content`);
  const arrow = card?.querySelector('.detail-option-arrow');
  
  if (!content) return;
  
  // 如果不可用，不允许展开
  if (!state.available) return;
  
  state.expanded = !state.expanded;
  
  if (state.expanded) {
    if (arrow) arrow.classList.add('expanded');
  } else {
    if (arrow) arrow.classList.remove('expanded');
  }
  
  // 重新更新整个 UI
  updateModLoaderUI();
}

// 绑定模组加载器事件
function bindModLoaderEvents() {
  const loaders = ['forge'];
  
  loaders.forEach(loader => {
    const card = document.getElementById(`${loader}-option`);
    if (!card) return;
    
    const header = card.querySelector('.detail-option-header');
    if (header) {
      header.addEventListener('click', () => toggleModLoader(loader));
    }
  });
}

// 重置模组加载器状态
function resetModLoaderState() {
  modLoaderState = {
    forge: { available: false, versions: [], selected: null, expanded: false }
  };
  
  // 重置 UI
  const loaders = ['forge'];
  loaders.forEach(loader => {
    const card = document.getElementById(`${loader}-option`);
    const badge = document.getElementById(`${loader}-badge`);
    const content = document.getElementById(`${loader}-content`);
    const loading = document.getElementById(`${loader}-loading`);
    const versions = document.getElementById(`${loader}-versions`);
    const error = document.getElementById(`${loader}-error`);
    const arrow = card?.querySelector('.detail-option-arrow');
    
    if (card) {
      card.classList.remove('not-available', 'incompatible');
    }
    if (badge) {
      badge.textContent = '检测中...';
      badge.className = 'detail-option-badge';
    }
    if (content) content.classList.add('hidden');
    if (loading) loading.classList.remove('hidden');
    if (versions) versions.classList.add('hidden');
    if (error) error.classList.add('hidden');
    if (arrow) arrow.classList.remove('expanded');
  });
}

function getCategoryLabel(type) {
  const map = { release: '正式版', snapshot: '快照版', old_beta: '老版本 Beta', old_alpha: '老版本 Alpha' };
  return map[type] || type;
}

function getCategoryIcon(type) {
  const map = { release: '🟢', snapshot: '🟡', old_beta: '🟠', old_alpha: '🔴' };
  return map[type] || '⚪';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderVersionList(versionMap) {
  if (!versionListContainer) return;
  versionListContainer.innerHTML = '';

  const categoryOrder = ['release', 'snapshot', 'old_beta', 'old_alpha'];
  let totalCount = 0;

  categoryOrder.forEach(type => {
    const items = versionMap[type];
    if (!items || items.length === 0) return;
    totalCount += items.length;

    const categoryEl = document.createElement('div');
    categoryEl.className = 'version-category';
    categoryEl.dataset.category = type;

    const isRelease = type === 'release';
    const header = document.createElement('div');
    header.className = 'version-category-header';
    header.innerHTML = `
      <span class="version-category-arrow ${isRelease ? '' : 'collapsed'}">▼</span>
      <span class="version-category-icon">${getCategoryIcon(type)}</span>
      <span class="version-category-name">${getCategoryLabel(type)}</span>
      <span class="version-category-count">${items.length} 个版本</span>
    `;

    const body = document.createElement('div');
    body.className = `version-category-items ${isRelease ? '' : 'collapsed'}`;

    items.forEach(v => {
      const item = document.createElement('div');
      item.className = 'version-item';
      item.dataset.versionId = v.id;
      
      const displayName = v.displayName || v.id;
      item.innerHTML = `
        <span class="version-item-id">${displayName}</span>
        <span class="version-item-time">${formatDate(v.releaseTime)}</span>
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        showVersionDetail(v);
      });
      body.appendChild(item);
    });

    header.addEventListener('click', () => {
      const arrow = header.querySelector('.version-category-arrow');
      const isCollapsed = body.classList.toggle('collapsed');
      arrow.classList.toggle('collapsed', isCollapsed);
    });

    categoryEl.appendChild(header);
    categoryEl.appendChild(body);
    versionListContainer.appendChild(categoryEl);
  });

  if (versionCountLabel) {
    versionCountLabel.textContent = `共 ${totalCount} 个版本`;
  }
}

function showVersionDetail(version) {
  selectedVersionId = version.id;
  if (versionListSection) versionListSection.classList.add('hidden');
  if (versionDetailPage) versionDetailPage.classList.remove('hidden');

  // 重置下载按钮状态，确保它是可用的
  if (detailDownloadBtn) detailDownloadBtn.disabled = false;

  const idEl = document.getElementById('detail-version-id');
  const typeEl = document.getElementById('detail-version-type');
  const typeLabelEl = document.getElementById('detail-type-label');
  const timeEl = document.getElementById('detail-release-time');

  if (idEl) idEl.textContent = `Minecraft ${version.id}`;
  if (typeEl) typeEl.textContent = getCategoryLabel(version.type);
  if (typeLabelEl) typeLabelEl.textContent = `${getCategoryIcon(version.type)} ${getCategoryLabel(version.type)}`;
  if (timeEl) timeEl.textContent = formatDate(version.releaseTime) || '未知';
  
  // 重置并检测模组加载器可用性
  resetModLoaderState();
  checkAllModLoaders(version.id);
}

function hideVersionDetail() {
  selectedVersionId = null;
  if (versionDetailPage) versionDetailPage.classList.add('hidden');
  if (versionListSection) versionListSection.classList.remove('hidden');
}

async function loadRemoteVersions() {
  const refreshBtn = document.getElementById('refresh-btn-page');
  try {
    if (refreshBtn) refreshBtn.classList.add('hidden');
    if (versionListContainer) {
      versionListContainer.innerHTML = '<div class="version-list-loading">正在加载版本列表...</div>';
    }
    
    let versions = [];
    
    // 尝试调用主进程API
    if (window.gpcl && typeof window.gpcl.getVersionManifest === 'function') {
      try {
        versions = await window.gpcl.getVersionManifest();
      } catch (e) {
        console.error('调用getVersionManifest失败:', e);
      }
    }
    
    // 尝试从文件缓存获取
    if (!versions || versions.length === 0) {
      try {
        if (window.gpcl && typeof window.gpcl.readJsonFile === 'function') {
          const cached = await window.gpcl.readJsonFile('cache', 'remote_versions.json');
          if (cached) {
            versions = cached;
          }
        }
      } catch (e) {
        console.error('从文件缓存获取远程版本列表失败:', e);
      }
    }
    
    // 如果还是没有数据，显示错误或示例数据
    if (!versions || versions.length === 0) {
      setStatus('无法获取远程版本列表', 'error');
      if (versionListContainer) {
        versionListContainer.innerHTML = '<div class="version-list-error">无法获取版本列表<br><button class="refresh-btn" style="margin-top:12px;" onclick="loadRemoteVersions()">重试</button></div>';
      }
      if (refreshBtn) refreshBtn.classList.remove('hidden');
      return;
    }

    // Group versions by type
    const versionMap = {};
    versions.forEach(v => {
      if (!versionMap[v.type]) versionMap[v.type] = [];
      versionMap[v.type].push(v);
    });

    // 保存到文件缓存
    try {
      if (window.gpcl && typeof window.gpcl.writeJsonFile === 'function') {
        await window.gpcl.writeJsonFile('cache', 'remote_versions.json', versions);
      }
    } catch (e) {
      console.error('保存远程版本列表到缓存失败:', e);
    }

    allVersions = versions;
    renderVersionList(versionMap);
    setStatus('远程版本列表已加载');
  } catch (err) {
    setStatus('无法获取远程版本列表，请检查网络', 'error');
    showToast('版本列表加载失败', err.message || '请检查网络连接', 'error', 'remote-versions-error');
    if (versionListContainer) {
      versionListContainer.innerHTML = '<div class="version-list-error">加载失败，请检查网络连接<br><button class="refresh-btn" style="margin-top:12px;" onclick="loadRemoteVersions()">重试</button></div>';
    }
    if (refreshBtn) refreshBtn.classList.remove('hidden');
  }
}

async function launchGame() {
  // 检查按钮模式
  const launchBtn = document.getElementById('launch-btn');
  const mode = launchBtn?.dataset.mode || 'launch';
  
  if (mode === 'download') {
    // 下载模式：跳转到下载页面
    showPage('download');
    setStatus('请选择要下载的游戏版本');
    return;
  }
  
  // 启动模式：正常启动游戏
  setStatus('[动画] launchGame 函数被调用了');
  const username = usernameInput.value.trim() || 'GPCL_Player';
  
  // 使用右侧面板选择的版本
  const versionId = selectedVersionId;

  if (!versionId) {
    setStatus('请先选择已安装的版本', 'error');
    return;
  }
  
  // 记录版本启动时间（不管是否成功都会记录）
  await recordVersionLaunch(versionId);

  if (window.gpcl && window.gpcl.savePlayerName) {
    await window.gpcl.savePlayerName(username);
  }

  launchBtn.disabled = true;
  
  // 显示启动动画层
  showLaunchAnimation(versionId);

  try {
    // 尝试启动游戏（主进程会自动处理Java下载）
    const gameDir = await initGameDir();
    setStatus('[动画] 开始启动游戏');
    
    // 获取窗口模式设置
    const settings = await loadSettings();
    let windowMode = settings.game?.windowMode || 'windowed';
    let welcomeAnimPlaying = false;
    
    if (settings.advanced?.playStartupAnimation && window.gpcl && window.gpcl.playStartupAnimation) {
      setStatus('[启动动画] 正在播放欢迎动画...');
      welcomeAnimPlaying = true;
      windowMode = 'fullscreen';
      
      settings.advanced.playStartupAnimation = false;
      await gpcl.saveSettings(settings);
      const playStartupEl = document.getElementById('play-startup-animation');
      if (playStartupEl) playStartupEl.checked = false;
      
      await window.gpcl.playStartupAnimation();
      setStatus('[启动动画] 动画播放完毕，正在启动游戏...');
    }
    
    // 确保游戏窗口创建事件监听器已设置
    setupGameWindowListener();
    
    const result = await window.gpcl.launch({
      versionId,
      username,
      gameDir,
      windowMode
    });

    if (result.success) {
      setStatus('[动画] 游戏启动成功，窗口已创建');
      
      if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
        window.gpcl.dismissStartupAnimation();
      }
      
      // 显示成功动画后隐藏
      showLaunchSuccess();
      
      setTimeout(() => {
        hideLaunchAnimation();
      }, 800);
      
      setStatus(`游戏已启动！PID: ${result.pid}`, 'success');
      showToast('游戏已启动', `Minecraft ${versionId} (${username})`, 'success', 'game-started');
    } else if (result.cancelled) {
      // 用户取消了启动
      if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
        window.gpcl.dismissStartupAnimation();
      }
      hideLaunchAnimation();
      setStatus('启动已取消', 'info');
      showToast('启动已取消', '用户取消了游戏启动', 'info', 'launch-cancelled');
    } else {
      if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
        window.gpcl.dismissStartupAnimation();
      }
      hideLaunchAnimation();
      setStatus(result.error, 'error');
      showToast('启动失败', result.error, 'error', 'game-launch-failed');
    }
  } catch (err) {
    if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
      window.gpcl.dismissStartupAnimation();
    }
    hideLaunchAnimation();
    setStatus('启动出错', 'error');
    showToast('启动出错', err.message, 'error', 'launch-error');
  } finally {
    launchBtn.disabled = false;
  }
}

// 显示启动动画
async function showLaunchAnimation(versionId) {
  try {
    const overlay = document.getElementById('launch-animation-overlay');
    const statusText = document.getElementById('launch-status-text');
    const versionInfo = document.getElementById('launch-version-info');
    const progressFill = document.getElementById('launch-progress-fill');
    
    if (overlay) {
      overlay.classList.remove('hidden', 'fade-out', 'launch-success');
      overlay.style.display = 'flex';
      void overlay.offsetHeight;
      overlay.classList.add('show');
      setStatus('[动画] 启动动画层已显示');
    } else {
      setStatus('[动画] 未找到启动动画层元素', 'error');
      return;
    }
    
    if (statusText) {
      statusText.textContent = '正在启动游戏...';
    }
    
    // 获取启动显示名称（不包含 OptiFine）
    let displayName = versionId;
    if (window.gpcl && typeof window.gpcl.getLaunchDisplayName === 'function') {
      try {
        displayName = await window.gpcl.getLaunchDisplayName(versionId);
      } catch (e) {
        console.warn(`获取启动显示名称失败: ${versionId}`, e);
      }
    }
    
    if (versionInfo) {
      versionInfo.textContent = `将启动: ${displayName}`;
    }
    
    if (progressFill) {
      progressFill.style.width = '0%';
    }
    
    simulateLaunchProgress();
    showRandomTip();
  } catch (err) {
    setStatus('[动画] 显示启动动画失败: ' + err.message, 'error');
  }
}

// 小知识列表
const launchTips = [
  'Minecraft 最初由 Markus "Notch" Persson 于 2009 年独立开发，最初版本仅用 6 天完成。',
  'Minecraft 的苦力怕（Creeper）是 Notch 在尝试制作猪模型时，因搞错长宽比而意外诞生的。',
  '末影人（Enderman）会随机搬运一些方块，这是参考了现实中的都市传说 Slender Man。',
  'Minecraft 中最大的自然结构是下界要塞（Nether Fortress），可绵延数百个区块。',
  'Minecraft 中钻石矿石只在 Y 坐标 16 以下生成，最集中的区域是 Y=5 到 Y=12 之间。',
  'Minecraft 的附魔台周围的图书馆架数量会影响附魔等级，最高可达到 30 级。',
  '红石（Redstone）是 Minecraft 中的"电力"系统，可以构建从简单门到计算机的各种电路。',
  'Minecraft 中潮涌核心（Conduit）可以为水下玩家提供无限呼吸和夜视效果。',
  'Minecraft 的下界合金（Netherite）装备需要先制作品铁装备再锻造升级。',
  'Minecraft 中的嗅探兽（Sniffer）是 2022 年 Minecraft Live 由玩家投票选出的生物。',
  'Minecraft 中沼泽小屋（Swamp Hut）必定会生成女巫，是获取红石粉的稳定来源。',
  'Minecraft 中你可以用线制作羊毛，但不能用羊毛反合成线。',
  'Minecraft 的创造模式最初是为开发调试而加入的，后来才成为正式游戏模式。',
  'Minecraft 中装备了冰霜行者（Frost Walker）附魔的靴子可以在水上行走。',
  'Minecraft 中每个区块（Chunk）是 16×16 方块大小，游戏世界是通过区块流式加载的。',
  'Minecraft 中鞘翅（Elytra）可以在末地船中找到，配合烟花火箭可以实现飞行。',
  'Minecraft 中下界对应主世界的比例为 1:8，在下界走 1 格相当于主世界 8 格。',
  'Minecraft 中掠夺者前哨站（Pillager Outpost）会生成灾厄旗帜，周围的灾厄村民不会攻击。',
  'Minecraft 中蜜蜂（Bee）在采蜜后会帮助作物加速生长。',
  'Minecraft 中史莱姆（Slime）只在特定区块生成，可以使用种子计算器定位史莱姆区块。',
  'Minecraft 的唱片机播放的是 C418 创作的音乐，13 和 cat 两张唱片可在要塞的箱子中找到。',
  'Minecraft 中深海监守者（Warden）是盲人，依靠声音和振动感知玩家。',
  'Minecraft 的紫颂果（Chorus Fruit）食用后会随机传送，但会失去一些饥饿值。',
  'Minecraft 中袭击（Raid）是不祥之兆效果进入村庄时触发的多波战斗事件。',
  'Minecraft 中下界传送门（Nether Portal）的大小最小为 4×5，最大为 23×23。',
  'Minecraft 中海龟壳帽（Turtle Shell）可以让玩家在水下呼吸更长时间。',
  'Minecraft 中甜浆果（Sweet Berries）可以在针叶林生物群系中找到，也可种植。',
  'Minecraft 中你已经可以用铜（Copper）制作避雷针、望远镜和装饰方块。',
  'Minecraft 中营火（Campfire）可以烹饪食物，而且不会像熔炉那样消耗燃料。',
  'Minecraft 中幽匿块（Sculk）会在深暗之域生成，挖掉之前最好先准备好。',
  'GPCL 是云云一个人开发的启动器，并没有什么所谓的开发团队。',
];

// 显示随机小知识
function showRandomTip() {
  const tipText = document.getElementById('launch-tip-text');
  if (!tipText) return;
  
  const randomIndex = Math.floor(Math.random() * launchTips.length);
  tipText.textContent = launchTips[randomIndex];
}

// 模拟启动进度
function simulateLaunchProgress() {
  const progressFill = document.getElementById('launch-progress-fill');
  const statusText = document.getElementById('launch-status-text');
  
  let progress = 0;
  const statusMessages = [
    '正在检查游戏文件...',
    '正在准备Java运行时...',
    '正在初始化游戏环境...',
    '正在启动游戏窗口...'
  ];
  
  const interval = setInterval(() => {
    // 随机增加进度
    progress += Math.random() * 15 + 5;
    
    if (progress >= 90) {
      progress = 90;
    }
    
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    
    // 更新状态文字
    const messageIndex = Math.floor(progress / 25);
    if (statusText && messageIndex < statusMessages.length) {
      statusText.textContent = statusMessages[messageIndex];
    }
  }, 200);
  
  // 保存interval ID以便清除
  window.launchProgressInterval = interval;
}

// 游戏窗口创建监听器设置
let gameWindowResolve = null;
let gameWindowTimeout = null;

function setupGameWindowListener() {
  // 移除旧的监听器避免重复
  if (window.gpcl && window.gpcl.removeAllListeners) {
    window.gpcl.removeAllListeners();
  }
  
  // 重新注册关闭确认监听器
  if (window.gpcl && window.gpcl.onConfirmCloseWhileDownloading) {
    window.gpcl.onConfirmCloseWhileDownloading(async () => {
      const result = await showDialog({
        type: 'confirm',
        title: '确认关闭',
        message: '当前正在下载中，关闭会停止下载并清理已下载的文件。确定要关闭吗？如有不完整的"libraries"需自行清理。'
      });

      if (result) {
        if (window.gpcl && window.gpcl.confirmCloseDownload) {
          await window.gpcl.confirmCloseDownload();
        }
      } else {
        if (window.gpcl && window.gpcl.cancelClose) {
          await window.gpcl.cancelClose();
        }
      }
    });
  }
  
  // 注册游戏窗口创建监听器
  if (window.gpcl && window.gpcl.onGameWindowCreated) {
    window.gpcl.onGameWindowCreated((data) => {
      setStatus('[动画] 收到游戏窗口创建事件');
      if (gameWindowResolve) {
        clearTimeout(gameWindowTimeout);
        gameWindowResolve();
        gameWindowResolve = null;
        gameWindowTimeout = null;
      }
    });
    setStatus('[动画] 游戏窗口监听器已设置');
  }
}

// 等待游戏窗口创建成功
function waitForGameWindow() {
  return new Promise((resolve) => {
    gameWindowResolve = resolve;
    
    gameWindowTimeout = setTimeout(() => {
      setStatus('[动画] 窗口检测超时');
      gameWindowResolve = null;
      gameWindowTimeout = null;
      resolve();
    }, 10000); // 10秒超时
  });
}

// 显示成功动画
function showLaunchSuccess() {
  try {
    const overlay = document.getElementById('launch-animation-overlay');
    const pickaxe = document.getElementById('pickaxe');
    const block = document.getElementById('block');
    
    if (overlay) {
      overlay.classList.add('launch-success');
      setStatus('[动画] 显示成功动画');
    }
    
    if (block) {
      block.classList.add('breaking');
    }
    
    // 创建粒子效果
    createParticles();
  } catch (err) {
    setStatus('[动画] 显示成功动画失败: ' + err.message, 'error');
  }
}

// 创建粒子效果
function createParticles() {
  const particlesContainer = document.getElementById('particles');
  if (!particlesContainer) return;
  
  // 清除现有粒子
  particlesContainer.innerHTML = '';
  
  // 创建多个粒子
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // 随机方向
    const angle = (Math.PI * 2 * i) / 12;
    const distance = 50 + Math.random() * 50;
    particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    
    // 随机大小和延迟
    particle.style.width = `${4 + Math.random() * 8}px`;
    particle.style.height = particle.style.width;
    particle.style.animationDelay = `${Math.random() * 0.2}s`;
    
    particlesContainer.appendChild(particle);
  }
}

// 隐藏启动动画
function hideLaunchAnimation() {
  try {
    const overlay = document.getElementById('launch-animation-overlay');
    
    if (overlay) {
      overlay.classList.remove('show');
      overlay.classList.add('fade-out');
      
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('fade-out', 'launch-success');
        overlay.classList.add('hidden');
        setStatus('[动画] 启动动画层已隐藏');
      }, 400);
    }
    
    // 清除进度interval
    if (window.launchProgressInterval) {
      clearInterval(window.launchProgressInterval);
      window.launchProgressInterval = null;
    }
  } catch (err) {
    setStatus('[动画] 隐藏启动动画失败: ' + err.message, 'error');
  }
}

async function startDownload(versionId) {
  if (!versionId) { setStatus('请先选择要下载的版本', 'error'); return; }

  // 检查版本是否已安装
  const installed = await isVersionInstalled(versionId);
  
  // 检查是否选择了模组加载器
  let selectedModLoader = null;
  let selectedModLoaderVersion = null;
  let modLoaderName = '';
  
  for (const [loader, state] of Object.entries(modLoaderState)) {
    if (state.selected) {
      selectedModLoader = loader;
      selectedModLoaderVersion = state.selected;
      if (loader === 'forge') modLoaderName = 'Forge';
      break;
    }
  }

  if (detailDownloadBtn) detailDownloadBtn.disabled = true;
  await loadChartJs();
  initChart();
  resetChart();

  if (downloadPanel) downloadPanel.classList.remove('hidden');
  // 从详情页回到列表页，显示下载监控
  hideVersionDetail();
  showPage('download');

  // 滚动到下载页面顶部
  const scrollContainer = document.querySelector('.main-content');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  const downloadStatusEl = document.getElementById('download-status');
  const filenameEl = document.getElementById('download-filename');
  const cancelBtn = document.getElementById('cancel-download-btn');

  // 重置按钮状态
  if (cancelBtn) {
    cancelBtn.textContent = '取消下载';
    cancelBtn.classList.remove('complete');
    cancelBtn.disabled = false;
  }

  let displayName = `Minecraft ${versionId}`;
  if (selectedModLoader) {
    displayName = `${modLoaderName} ${versionId}`;
  }

  if (downloadStatusEl) downloadStatusEl.textContent = `开始下载 ${displayName} ...`;
  if (filenameEl) filenameEl.textContent = `正在下载: ${displayName}`;

  window.gpcl.removeAllListeners();
  
  // 重新注册关闭确认监听器（不会被removeAllListeners移除）
  window.gpcl.onConfirmCloseWhileDownloading(async () => {
    const result = await showDialog({
      type: 'confirm',
      title: '确认关闭',
      message: '当前正在下载中，关闭会停止下载并清理已下载的文件。确定要关闭吗？如有不完整的"libraries"需自行清理。'
    });

    if (result) {
      if (window.gpcl && window.gpcl.confirmCloseDownload) {
        await window.gpcl.confirmCloseDownload();
      }
    } else {
      if (window.gpcl && window.gpcl.cancelClose) {
        await window.gpcl.cancelClose();
      }
    }
  });

  let lastTime = Date.now();
  let lastBytes = 0;
  let lastLabel = '';

  window.gpcl.onDownloadProgress((data) => {
    const currentTime = Date.now();
    const timeDiff = (currentTime - lastTime) / 1000;

    const currentSpeedEl = document.getElementById('current-speed');
    const peakSpeedEl = document.getElementById('peak-speed');
    const progressFillEl = document.getElementById('progress-fill');
    const progressTextEl = document.getElementById('progress-text');

    if (data.label && data.label !== lastLabel) {
      lastLabel = data.label;
      lastBytes = 0;
      lastTime = currentTime;
    }

    if (timeDiff >= 0.5 && data.bytesDownloaded !== undefined) {
      const bytesDiff = data.bytesDownloaded - lastBytes;
      if (bytesDiff < 0) {
        lastBytes = data.bytesDownloaded;
        lastTime = currentTime;
        return;
      }
      const speedBps = Math.max(0, (bytesDiff * 8) / timeDiff / 1000000);

      if (currentSpeedEl) currentSpeedEl.textContent = speedBps.toFixed(2) + ' Mbps';

      if (speedBps > peakSpeed) {
        peakSpeed = speedBps;
        if (peakSpeedEl) peakSpeedEl.textContent = peakSpeed.toFixed(2) + ' Mbps';
      }

      updateChart(speedBps);

      lastTime = currentTime;
      lastBytes = data.bytesDownloaded;
    }

    const percent = data.percent || 0;
    if (progressFillEl) progressFillEl.style.width = percent + '%';
    if (progressTextEl) progressTextEl.textContent = percent.toFixed(1) + '%';

    if (data.label && filenameEl) {
      filenameEl.textContent = data.label;
    }

    if (downloadStatusEl) downloadStatusEl.textContent = `正在下载 ${versionId}: ${percent.toFixed(1)}%`;

    if (menuDownload) menuDownload.classList.add('active');
    if (data.percent >= 100 && menuDownload) {
      menuDownload.classList.remove('active');
    }
  });

  try {
    const maxConcurrent = getMaxConcurrentFromSettings();
    let result;
    
    if (selectedModLoader) {
      // 下载带模组加载器的版本
      result = await window.gpcl.downloadWithModLoader(
        versionId, 
        selectedModLoader, 
        selectedModLoaderVersion,
        maxConcurrent
      );
    } else {
      // 下载原版
      result = await window.gpcl.downloadVersion(versionId, maxConcurrent);
    }
    
    if (result.success) {
      // 记录版本下载时间
      await recordVersionDownload(result.finalVersionId || versionId);
      
      const finalDisplayName = selectedModLoader 
        ? `${modLoaderName} ${versionId}` 
        : `Minecraft ${versionId}`;
      
      setStatus('下载完成', 'success');
      if (downloadStatusEl) downloadStatusEl.textContent = `下载完成: ${finalDisplayName}`;
      const progressFillEl = document.getElementById('progress-fill');
      const progressTextEl = document.getElementById('progress-text');
      if (progressFillEl) progressFillEl.style.width = '100%';
      if (progressTextEl) progressTextEl.textContent = '100%';
      showToast('下载完成', `${finalDisplayName} 已准备就绪`, 'success', 'download-complete');
      await loadVersions();
      // 刷新版本选择列表
      renderVersionSelectList();
      // 修改按钮状态为下载完成（绿色）
      if (cancelBtn) {
        cancelBtn.textContent = '下载完成';
        cancelBtn.classList.add('complete');
        cancelBtn.disabled = true;
      }
    } else {
      setStatus(`下载失败: ${result.error}`, 'error');
      if (downloadStatusEl) downloadStatusEl.textContent = `下载失败: ${result.error}`;
    }
  } catch (err) {
    setStatus('下载出错', 'error');
    if (downloadStatusEl) downloadStatusEl.textContent = `下载出错: ${err.message || err}`;
    showToast('下载出错', err.message || String(err), 'error', 'download-error');
  }

  if (detailDownloadBtn) detailDownloadBtn.disabled = false;
}

// 详情页面事件
if (detailBackBtn) {
  detailBackBtn.addEventListener('click', hideVersionDetail);
}

if (detailDownloadBtn) {
  detailDownloadBtn.addEventListener('click', () => {
    if (selectedVersionId) {
      startDownload(selectedVersionId);
    }
  });
}

window.gpcl.onGameClosed((code) => {
  setStatus('游戏已退出');
  showToast('游戏已退出', `退出码: ${code}`, 'info', 'game-closed');
  launchBtn.disabled = false;
});

window.gpcl.onGameError((message) => {
  setStatus(`启动出错: ${message}`, 'error');
  showToast('游戏错误', message, 'error', 'game-error');
  launchBtn.disabled = false;
});

launchBtn.addEventListener('click', launchGame);

(async function init() {
  setStatus('正在加载...');
  initTheme();
  initScale();
  if (menuLaunch) menuLaunch.classList.add('active');

  if (usernameInput && window.gpcl && window.gpcl.getPlayerName) {
    const savedName = await window.gpcl.getPlayerName();
    if (savedName) usernameInput.value = savedName;
  }

  await loadVersions();
  await loadRemoteVersions();

  // 初始化版本选择列表并自动选中最近启动的版本
  await renderVersionSelectList();

  // 初始化Java版本状态
  await initJavaVersionStatus();
  bindJavaInstallButtons();
  
  // 绑定模组加载器事件
  bindModLoaderEvents();

  setInterval(async () => {
    // 刷新游戏版本（使用静默模式，不写日志）
    if (currentPage === 'launch') {
      await loadVersions(true);
      await renderVersionSelectList();
    }
    
    // 刷新Java版本状态（在所有页面都刷新）
    if (currentPage === 'download') {
      await refreshJavaStatus();
    }
  }, 2000);

  // 刷新Java版本状态的函数
  async function refreshJavaStatus() {
    const javaVersions = ["8", "17", "21", "25"];
    
    for (const ver of javaVersions) {
      try {
        const result = await window.gpcl.checkJava(ver);
        const card = document.querySelector(`.java-version-card[data-version="${ver}"]`);
        const badge = document.getElementById(`java-${ver}-status`);
        const btn = card?.querySelector('.java-install-btn');
        
        if (result.installed) {
          if (!card?.classList.contains('installed')) {
            if (card) card.classList.add('installed');
            if (badge) {
              badge.textContent = '已安装';
              badge.className = 'java-version-badge installed';
            }
            if (btn) {
              btn.textContent = '卸载';
              btn.classList.add('installed');
              btn.disabled = false;
            }
          }
        } else {
          if (card?.classList.contains('installed')) {
            card.classList.remove('installed');
            if (badge) {
              badge.textContent = '';
              badge.className = 'java-version-badge';
            }
            if (btn) {
              btn.textContent = '安装';
              btn.classList.remove('installed');
              btn.disabled = false;
            }
          }
        }
      } catch (e) {
        console.error(`检查Java ${ver} 状态失败`, e);
      }
    }
    
    updateJavaInstallStatus();
  }

  // bind refresh button
  const refreshBtn = document.getElementById('refresh-btn-page');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    setStatus('重试加载远程版本...');
    await loadRemoteVersions();
    // 同时刷新Java状态
    await refreshJavaStatus();
    setStatus('准备就绪');
  });

  // bind cancel download button
  if (cancelDownloadBtn) cancelDownloadBtn.addEventListener('click', async () => {
    const result = await showDialog({
      type: 'confirm',
      title: '确认取消',
      message: '确定要取消当前下载吗？已下载的文件将被清理。'
    });

    if (result) {
      if (window.gpcl && window.gpcl.cancelDownloadOnly) {
        await window.gpcl.cancelDownloadOnly();
        if (downloadPanel) downloadPanel.classList.add('hidden');
        if (detailDownloadBtn) detailDownloadBtn.disabled = false;
        showToast('已取消', '下载已取消，文件已清理', 'info');
      }
    }
  });

  setStatus('准备就绪');
  
  // 启动器加载完成后自动前置窗口
  if (window.gpcl && window.gpcl.focusWindow) {
    setTimeout(() => {
      window.gpcl.focusWindow();
    }, 100);
  }
  
  // 绑定启动取消按钮
  const launchCancelBtn = document.getElementById('launch-cancel-btn');
  if (launchCancelBtn) {
    launchCancelBtn.addEventListener('click', () => {
      setStatus('[动画] 用户取消启动');
      if (window.gpcl && window.gpcl.cancelLaunch) {
        window.gpcl.cancelLaunch();
      }
      hideLaunchAnimation();
    });
  }
  
  // 静默检查更新
  checkForUpdates(true);
  
  // 绑定检查更新按钮
  const checkUpdateBtn = document.getElementById('check-update-btn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', async () => {
      checkUpdateBtn.disabled = true;
      checkUpdateBtn.textContent = '检查中...';
      
      await checkForUpdates(false);
      
      const updateStatus = document.getElementById('update-status');
      const goDownloadBtn = document.getElementById('go-download-btn');
      
      if (updateAvailable) {
        const newest = allNewerVersions[allNewerVersions.length - 1];
        checkUpdateBtn.textContent = `发现 ${allNewerVersions.length} 个新版本`;
        checkUpdateBtn.classList.add('new-version');
        
        if (updateStatus) {
          updateStatus.innerHTML = `<div class="update-log-title">发现 ${allNewerVersions.length} 个新版本！</div>${renderUpdateVersionCards(allNewerVersions)}`;
          updateStatus.classList.add('show', 'has-update');
        }
        
        if (goDownloadBtn) {
          goDownloadBtn.classList.remove('hidden');
        }
      } else {
        checkUpdateBtn.textContent = '已是最新版本';
        checkUpdateBtn.classList.remove('new-version');
        
        if (updateStatus) {
          updateStatus.innerHTML = '当前已是最新版本';
          updateStatus.classList.add('show');
          updateStatus.classList.remove('has-update');
        }
        
        if (goDownloadBtn) {
          goDownloadBtn.classList.add('hidden');
        }
      }
      
      checkUpdateBtn.disabled = false;
    });
  }
  
  // 绑定立即前往下载按钮
  const goDownloadBtn = document.getElementById('go-download-btn');
  
  // 绑定自动检查更新开关
  const autoCheckUpdate = document.getElementById('auto-check-update');
  
  // 绑定防止多次启动开关
  const preventMultipleLaunch = document.getElementById('prevent-multiple-launch');
  
  // 绑定自动清除日志开关
  const autoClearLogs = document.getElementById('auto-clear-logs');
  const logRetentionContainer = document.getElementById('log-retention-container');
  const logRetentionValue = document.getElementById('log-retention-value');
  const logRetentionUnit = document.getElementById('log-retention-unit');
  
  // 初始化版本显示
  const aboutVersion = document.getElementById('about-version');
  
  const customMirrorContainer = document.getElementById('custom-java-mirror-container');
  const customMirrorUrl = document.getElementById('custom-java-mirror-url');
  
  // 游戏内存
  initCustomSelect('settings-memory', async (value) => {
    const settings = await loadSettings();
    settings.game.memory = value;
    await gpcl.saveSettings(settings);
  });
  
  // 窗口模式
  initCustomSelect('settings-window-mode', async (value) => {
    const settings = await loadSettings();
    if (!settings.game) settings.game = {};
    settings.game.windowMode = value;
    await gpcl.saveSettings(settings);
  });
  
  // 主题模式
  initCustomSelect('settings-theme', async (value) => {
    const settings = await loadSettings();
    if (!settings.appearance) settings.appearance = {};
    settings.appearance.theme = value;
    await gpcl.saveSettings(settings);
    applyTheme(value);
  });
  
  // 界面缩放
  initCustomSelect('settings-scale', async (value) => {
    const settings = await loadSettings();
    if (!settings.appearance) settings.appearance = {};
    settings.appearance.scale = value;
    await gpcl.saveSettings(settings);
    applyScale(value);
  });
  
  // Java镜像源
  initCustomSelect('java-mirror-select', async (value) => {
    if (customMirrorContainer) {
      customMirrorContainer.classList.toggle('hidden', value !== 'custom');
    }
    await saveJavaMirrorSettings(value, customMirrorUrl?.value || '');
  });
  
  // 日志保留时间单位
  initCustomSelect('log-retention-unit', async (unit) => {
    // 根据单位限制当前值
    const maxValues = {
      hour: 23,
      day: 30,
      month: 11,
      year: 10
    };
    
    if (logRetentionValue) {
      let value = parseInt(logRetentionValue.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > maxValues[unit]) {
        value = maxValues[unit];
        logRetentionValue.value = value;
      }
    }
    
    const settings = await loadSettings();
    settings.advanced.logRetentionUnit = unit;
    if (logRetentionValue) {
      settings.advanced.logRetentionValue = parseInt(logRetentionValue.value, 10);
    }
    await gpcl.saveSettings(settings);
  });
  
  // 绑定立即前往下载按钮
  if (goDownloadBtn) {
    goDownloadBtn.addEventListener('click', () => {
      if (window.gpcl && window.gpcl.openExternal) {
        window.gpcl.openExternal('https://gamets.caellab.com/gpcl/#download');
      }
    });
  }
  
  // 绑定自动检查更新开关
  if (autoCheckUpdate) {
    // 从设置中加载状态
    (async () => {
      const settings = await loadSettings();
      autoCheckUpdate.checked = settings.advanced?.autoCheckUpdate !== false;
    })();
    
    autoCheckUpdate.addEventListener('change', async () => {
      const settings = await loadSettings();
      settings.advanced.autoCheckUpdate = autoCheckUpdate.checked;
      await gpcl.saveSettings(settings);
      updateSettingsBadge();
    });
  }

  // 绑定防止多次启动开关
  if (preventMultipleLaunch) {
    (async () => {
      const settings = await loadSettings();
      preventMultipleLaunch.checked = settings.advanced?.preventMultipleLaunch !== false;
    })();

    preventMultipleLaunch.addEventListener('change', async () => {
      const settings = await loadSettings();
      settings.advanced.preventMultipleLaunch = preventMultipleLaunch.checked;
      await gpcl.saveSettings(settings);
    });
  }

  const playStartupAnimation = document.getElementById('play-startup-animation');
  if (playStartupAnimation) {
    (async () => {
      const settings = await loadSettings();
      playStartupAnimation.checked = settings.advanced?.playStartupAnimation === true;
    })();

    playStartupAnimation.addEventListener('change', async () => {
      const settings = await loadSettings();
      settings.advanced.playStartupAnimation = playStartupAnimation.checked;
      await gpcl.saveSettings(settings);
    });
  }

  const developerMode = document.getElementById('developer-mode');
  if (developerMode) {
    (async () => {
      const settings = await loadSettings();
      developerMode.checked = settings.advanced?.developerMode === true;
    })();

    developerMode.addEventListener('change', async () => {
      const settings = await loadSettings();
      settings.advanced.developerMode = developerMode.checked;
      await gpcl.saveSettings(settings);
      if (window.gpcl && window.gpcl.setDeveloperMode) {
        await window.gpcl.setDeveloperMode(developerMode.checked);
      }
    });
  }

  // 绑定自动清除日志开关
  if (autoClearLogs) {
    (async () => {
      const settings = await loadSettings();
      autoClearLogs.checked = settings.advanced?.autoClearLogs !== false;
    })();

    autoClearLogs.addEventListener('change', async () => {
      const settings = await loadSettings();
      settings.advanced.autoClearLogs = autoClearLogs.checked;
      await gpcl.saveSettings(settings);
      
      if (logRetentionContainer) {
        logRetentionContainer.classList.toggle('hidden', !autoClearLogs.checked);
      }
    });
  }

  // 绑定保留日志时间输入
  if (logRetentionValue) {
    (async () => {
      const settings = await loadSettings();
      logRetentionValue.value = settings.advanced?.logRetentionValue || 7;
    })();

    logRetentionValue.addEventListener('change', async () => {
      let value = parseInt(logRetentionValue.value, 10);
      const unit = getCustomSelectValue('log-retention-unit') || 'day';
      
      // 根据单位限制最大值
      const maxValues = {
        hour: 23,
        day: 30,
        month: 11,
        year: 10
      };
      
      if (isNaN(value) || value < 1) {
        value = 1;
      } else if (value > maxValues[unit]) {
        value = maxValues[unit];
      }
      
      logRetentionValue.value = value;
      
      const settings = await loadSettings();
      settings.advanced.logRetentionValue = value;
      await gpcl.saveSettings(settings);
    });
  }

  // 初始化版本显示
  if (aboutVersion) {
    const version = await getCurrentVersion();
    aboutVersion.textContent = `版本: ${version}`;
  }
  

  
  // 绑定Java镜像URL输入
  if (customMirrorUrl) {
    customMirrorUrl.addEventListener('input', async () => {
      await saveJavaMirrorSettings(getCustomSelectValue('java-mirror-select') || 'tsinghua', customMirrorUrl.value);
    });
  }
  
  // 加载所有设置到界面
  (async () => {
    const settings = await loadSettings();
    
    // 游戏内存
    let memoryValue = '2'; // 默认2GB
    if (settings.game?.memory) {
      const storedMemory = String(settings.game.memory);
      if (storedMemory.includes('096')) {
        // 旧格式，转换为GB
        const mb = parseInt(storedMemory);
        if (!isNaN(mb)) {
          memoryValue = String(mb / 1024);
        }
      } else {
        memoryValue = storedMemory;
      }
    }
    setCustomSelectValue('settings-memory', memoryValue);
    
    // 窗口模式
    setCustomSelectValue('settings-window-mode', settings.game?.windowMode || 'windowed');
    
    // 主题
    const theme = settings.appearance?.theme || 'dark';
    setCustomSelectValue('settings-theme', theme);
    applyTheme(theme);
    
    // 缩放
    const scale = settings.appearance?.scale || '100';
    setCustomSelectValue('settings-scale', scale);
    applyScale(scale);
    
    // Java镜像
    const javaMirror = settings.download?.javaMirror || 'tsinghua';
    setCustomSelectValue('java-mirror-select', javaMirror);
    if (customMirrorContainer) {
      customMirrorContainer.classList.toggle('hidden', javaMirror !== 'custom');
    }
    if (customMirrorUrl && settings.download?.customJavaMirror) {
      customMirrorUrl.value = settings.download.customJavaMirror;
    }
    
    // 日志保留时间单位
    setCustomSelectValue('log-retention-unit', settings.advanced?.logRetentionUnit || 'day');
  })();
  
  // 绑定兼容性设置
  (async () => {
    const resetDefaultToggle = document.getElementById('settings-reset-default');
    
    if (resetDefaultToggle) {
      resetDefaultToggle.checked = false; // 默认关闭
      
      resetDefaultToggle.addEventListener('change', async function() {
        if (this.checked) {
          // 显示确认对话框
          const confirmed = await showDialog({
            type: 'confirm',
            title: '恢复默认设置',
            message: '确定要将所有设置恢复为默认值吗？\n\n此操作会重启启动器。'
          });
          
          if (confirmed) {
            // 恢复默认设置
            if (window.gpcl && window.gpcl.resetSettings) {
              const result = await window.gpcl.resetSettings();
              if (result.success) {
                // 重启应用
                if (window.gpcl && window.gpcl.restartApp) {
                  await window.gpcl.restartApp();
                }
              }
            }
          } else {
            // 用户取消，重置开关状态
            this.checked = false;
          }
        }
      });
    }
  })();
  
  // 绑定设置侧边栏点击事件
  const settingsSidebarItems = document.querySelectorAll('.settings-sidebar-item');
  settingsSidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.dataset.tab;
      if (tabName) {
        switchSettingsTab(tabName);
      }
    });
  });
  
  // 绑定版本设置按钮 - 先声明所有需要的变量
  let currentVersionForSettings = null;
  
  const versionSettingsBtn = document.getElementById('version-settings');
  const versionSettingsPanel = document.getElementById('version-settings-panel');
  const versionSettingsBackBtn = document.getElementById('version-settings-back-btn');
  const versionSettingsTitle = document.getElementById('version-settings-title');
  const versionDeleteEnable = document.getElementById('version-delete-enable');
  const versionServerIpContainer = document.getElementById('version-server-ip-container');
  const versionServerIpInput = document.getElementById('version-server-ip');
  const versionSelectPanel = document.getElementById('version-select-panel');
  const statusElement = document.getElementById('status');
  
  async function getVersionSettings(versionId) {
    try {
      if (window.gpcl && window.gpcl.getVersionSettings) {
        const result = await window.gpcl.getVersionSettings(versionId);
        if (result.success && result.settings) {
          return result.settings;
        }
      }
    } catch (e) {
      console.error('获取版本设置失败:', e);
    }
    return {};
  }
  
  async function saveVersionSettings(versionId, settings) {
    try {
      if (window.gpcl && window.gpcl.saveVersionSettings) {
        const result = await window.gpcl.saveVersionSettings(versionId, settings);
        return result.success;
      }
    } catch (e) {
      console.error('保存版本设置失败:', e);
    }
    return false;
  }
  
  // 更新服务器IP输入框的显示状态
  function updateServerIpVisibility() {
    const startupMode = getCustomSelectValue('version-startup-mode');
    if (startupMode === 'join') {
      versionServerIpContainer.classList.add('visible');
    } else {
      versionServerIpContainer.classList.remove('visible');
    }
  }
  
  async function loadVersionSettingsToUI(versionId) {
    const settings = await getVersionSettings(versionId);
    
    versionDeleteEnable.checked = false;
    setCustomSelectValue('version-memory', settings.memory || 'global');
    setCustomSelectValue('version-window-mode', settings.windowMode || 'global');
    setCustomSelectValue('version-startup-mode', settings.startupMode || 'default');
    versionServerIpInput.value = settings.serverIp || '';
    
    updateServerIpVisibility();
  }
  
  let saveTimeout = null;
  function saveCurrentVersionSettings() {
    if (!currentVersionForSettings) return;
    
    const settings = {
      memory: getCustomSelectValue('version-memory') || 'global',
      windowMode: getCustomSelectValue('version-window-mode') || 'global',
      startupMode: getCustomSelectValue('version-startup-mode') || 'default',
      serverIp: versionServerIpInput.value || ''
    };
    
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const success = await saveVersionSettings(currentVersionForSettings, settings);
      if (success) {
        showToast('保存成功', `版本 ${currentVersionForSettings} 的设置已保存`, 'success');
      } else {
        showToast('保存失败', '无法保存版本设置', 'error');
      }
    }, 300);
  }
  
  async function showVersionSettingsPanel(versionId) {
    if (!versionSettingsPanel) return;
    
    currentVersionForSettings = versionId;
    versionSettingsTitle.textContent = `版本设置 - ${versionId}`;
    
    versionSelectPanel.classList.add('hidden');
    if (statusElement) statusElement.style.display = 'none';
    
    versionSettingsPanel.classList.remove('hidden');
    versionSettingsPanel.classList.remove('slide-out');
    
    await loadVersionSettingsToUI(versionId);
  }
  
  async function hideVersionSettingsPanel() {
    if (!versionSettingsPanel) return;
    
    // 立即保存当前设置（取消延迟保存）
    if (saveTimeout) clearTimeout(saveTimeout);
    if (currentVersionForSettings) {
      const settings = {
        memory: getCustomSelectValue('version-memory') || 'global',
        windowMode: getCustomSelectValue('version-window-mode') || 'global',
        startupMode: getCustomSelectValue('version-startup-mode') || 'default',
        serverIp: versionServerIpInput.value || ''
      };
      await saveVersionSettings(currentVersionForSettings, settings);
    }
    
    versionSettingsPanel.classList.add('slide-out');
    
    setTimeout(() => {
      versionSettingsPanel.classList.add('hidden');
      versionSettingsPanel.classList.remove('slide-out');
      if (statusElement) statusElement.style.display = '';
      currentVersionForSettings = null;
    }, 300);
  }
  
  if (versionSettingsBtn) {
    versionSettingsBtn.addEventListener('click', async () => {
      if (selectedVersionId) {
        // 如果版本选择面板是打开的，先关闭它
        if (!versionSelectPanel.classList.contains('hidden')) {
          versionSelectPanel.classList.add('hidden');
        }
        await showVersionSettingsPanel(selectedVersionId);
      } else {
        showToast('未选择版本', '请先选择一个版本', 'warning');
      }
    });
  }
  
  if (versionSettingsBackBtn) {
    versionSettingsBackBtn.addEventListener('click', async () => {
      await hideVersionSettingsPanel();
    });
  }
  
  if (versionDeleteEnable) {
    versionDeleteEnable.addEventListener('change', async function() {
      if (this.checked) {
        const confirmed = await showDialog({
          type: 'confirm',
          title: '确认删除',
          message: `确定要删除版本 "${currentVersionForSettings}" 吗？此操作不可恢复！`
        });
        
        if (confirmed) {
          if (window.gpcl && window.gpcl.deleteVersion) {
            try {
              const result = await window.gpcl.deleteVersion(currentVersionForSettings);
              if (result.success) {
                showToast('删除成功', `版本 ${currentVersionForSettings} 已删除`, 'success');
                
                await hideVersionSettingsPanel();
                loadVersions(true);
                renderVersionSelectList();
              } else {
                showToast('删除失败', result.error || '无法删除版本', 'error');
                this.checked = false;
              }
            } catch (e) {
              showToast('删除失败', e.message, 'error');
              this.checked = false;
            }
          }
        } else {
          this.checked = false;
        }
      }
    });
  }
  
  // 初始化版本设置下拉框
  initCustomSelect('version-memory', () => {
    saveCurrentVersionSettings();
  });
  
  initCustomSelect('version-window-mode', () => {
    saveCurrentVersionSettings();
  });
  
  initCustomSelect('version-startup-mode', () => {
    updateServerIpVisibility();
    saveCurrentVersionSettings();
  });
  
  // 版本服务器IP输入框
  if (versionServerIpInput) {
    versionServerIpInput.addEventListener('input', () => {
      saveCurrentVersionSettings();
    });
  }
  
  // 绑定版本选择按钮
  const versionSelectBtn = document.getElementById('version-select');
  const versionPanel = document.getElementById('version-select-panel');
  if (versionSelectBtn && versionPanel) {
    versionSelectBtn.addEventListener('click', () => {
      // 如果版本设置面板是打开的，就不动
      if (!versionSettingsPanel.classList.contains('hidden')) {
        return;
      }
      
      // 切换版本面板显示状态
      if (versionPanel.classList.contains('hidden')) {
        versionPanel.classList.remove('hidden');
        renderVersionSelectList();
      } else {
        versionPanel.classList.add('hidden');
      }
    });
  }
  
  // 绑定正版登录按钮（显示提示）
  const authMicrosoftBtn = document.getElementById('auth-microsoft');
  if (authMicrosoftBtn) {
    authMicrosoftBtn.addEventListener('click', () => {
      showToast('正版登录', '正版登录功能尚未对接微软账号系统', 'info');
    });
  }
})();

// 版本更新检查
let latestVersion = null;
let latestVersionLog = null;
let updateAvailable = false;
let allNewerVersions = [];

async function getCurrentVersion() {
  try {
    if (window.gpcl && window.gpcl.getAppVersion) {
      return await window.gpcl.getAppVersion();
    }
  } catch (e) {}
  return '1.0.0';
}

function compareVersions(current, latest) {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);
  
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return 1;
    if (c > l) return -1;
  }
  return 0;
}

function parseLauncherVersions(launcherData) {
  const versions = [];
  let current = null;

  for (const item of launcherData) {
    if (item.name === 'version' && item.key) {
      if (current) versions.push(current);
      current = { version: item.key, title: '', log: '' };
    } else if (current) {
      if (item.name === 'versionlog' && item.key) {
        current.log = item.key;
      } else if (item.name === 'versiontitle' && item.key) {
        current.title = item.key;
      } else if (!item.key && item.name && item.name !== 'versionlog' && item.name !== 'versiontitle') {
        current.title = item.name;
      }
    }
  }
  if (current) versions.push(current);
  return versions;
}

function renderUpdateVersionCards(newerVersions) {
  if (!newerVersions || newerVersions.length === 0) return '';

  const cards = newerVersions.map((v, index) => {
    const isNewest = index === newerVersions.length - 1;
    const titleHtml = v.title ? `<div class="update-card-title">${v.title}</div>` : '';
    const logHtml = v.log ? `<div class="update-card-log">${v.log}</div>` : '';
    return `<div class="update-version-card ${isNewest ? 'newest' : ''}">` +
      `<div class="update-card-header"><span class="update-card-version">${v.version}</span>` +
      `${isNewest ? '<span class="update-card-badge">最新</span>' : ''}</div>` +
      `${titleHtml}${logHtml}</div>`;
  }).reverse().join('');

  return `<div class="update-versions-list">${cards}</div>`;
}

async function checkForUpdates(silent = false) {
  setStatus('[版本检查] 开始检查更新...');
  
  try {
    const result = await window.gpcl.checkForUpdates();
    
    if (!result.success) {
      throw new Error(result.error || '检查更新失败');
    }
    
    const data = result.data;
    const launcherData = data.Launcher || [];
    
    const parsedVersions = parseLauncherVersions(launcherData);
    
    if (parsedVersions.length === 0) throw new Error('无法获取版本信息');
    
    latestVersion = parsedVersions[0].version;
    latestVersionLog = parsedVersions[0].log;
    
    const currentVersion = await getCurrentVersion();
    setStatus(`[版本检查] 当前版本: ${currentVersion}, 最新版本: ${latestVersion}`);
    
    allNewerVersions = parsedVersions
      .filter(v => compareVersions(currentVersion, v.version) > 0)
      .sort((a, b) => compareVersions(b.version, a.version));
    
    updateAvailable = allNewerVersions.length > 0;
    
    setStatus(`[版本检查] 有更新: ${updateAvailable}, 新版本数: ${allNewerVersions.length}`);
    
    if (!silent) {
      if (updateAvailable) {
        setStatus(`发现 ${allNewerVersions.length} 个新版本`, 'warning');
      } else {
        setStatus('当前已是最新版本', 'success');
      }
    }
    
    if (updateAvailable && silent) {
      const newest = allNewerVersions[allNewerVersions.length - 1];
      const titlePart = newest.title ? ` "${newest.title}"` : '';
      showToast('发现新版本', `GPCL ${newest.version}${titlePart} 已发布`, 'warning', 'update-available');
    }
    
    await updateSettingsBadge();
    
  } catch (e) {
    setStatus(`[版本检查] 错误: ${e.message}`, 'error');
    console.error('[版本检查] 详细错误:', e);
    if (!silent) {
      setStatus('检查更新失败: ' + e.message, 'error');
    }
    updateAvailable = false;
    allNewerVersions = [];
    await updateSettingsBadge();
  }
}

async function updateSettingsBadge() {
  const settingsMenu = document.getElementById('menu-settings');
  const checkUpdateBtn = document.getElementById('check-update-btn');
  if (!settingsMenu) return;
  
  // 移除旧的红点
  const oldBadge = settingsMenu.querySelector('.update-badge');
  if (oldBadge) oldBadge.remove();
  
  // 获取设置
  const settings = await loadSettings();
  
  // 只有在有新版本且自动检查更新开启时才显示红点
  if (updateAvailable && settings.advanced?.autoCheckUpdate !== false) {
    const badge = document.createElement('span');
    badge.className = 'update-badge';
    badge.textContent = '';
    badge.style.cssText = 'position:absolute;top:2px;right:2px;width:8px;height:8px;background:#f44336;border-radius:50%;';
    settingsMenu.style.position = 'relative';
    settingsMenu.appendChild(badge);
    
    // 检查更新按钮也标红
    if (checkUpdateBtn) {
      checkUpdateBtn.classList.add('new-version');
      checkUpdateBtn.textContent = `发现 ${allNewerVersions.length} 个新版本`;
    }
  } else {
    // 移除检查更新按钮的红标（如果当前没有更新）
    if (checkUpdateBtn && !updateAvailable) {
      checkUpdateBtn.classList.remove('new-version');
      checkUpdateBtn.textContent = '检查更新';
    }
  }
}

async function loadSettings() {
  try {
    return await gpcl.getSettings();
  } catch (e) {
    console.error('加载设置失败:', e);
    return {
      game: {
        memory: '2',
        playerName: 'GPCL_Player',
        javaPath: '',
        jvmArgs: '',
        windowMode: 'windowed'
      },
      appearance: {
        theme: 'light',
        scale: '100'
      },
      download: {
        maxConcurrent: 64,
        javaMirror: 'tsinghua',
        customJavaMirror: ''
      },
      advanced: {
        autoCheckUpdate: true,
        preventMultipleLaunch: true,
        autoClearLogs: true,
        logRetentionValue: 7,
        logRetentionUnit: 'day',
        playStartupAnimation: true,
        developerMode: false
      }
    };
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}

async function saveThemeSetting(theme) {
  const settings = await loadSettings();
  settings.appearance.theme = theme;
  await gpcl.saveSettings(settings);
}

async function initTheme() {
  const settings = await loadSettings();
  const theme = settings.appearance?.theme || 'dark';
  applyTheme(theme);
  
  const themeSelect = document.getElementById('settings-theme');
  if (themeSelect) {
    themeSelect.value = theme;
    themeSelect.addEventListener('change', async () => {
      const newTheme = themeSelect.value;
      applyTheme(newTheme);
      await saveThemeSetting(newTheme);
    });
  }
}

function applyScale(scale) {
  const factor = parseInt(scale, 10) / 100;
  document.body.style.zoom = factor;
}

async function saveScaleSetting(scale) {
  const settings = await loadSettings();
  settings.appearance.scale = scale;
  await gpcl.saveSettings(settings);
}

async function initScale() {
  const settings = await loadSettings();
  const scale = settings.appearance?.scale || '100';
  applyScale(scale);
  
  const scaleSelect = document.getElementById('settings-scale');
  if (scaleSelect) {
    scaleSelect.value = scale;
    scaleSelect.addEventListener('change', async () => {
      const newScale = scaleSelect.value;
      applyScale(newScale);
      await saveScaleSetting(newScale);
    });
  }
}

async function saveJavaMirrorSettings(mirror, customUrl) {
  const settings = await loadSettings();
  settings.download.javaMirror = mirror;
  settings.download.customJavaMirror = customUrl;
  await gpcl.saveSettings(settings);
}

/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS
 * Licensed under the CaelLab BY-SA Code License, Version 2.0
 * or any later version. https://www.caellab.com/license/bysa-code-v2.txt
 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher
 */

declare const Chart: any;

declare global {
  interface Window {
    gpcl: any;
    Chart?: any;
    launchProgressInterval?: ReturnType<typeof setInterval> | null;
  }
}

let GAME_DIR: string | null = null;
let msAuthData: { uuid: string; username: string; accessToken: string } | null = null;

async function initGameDir(): Promise<string | null> {
  if (!GAME_DIR) {
    GAME_DIR = await window.gpcl.getGameDir();
  }
  return GAME_DIR;
}


const usernameInput: HTMLInputElement | null = document.getElementById('username') as HTMLInputElement | null;
const versionSelect: HTMLSelectElement | null = document.getElementById('version') as HTMLSelectElement | null;
const launchBtn: HTMLElement | null = document.getElementById('launch-btn');
const statusDiv: HTMLElement | null = document.getElementById('status');

const cancelDownloadBtn: HTMLElement | null = document.getElementById('cancel-download-btn');
const downloadBtn: HTMLElement | null = document.getElementById('download-btn-page');
const versionListContainer: HTMLElement | null = document.getElementById('version-list-container');
const versionListSection: HTMLElement | null = document.getElementById('version-list-section');
const versionDetailPage: HTMLElement | null = document.getElementById('version-detail-page');
const detailBackBtn: HTMLElement | null = document.getElementById('detail-back-btn');
const detailDownloadBtn: HTMLButtonElement | null = document.getElementById('detail-download-btn') as HTMLButtonElement | null;
const versionCountLabel: HTMLElement | null = document.getElementById('version-count-label');

const menuDownload: HTMLElement | null = document.getElementById('menu-download');
const menuLaunch: HTMLElement | null = document.getElementById('menu-launch');
const menuSettings: HTMLElement | null = document.getElementById('menu-settings');
const menuMore: HTMLElement | null = document.getElementById('menu-more');
const downloadPage: HTMLElement | null = document.getElementById('download-page');
const launchPanel: HTMLElement | null = document.getElementById('launch-panel');
const settingsPage: HTMLElement | null = document.getElementById('settings-page');
const morePage: HTMLElement | null = document.getElementById('more-page');
const mainContent: Element | null = document.querySelector('.main-content .container');

const minimizeBtn: HTMLElement | null = document.getElementById('minimize-btn');
const closeBtn: HTMLElement | null = document.getElementById('close-btn');

const toastContainer: HTMLElement | null = document.getElementById('toast-container');
const toastHistory: Map<string, number> = new Map();
const TOAST_DEDUP_MS: number = 3000;

const dialogOverlay: HTMLElement | null = document.getElementById('dialog-overlay');
const dialogIcon: HTMLElement | null = document.getElementById('dialog-icon');
const dialogTitle: HTMLElement | null = document.getElementById('dialog-title');
const dialogMessage: HTMLElement | null = document.getElementById('dialog-message');
const dialogFooterSingle: HTMLElement | null = document.getElementById('dialog-footer-single');
const dialogFooterConfirm: HTMLElement | null = document.getElementById('dialog-footer-confirm');
const dialogBtnOk: HTMLElement | null = document.getElementById('dialog-btn-ok');
const dialogBtnYes: HTMLElement | null = document.getElementById('dialog-btn-yes');
const dialogBtnCancel: HTMLElement | null = document.getElementById('dialog-btn-cancel');

let dialogResolve: ((value: boolean) => void) | null = null;

function showDialog(options: { type?: string; title?: string; message?: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    dialogResolve = resolve;

    const icons: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      question: '❓'
    };

    if (dialogIcon) dialogIcon.textContent = icons[options.type || ''] || icons.info;
    if (dialogTitle) dialogTitle.textContent = options.title || '提示';
    if (dialogMessage) dialogMessage.textContent = options.message || '';

    if (options.type === 'confirm' || options.type) {
      if (dialogFooterSingle) dialogFooterSingle.classList.add('hidden');
      if (dialogFooterConfirm) dialogFooterConfirm.classList.remove('hidden');
      if (dialogBtnYes && options.confirmText) dialogBtnYes.textContent = options.confirmText;
      else if (dialogBtnYes) dialogBtnYes.textContent = '是';
      if (dialogBtnCancel && options.cancelText) dialogBtnCancel.textContent = options.cancelText;
      else if (dialogBtnCancel) dialogBtnCancel.textContent = '否';
    } else {
      if (dialogFooterSingle) dialogFooterSingle.classList.remove('hidden');
      if (dialogFooterConfirm) dialogFooterConfirm.classList.add('hidden');
    }

    if (dialogOverlay) dialogOverlay.classList.remove('hidden');
  });
}

function hideDialog(): void {
  if (dialogOverlay) dialogOverlay.classList.add('hidden');
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

if (window.gpcl && window.gpcl.onConfirmCloseWhileDownloading) {
  window.gpcl.onConfirmCloseWhileDownloading(async (): Promise<void> => {
    const result: boolean = await showDialog({
      type: 'confirm',
      title: '确认关闭',
      message: '当前正在下载中，关闭会停止下载并清理已下载的文件。确定要关闭吗？'
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

function showToast(title: string, message?: string, type: string = 'info', key?: string | null): void {
  if (!toastContainer) return;
  if (key) {
    const last: number | undefined = toastHistory.get(key);
    if (last && Date.now() - last < TOAST_DEDUP_MS) return;
    toastHistory.set(key, Date.now());
  }
  const icons: Record<string, string> = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast: HTMLDivElement = document.createElement('div');
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

let chartLoaded: boolean = false;

function loadChartJs(): Promise<void> {
  return new Promise((resolve) => {
    if (chartLoaded || window.Chart) {
      resolve();
      return;
    }
    const script: HTMLScriptElement = document.createElement('script');
    script.src = 'js/chart.umd.js';
    script.onload = () => {
      chartLoaded = true;
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

let speedChart: any = null;
let speedData: number[] = [];
let peakSpeed: number = 0;
const downloadPanel: HTMLElement | null = document.getElementById('download-panel');

let currentPage: string = 'launch';
let isUpdateDownloadActive: boolean = false;

function getMaxConcurrentFromSettings(): number {
  return DEFAULT_MAX_THREADS;
}

function showPage(name: string): void {
  currentPage = name;

  if (name === 'download') {
    if (downloadPage) downloadPage.classList.remove('hidden');
    if (launchPanel) launchPanel.classList.add('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
    if (morePage) morePage.classList.add('hidden');
  } else if (name === 'launch') {
    if (downloadPage) downloadPage.classList.add('hidden');
    if (launchPanel) launchPanel.classList.remove('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
    if (morePage) morePage.classList.add('hidden');
  } else if (name === 'settings') {
    if (downloadPage) downloadPage.classList.add('hidden');
    if (launchPanel) launchPanel.classList.add('hidden');
    if (settingsPage) settingsPage.classList.remove('hidden');
    if (morePage) morePage.classList.add('hidden');
    switchSettingsTab('game');
  } else if (name === 'more') {
    if (downloadPage) downloadPage.classList.add('hidden');
    if (launchPanel) launchPanel.classList.add('hidden');
    if (settingsPage) settingsPage.classList.add('hidden');
    if (morePage) morePage.classList.remove('hidden');
    switchMoreTab('toolbox');
  }

  if (menuDownload) menuDownload.classList.toggle('active', name === 'download');
  if (menuLaunch) menuLaunch.classList.toggle('active', name === 'launch');
  if (menuSettings) menuSettings.classList.toggle('active', name === 'settings');
  if (menuMore) menuMore.classList.toggle('active', name === 'more');
}

function switchSettingsTab(tabName: string): void {
  const sidebarItems: NodeListOf<Element> = document.querySelectorAll('#settings-sidebar .settings-sidebar-item');
  const contentPanels: NodeListOf<Element> = document.querySelectorAll('#settings-page .settings-content-panel');

  sidebarItems.forEach((item: Element) => {
    item.classList.toggle('active', (item as HTMLElement).dataset.tab === tabName);
  });

  contentPanels.forEach((panel: Element) => {
    panel.classList.toggle('active', panel.id === `settings-content-${tabName}`);
    panel.classList.toggle('hidden', panel.id !== `settings-content-${tabName}`);
  });
}

function switchMoreTab(tabName: string): void {
  const sidebarItems: NodeListOf<Element> = document.querySelectorAll('#more-sidebar .settings-sidebar-item');
  const contentPanels: NodeListOf<Element> = document.querySelectorAll('#more-page .settings-content-panel');

  sidebarItems.forEach((item: Element) => {
    item.classList.toggle('active', (item as HTMLElement).dataset.tab === tabName);
  });

  contentPanels.forEach((panel: Element) => {
    panel.classList.toggle('active', panel.id === `more-content-${tabName}`);
    panel.classList.toggle('hidden', panel.id !== `more-content-${tabName}`);
  });
}

function updateMenuActive(pageName: string): void {
  if (menuDownload) menuDownload.classList.toggle('active', pageName === 'download');
  if (menuLaunch) menuLaunch.classList.toggle('active', pageName === 'launch');
  if (menuSettings) menuSettings.classList.toggle('active', pageName === 'settings');
  if (menuMore) menuMore.classList.toggle('active', pageName === 'more');
}

if (menuDownload) menuDownload.addEventListener('click', () => showPage('download'));
if (menuLaunch) menuLaunch.addEventListener('click', () => showPage('launch'));
if (menuSettings) menuSettings.addEventListener('click', () => showPage('settings'));
if (menuMore) menuMore.addEventListener('click', () => showPage('more'));

document.querySelectorAll('#more-sidebar .settings-sidebar-item').forEach((item: Element) => {
  item.addEventListener('click', () => {
    const tabName: string | undefined = (item as HTMLElement).dataset.tab;
    switchMoreTab(tabName!);
  });
});

function switchMoreTab(tabName: string): void {
  const sidebarItems: NodeListOf<Element> = document.querySelectorAll('#more-sidebar .settings-sidebar-item');
  const contentPanels: NodeListOf<Element> = document.querySelectorAll('#more-page .settings-content-panel');
  const morePageEl: HTMLElement | null = document.getElementById('more-page');
  const forumIframe: HTMLIFrameElement | null = document.getElementById('forum-iframe') as HTMLIFrameElement | null;

  sidebarItems.forEach((item: Element) => {
    item.classList.toggle('active', (item as HTMLElement).dataset.tab === tabName);
  });

  contentPanels.forEach((panel: Element) => {
    const isForum: boolean = panel.id === `more-content-${tabName}` && tabName === 'forum';
    panel.classList.toggle('active', panel.id === `more-content-${tabName}`);
    panel.classList.toggle('hidden', panel.id !== `more-content-${tabName}`);
    
    if (isForum) {
      if (forumIframe && !forumIframe.src) {
        forumIframe.src = 'https://forum.xmuer.online/?sort=newest';
      }
      if (morePageEl) morePageEl.classList.add('forum-mode');
      updateForumIframeSize();
    } else {
      if (morePageEl) morePageEl.classList.remove('forum-mode');
    }
  });
}

function updateForumIframeSize(): void {
  const forumIframe: HTMLIFrameElement | null = document.getElementById('forum-iframe') as HTMLIFrameElement | null;
  const morePageEl: HTMLElement | null = document.getElementById('more-page');
  
  if (forumIframe && morePageEl && morePageEl.classList.contains('forum-mode')) {
    forumIframe.style.width = '100%';
    forumIframe.style.height = '100%';
  }
}

window.addEventListener('resize', updateForumIframeSize);

const memoryOptimizeBtn: HTMLElement | null = document.getElementById('memory-optimize-btn');
if (memoryOptimizeBtn) {
  memoryOptimizeBtn.addEventListener('click', async (): Promise<void> => {
    const btnIcon: HTMLElement | null = memoryOptimizeBtn.querySelector('.btn-icon');
    const btnText: HTMLElement | null = memoryOptimizeBtn.querySelector('.btn-text');
    
    const originalIcon: string | null = btnIcon?.textContent || null;
    const originalText: string | null = btnText?.textContent || null;
    
    (memoryOptimizeBtn as HTMLButtonElement).disabled = true;
    if (btnIcon) btnIcon.textContent = '⏳';
    if (btnText) btnText.textContent = '优化中...';
    
    const beforeMemory: number = await window.gpcl.getMemoryUsage();
    
    await window.gpcl.optimizeMemory();
    
    const afterMemory: number = await window.gpcl.getMemoryUsage();
    
    const savedMemory: string = (beforeMemory - afterMemory).toFixed(2);
    const afterMemoryFormatted: string = afterMemory.toFixed(2);
    
    (memoryOptimizeBtn as HTMLButtonElement).disabled = false;
    if (btnIcon) btnIcon.textContent = originalIcon;
    if (btnText) btnText.textContent = originalText;
    
    showToast(`内存优化完成！\n当前内存占用: ${afterMemoryFormatted}GB\n比优化前减少了: ${savedMemory}GB`, 'success');
  });
}
if (minimizeBtn) minimizeBtn.addEventListener('click', () => { if (window.gpcl && window.gpcl.minimizeWindow) window.gpcl.minimizeWindow(); });
if (closeBtn) closeBtn.addEventListener('click', () => { 
  if (window.gpcl && typeof window.gpcl.closeWindow === 'function') {
    window.gpcl.closeWindow();
  } else {
    
    window.close();
  }
});

const customSelectHandlers: Map<string, { setValue: (value: string, label?: string) => void; getValue: () => string | null }> = new Map();

function initCustomSelect(selectId: string, onChangeCallback?: (value: string) => void): void {
  const selectContainer: HTMLElement | null = document.querySelector(`.custom-select[data-select-id="${selectId}"]`) as HTMLElement | null;
  if (!selectContainer) return;

  const trigger: HTMLElement | null = selectContainer.querySelector('.custom-select-trigger');
  const dropdown: HTMLElement | null = selectContainer.querySelector('.custom-select-dropdown');
  const valueSpan: HTMLElement | null = selectContainer.querySelector('.custom-select-value');
  const options: NodeListOf<Element> = selectContainer.querySelectorAll('.custom-select-option');

  let currentValue: string | null = null;
  options.forEach((option: Element) => {
    if (option.classList.contains('selected')) {
      currentValue = (option as HTMLElement).dataset.value || null;
    }
  });

  trigger?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    if (!dropdown) return;
    const isOpen: boolean = dropdown.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      dropdown.classList.add('open');
      trigger.classList.add('active');
    }
  });

  options.forEach((option: Element) => {
    option.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if (option.classList.contains('disabled')) return;

      const value: string | undefined = (option as HTMLElement).dataset.value;
      const label: string | null = option.textContent;

      options.forEach((opt: Element) => opt.classList.remove('selected'));
      option.classList.add('selected');
      if (valueSpan) valueSpan.textContent = label;
      currentValue = value || null;

      closeAllCustomSelects();

      if (onChangeCallback && value) {
        onChangeCallback(value);
      }
    });
  });

  customSelectHandlers.set(selectId, {
    setValue: (value: string, label?: string) => {
      options.forEach((opt: Element) => opt.classList.remove('selected'));
      const targetOpt: Element | null = selectContainer.querySelector(`.custom-select-option[data-value="${value}"]`);
      if (targetOpt) {
        targetOpt.classList.add('selected');
        if (valueSpan) valueSpan.textContent = targetOpt.textContent;
        currentValue = value;
      } else if (label) {
        if (valueSpan) valueSpan.textContent = label;
        currentValue = value;
      }
    },
    getValue: () => currentValue
  });
}

function closeAllCustomSelects(): void {
  document.querySelectorAll('.custom-select-dropdown').forEach((d: Element) => d.classList.remove('open'));
  document.querySelectorAll('.custom-select-trigger').forEach((t: Element) => t.classList.remove('active'));
}

document.addEventListener('click', closeAllCustomSelects);

function setCustomSelectValue(selectId: string, value: string, label?: string): void {
  const handler = customSelectHandlers.get(selectId);
  if (handler) {
    handler.setValue(value, label);
  }
}

function getCustomSelectValue(selectId: string): string | null {
  const handler = customSelectHandlers.get(selectId);
  return handler ? handler.getValue() : null;
}

const DEFAULT_MAX_THREADS: number = 64;
const MAX_THREADS_LIMIT: number = 128;

const JAVA_RUNTIME_NAME_MAP: Record<string, string> = {
  "8": "jre-legacy",
  "16": "java-runtime-beta",
  "17": "java-runtime-gamma",
  "21": "java-runtime-delta",
  "25": "java-runtime-epsilon"
};

const JAVA_VERSION_DESC: Record<string, { mcVersions: string; desc: string }> = {
  "8": { mcVersions: "1.7.10 - 1.16.5", desc: "经典版本兼容" },
  "17": { mcVersions: "1.17 - 1.20.4", desc: "最稳定，推荐使用" },
  "21": { mcVersions: "1.20.5 - 1.21+", desc: "最新LTS版本" },
  "25": { mcVersions: "1.21+", desc: "最新尝鲜版" }
};

function getJavaRuntimeName(javaVersion: string): string {
  return JAVA_RUNTIME_NAME_MAP[javaVersion] || `jre${javaVersion}`;
}

async function initJavaVersionStatus(): Promise<void> {
  const javaVersions: string[] = ["8", "17", "21", "25"];

  for (const ver of javaVersions) {
    try {
      const result = await window.gpcl.checkJava(ver);
      const card: HTMLElement | null = document.querySelector(`.java-version-card[data-version="${ver}"]`) as HTMLElement | null;
      const badge: HTMLElement | null = document.getElementById(`java-${ver}-status`);
      const btn: HTMLElement | null = card?.querySelector('.java-install-btn') as HTMLElement | null;

      if (result.installed) {
        if (card) card.classList.add('installed');
        if (badge) {
          badge.textContent = '已安装';
          badge.className = 'java-version-badge installed';
        }
        if (btn) {
          btn.textContent = '卸载';
          btn.classList.add('installed');
          (btn as HTMLButtonElement).disabled = false;
        }
      }
    } catch (e: any) {
      console.error(`检查Java ${ver} 状态失败`, e);
    }
  }

  updateJavaInstallStatus();
}

function updateJavaInstallStatus(): void {
  const statusEl: HTMLElement | null = document.getElementById('java-install-status');
  if (!statusEl) return;

  const javaVersions: string[] = ["8", "17", "21", "25"];
  const installed: string[] = [];
  const notInstalled: string[] = [];

  javaVersions.forEach((ver: string) => {
    const card: HTMLElement | null = document.querySelector(`.java-version-card[data-version="${ver}"]`) as HTMLElement | null;
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

function bindJavaInstallButtons(): void {
  const buttons: NodeListOf<Element> = document.querySelectorAll('.java-install-btn');

  buttons.forEach((btn: Element) => {
    btn.addEventListener('click', async (): Promise<void> => {
      const version: string | undefined = (btn as HTMLElement).dataset.version;
      if (btn.classList.contains('installed')) {
        await uninstallJavaWithPanel(version!);
      } else {
        await installJavaWithPanel(version!);
      }
    });
  });
}

async function installJavaWithPanel(javaVersion: string): Promise<void> {
  const filenameEl: HTMLElement | null = document.getElementById('download-filename');
  const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');
  const downloadPanelEl: HTMLElement | null = document.getElementById('download-panel');
  const progressFill: HTMLElement | null = document.getElementById('progress-fill');
  const progressText: HTMLElement | null = document.getElementById('progress-text');
  const cancelBtn: HTMLElement | null = document.getElementById('cancel-download-btn');

  const downloadPageEl: HTMLElement | null = document.getElementById('download-page');
  if (downloadPageEl) {
    downloadPageEl.scrollTop = 0;
  }

  if (downloadPanelEl) {
    downloadPanelEl.classList.remove('hidden');
    downloadPanelEl.classList.add('download-panel-container');
  }
  if (filenameEl) filenameEl.textContent = `正在安装: Java ${javaVersion}`;
  if (downloadStatusEl) downloadStatusEl.textContent = `准备下载 Java ${javaVersion}...`;
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '0%';
  if (cancelBtn) (cancelBtn as HTMLButtonElement).disabled = false;

  document.querySelectorAll('.java-install-btn').forEach((btn: Element) => {
    (btn as HTMLButtonElement).disabled = true;
  });

  try {
    const result = await window.gpcl.installJava(javaVersion);

    if (result.success) {
      if (downloadStatusEl) downloadStatusEl.textContent = `✅ Java ${javaVersion} 安装成功！`;
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '100%';

      showToast('安装成功', `Java ${javaVersion} 已安装完成`, 'success', 'java-install-success');

      const card: HTMLElement | null = document.querySelector(`.java-version-card[data-version="${javaVersion}"]`) as HTMLElement | null;
      const badge: HTMLElement | null = document.getElementById(`java-${javaVersion}-status`);
      const btn: HTMLElement | null = card?.querySelector('.java-install-btn') as HTMLElement | null;

      if (card) card.classList.add('installed');
      if (badge) {
        badge.textContent = '已安装';
        badge.className = 'java-version-badge installed';
      }
      if (btn) {
        btn.textContent = '卸载';
        btn.classList.add('installed');
        (btn as HTMLButtonElement).disabled = false;
      }

      updateJavaInstallStatus();

      setTimeout(() => {
        if (downloadPanelEl) {
          downloadPanelEl.classList.add('hidden');
          downloadPanelEl.classList.remove('download-panel-container');
        }
      }, 2000);
    } else {
      throw new Error(result.error || '安装失败');
    }
  } catch (err: any) {
    if (downloadStatusEl) downloadStatusEl.textContent = `❌ 安装失败: ${err.message || err}`;
    showToast('安装失败', err.message || String(err), 'error', 'java-install-failed');
  }
  document.querySelectorAll('.java-install-btn').forEach((btn: Element) => {
    if (!btn.classList.contains('installed')) {
      (btn as HTMLButtonElement).disabled = false;
    }
  });
  if (cancelBtn) (cancelBtn as HTMLButtonElement).disabled = true;
}

async function uninstallJavaWithPanel(javaVersion: string): Promise<void> {
  const confirmed: boolean = await showDialog({
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

      const card: HTMLElement | null = document.querySelector(`.java-version-card[data-version="${javaVersion}"]`) as HTMLElement | null;
      const badge: HTMLElement | null = document.getElementById(`java-${javaVersion}-status`);
      const btn: HTMLElement | null = card?.querySelector('.java-install-btn') as HTMLElement | null;

      if (card) card.classList.remove('installed');
      if (badge) {
        badge.textContent = '';
        badge.className = 'java-version-badge';
      }
      if (btn) {
        btn.textContent = '安装';
        btn.classList.remove('installed');
        (btn as HTMLButtonElement).disabled = false;
      }

      updateJavaInstallStatus();
    } else {
      throw new Error(result.error || '卸载失败');
    }
  } catch (err: any) {
    showToast('卸载失败', err.message || String(err), 'error', 'java-uninstall-failed');
  }
}

function getRecommendedJavaVersionFromMC(mcVersion: string): { version: string; reason: string } {
  
  const parts: string[] = mcVersion.split('.');
  let major: number = parseInt(parts[0], 10);
  let minor: number = parseInt(parts[1], 10);
  let patch: number = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;

  if (isNaN(major)) major = 1;



  
  if (isNaN(minor)) {
    
    if (major >= 26) {
      return { version: '25', reason: `Minecraft ${mcVersion} 推荐使用 Java 25` };
    }
    
    if (major >= 21) {
      return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
    }
    return { version: '17', reason: '使用推荐的稳定版' };
  }

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

  if (major >= 2) {
    
    if (major >= 26) {
      return { version: '25', reason: `Minecraft ${mcVersion} 推荐使用 Java 25` };
    }
    return { version: '21', reason: `Minecraft ${mcVersion} 推荐使用 Java 21` };
  }

  return { version: '17', reason: '使用推荐的稳定版' };
}

if (window.gpcl && window.gpcl.onDownloadProgress) {
  const originalCallback: any = window.gpcl.onDownloadProgress;
  window.gpcl.onDownloadProgress((data: any): void => {
    
    const progressFill: HTMLElement | null = document.getElementById('progress-fill');
    const progressText: HTMLElement | null = document.getElementById('progress-text');
    const filenameEl: HTMLElement | null = document.getElementById('download-filename');
    const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');

    if (progressFill && progressText) {
      const percent: number = data.percent || 0;
      progressFill.style.width = percent + '%';
      progressText.textContent = percent.toFixed(1) + '%';
    }
    if (data.label && filenameEl) {
      filenameEl.textContent = data.label;
    }
    if (data.label && downloadStatusEl) {
      downloadStatusEl.textContent = `正在下载: ${data.label}`;
    }

    const floatProgressFill: HTMLElement | null = document.getElementById('float-progress-fill');
    const floatProgressText: HTMLElement | null = document.getElementById('float-progress-text');
    const floatNotification: HTMLElement | null = document.getElementById('float-notification');
    
    if (floatProgressFill && floatProgressText && floatNotification && !floatNotification.classList.contains('hidden')) {
      const percent: number = data.percent || 0;
      floatProgressFill.style.width = percent + '%';
      floatProgressText.textContent = percent.toFixed(1) + '%';
    }

    if (typeof originalCallback === 'function') {
      originalCallback(data);
    }
  });
}

function showFloatNotification(title: string, text: string): void {
  const notification: HTMLElement | null = document.getElementById('float-notification');
  const titleEl: HTMLElement | null = document.getElementById('float-notification-title');
  const textEl: HTMLElement | null = document.getElementById('float-notification-text');
  
  if (notification && titleEl && textEl) {
    titleEl.textContent = title;
    textEl.textContent = text;

    const progressFill: HTMLElement | null = document.getElementById('float-progress-fill');
    const progressText: HTMLElement | null = document.getElementById('float-progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    notification.classList.remove('hidden');
  }
}

function hideFloatNotification(): void {
  const notification: HTMLElement | null = document.getElementById('float-notification');
  if (notification) {
    notification.classList.add('hidden');
  }
}

if (window.gpcl && window.gpcl.onGameLog) {
  window.gpcl.onGameLog((text: string): void => {
    if (text.includes('Java') && text.includes('未安装') && text.includes('自动开始下载')) {
      const match: RegExpMatchArray | null = text.match(/Java\s+(\d+)/);
      if (match) {
        showFloatNotification(
          `正在下载 Java ${match[1]}`,
          `检测到您没有 Java ${match[1]}，正在自动下载`
        );
      }
    }
  });
}

const floatCloseBtn: HTMLElement | null = document.getElementById('float-notification-close');
if (floatCloseBtn) {
  floatCloseBtn.addEventListener('click', hideFloatNotification);
}

if (window.gpcl && window.gpcl.onJavaDownloadCompleted) {
  window.gpcl.onJavaDownloadCompleted((data: any): void => {
    const { javaVersion } = data;
    const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');
    if (downloadStatusEl) {
      downloadStatusEl.textContent = '✅ 下载完成，正在解压安装...';
    }
  });
}

if (window.gpcl && window.gpcl.onJavaDownloadFailed) {
  window.gpcl.onJavaDownloadFailed((data: any): void => {
    const { error } = data;
    const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');
    if (downloadStatusEl) {
      downloadStatusEl.textContent = `❌ 下载失败: ${error}`;
    }
    showToast('下载失败', error, 'error', 'java-download-failed');
  });
}

async function loadSettingFromStorage(): Promise<number> {
  try {
    const settings = await loadSettings();
    return settings.download?.maxConcurrent || DEFAULT_MAX_THREADS;
  } catch (e: any) {
    return DEFAULT_MAX_THREADS;
  }
}
async function saveSettingToStorage(maxConcurrent: number): Promise<boolean> {
  try {
    const settings = await loadSettings();
    settings.download.maxConcurrent = maxConcurrent;
    await gpcl.saveSettings(settings);
    return true;
  } catch (e: any) { return false; }
}
const settingsNumInput: HTMLInputElement | null = document.getElementById('num-threads') as HTMLInputElement | null;
const settingsBtnMinus: HTMLElement | null = document.getElementById('btn-minus');
const settingsBtnPlus: HTMLElement | null = document.getElementById('btn-plus');
const settingsBtnSave: HTMLElement | null = document.getElementById('btn-save');
if (settingsNumInput) {
  (async (): Promise<void> => {
    settingsNumInput.value = String(await loadSettingFromStorage());
  })();
  function clampSettingsInput(): void {
    let v: number = parseInt(settingsNumInput!.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > MAX_THREADS_LIMIT) v = MAX_THREADS_LIMIT;
    settingsNumInput!.value = String(v);
  }
  settingsNumInput.addEventListener('change', clampSettingsInput);
  settingsNumInput.addEventListener('blur', clampSettingsInput);
  if (settingsBtnMinus) {
    settingsBtnMinus.addEventListener('click', () => {
      let v: number = parseInt(settingsNumInput.value, 10) || 1;
      if (v > 1) { settingsNumInput.value = String(v - 1); clampSettingsInput(); }
    });
  }
  if (settingsBtnPlus) {
    settingsBtnPlus.addEventListener('click', () => {
      let v: number = parseInt(settingsNumInput.value, 10) || 1;
      if (v < MAX_THREADS_LIMIT) { settingsNumInput.value = String(v + 1); clampSettingsInput(); }
    });
  }
  if (settingsBtnSave) {
    settingsBtnSave.addEventListener('click', async (): Promise<void> => {
      clampSettingsInput();
      await saveSettingToStorage(parseInt(settingsNumInput.value, 10));
      const orig: string | null = settingsBtnSave.textContent;
      settingsBtnSave.textContent = '已保存!';
      setTimeout(() => { settingsBtnSave.textContent = orig; }, 1500);
    });
  }

async function reloadAllSettingsToUI(): Promise<void> {
  const settings = await loadSettings();
  
  const settingsMemory: HTMLElement | null = document.getElementById('settings-memory');
  if (settingsMemory) {
    (settingsMemory as HTMLInputElement).value = settings.game?.memory || '4';
  }
  
  const settingsWindowMode: HTMLElement | null = document.getElementById('settings-window-mode');
  if (settingsWindowMode) {
    (settingsWindowMode as HTMLInputElement).value = settings.game?.windowMode || 'windowed';
  }
  
  const settingsTheme: HTMLElement | null = document.getElementById('settings-theme');
  if (settingsTheme) {
    (settingsTheme as HTMLInputElement).value = settings.appearance?.theme || 'dark';
    applyTheme(settings.appearance?.theme || 'dark');
  }
  
  const settingsScale: HTMLElement | null = document.getElementById('settings-scale');
  if (settingsScale) {
    (settingsScale as HTMLInputElement).value = settings.appearance?.scale || '100';
    applyScale(settings.appearance?.scale || '100');
  }
  
  const settingsNumInputEl: HTMLElement | null = document.getElementById('num-threads');
  if (settingsNumInputEl) {
    (settingsNumInputEl as HTMLInputElement).value = String(settings.download?.maxConcurrent || 64);
  }
  
  const javaMirrorSelect: HTMLElement | null = document.getElementById('java-mirror-select');
  const customMirrorContainer: HTMLElement | null = document.getElementById('custom-java-mirror-container');
  const customMirrorUrl: HTMLInputElement | null = document.getElementById('custom-java-mirror-url') as HTMLInputElement | null;
  if (javaMirrorSelect) {
    (javaMirrorSelect as HTMLInputElement).value = settings.download?.javaMirror || 'tsinghua';
    if (customMirrorContainer) {
      customMirrorContainer.classList.toggle('hidden', (javaMirrorSelect as HTMLInputElement).value !== 'custom');
    }
    if (customMirrorUrl) {
      customMirrorUrl.value = settings.download?.customJavaMirror || '';
    }
  }
  
  const autoCheckUpdate: HTMLInputElement | null = document.getElementById('auto-check-update') as HTMLInputElement | null;
  if (autoCheckUpdate) {
    autoCheckUpdate.checked = settings.advanced?.autoCheckUpdate !== false;
  }
  const preventMultipleLaunch: HTMLInputElement | null = document.getElementById('prevent-multiple-launch') as HTMLInputElement | null;
  if (preventMultipleLaunch) {
    preventMultipleLaunch.checked = settings.advanced?.preventMultipleLaunch !== false;
  }

  const autoClearLogs: HTMLInputElement | null = document.getElementById('auto-clear-logs') as HTMLInputElement | null;
  const logRetentionContainer: HTMLElement | null = document.getElementById('log-retention-container');
  const logRetentionValue: HTMLInputElement | null = document.getElementById('log-retention-value') as HTMLInputElement | null;
  const logRetentionUnit: HTMLElement | null = document.getElementById('log-retention-unit');
  
  if (autoClearLogs) {
    autoClearLogs.checked = settings.advanced?.autoClearLogs !== false;
  }
  
  if (logRetentionContainer) {
    logRetentionContainer.classList.toggle('hidden', settings.advanced?.autoClearLogs === false);
  }
  
  if (logRetentionValue) {
    logRetentionValue.value = String(settings.advanced?.logRetentionValue || 7);
  }
  
  if (logRetentionUnit) {
    (logRetentionUnit as HTMLInputElement).value = settings.advanced?.logRetentionUnit || 'day';
  }

  const playStartupAnimationEl: HTMLInputElement | null = document.getElementById('play-startup-animation') as HTMLInputElement | null;
  if (playStartupAnimationEl) {
    playStartupAnimationEl.checked = settings.appearance?.playStartupAnimation === true;
  }

  const skipSplashEl: HTMLInputElement | null = document.getElementById('skip-splash') as HTMLInputElement | null;
  if (skipSplashEl) {
    skipSplashEl.checked = settings.appearance?.skipSplash === true;
  }

  const enableMoreEl: HTMLInputElement | null = document.getElementById('enable-more') as HTMLInputElement | null;
  if (enableMoreEl) {
    enableMoreEl.checked = settings.appearance?.enableMore !== false;
    updateMoreMenuVisibility(settings.appearance?.enableMore !== false);
  }

  const developerModeEl: HTMLInputElement | null = document.getElementById('developer-mode') as HTMLInputElement | null;
  if (developerModeEl) {
    developerModeEl.checked = settings.advanced?.developerMode === true;
  }
}

function updateMoreMenuVisibility(enabled: boolean): void {
  const menuMoreEl: HTMLElement | null = document.getElementById('menu-more');
  if (menuMoreEl) {
    menuMoreEl.style.display = enabled ? '' : 'none';
  }
}

const enableMoreEl: HTMLInputElement | null = document.getElementById('enable-more') as HTMLInputElement | null;
if (enableMoreEl) {
  enableMoreEl.addEventListener('change', async (e: Event): Promise<void> => {
    const enabled: boolean = (e.target as HTMLInputElement).checked;
    updateMoreMenuVisibility(enabled);
    
    const settings = await loadSettings();
    settings.appearance = settings.appearance || {} as any;
    (settings.appearance as any).enableMore = enabled;
    await window.gpcl.saveSettings(settings);
  });
}

}

function initChart(): void {
  const ctx: HTMLCanvasElement | null = document.getElementById('speedChart') as HTMLCanvasElement | null;
  if (!ctx) return;

  const chartCtx: CanvasRenderingContext2D = ctx.getContext('2d')!;

  const gradient: CanvasGradient = chartCtx.createLinearGradient(0, 0, 0, 180);
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
            label: function(context: any): string {
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

function updateChart(speed: number): void {
  if (!speedChart) return;

  speedData.push(speed);
  if (speedData.length > 40) speedData.shift();

  speedChart.data.datasets[0].data = speedData;

  const maxSpeed: number = Math.max(...speedData, 1);
  speedChart.options.scales.y.suggestedMax = maxSpeed * 1.5;

  speedChart.update('none');
}

function resetChart(): void {
  speedData = Array(40).fill(0);
  peakSpeed = 0;

  if (speedChart) {
    speedChart.data.datasets[0].data = speedData;
    speedChart.update();
  }

  const currentSpeedEl: HTMLElement | null = document.getElementById('current-speed');
  const peakSpeedEl: HTMLElement | null = document.getElementById('peak-speed');
  const progressFillEl: HTMLElement | null = document.getElementById('progress-fill');
  const progressTextEl: HTMLElement | null = document.getElementById('progress-text');

  if (currentSpeedEl) currentSpeedEl.textContent = '0.00 Mbps';
  if (peakSpeedEl) peakSpeedEl.textContent = '0.00 Mbps';
  if (progressFillEl) progressFillEl.style.width = '0%';
  if (progressTextEl) progressTextEl.textContent = '0%';
}


function setStatus(text: string, type: string = 'info'): void {
  if (statusDiv) statusDiv.textContent = text;
  if (statusDiv) statusDiv.style.color =
    type === 'error' ? '#ef5350' :
    type === 'success' ? '#66bb6a' :
    '#e0e0e0';
}

async function loadVersions(silent: boolean = false): Promise<void> {
  try {
    let versions: string[] = [];

    if (window.gpcl && typeof window.gpcl.scanVersions === 'function') {
      try {
        versions = await window.gpcl.scanVersions(null, silent);
      } catch (e: any) {
        console.error('调用scanVersions失败:', e);
      }
    }

    if (!versions || versions.length === 0) {
      if (!silent) setStatus('没有本地版本，请先下载');
      
      updateLaunchButtonState(false);
    } else {
      if (!silent) setStatus(`发现 ${versions.length} 个已安装版本`);
      
      updateLaunchButtonState(true);
    }

    if (!versionSelect) {
      if (!silent) console.warn('versionSelect 元素不存在，跳过版本列表渲染');
      return;
    }

    versionSelect.innerHTML = '<option value="">请选择版本</option>';

    if (!versions || versions.length === 0) {
      const opt: HTMLOptionElement = document.createElement('option');
      opt.disabled = true;
      opt.textContent = '未发现已安装的版本';
      versionSelect.appendChild(opt);
      return;
    }

    versions.sort((a: string, b: string) => b.localeCompare(a, undefined, { numeric: true }));

    for (const v of versions) {
      let displayName: string = `Minecraft ${v}`;
      if (window.gpcl && typeof window.gpcl.getVersionDisplayName === 'function') {
        try {
          displayName = await window.gpcl.getVersionDisplayName(v);
        } catch (e: any) {
          console.warn(`获取版本显示名称失败: ${v}`, e);
        }
      }
      const opt: HTMLOptionElement = document.createElement('option');
      opt.value = v;
      opt.textContent = displayName;
      versionSelect.appendChild(opt);
    }
  } catch (err: any) {
    if (!silent) {
      setStatus('扫描本地版本失败', 'error');
      showToast('扫描失败', err.message || String(err), 'error');
    }
    
    updateLaunchButtonState(false);
  }
}

function updateLaunchButtonState(hasGame: boolean): void {
  const launchBtnEl: HTMLElement | null = document.getElementById('launch-btn');
  const launchText: HTMLElement | null = launchBtnEl?.querySelector('.launch-text') as HTMLElement | null;

  if (launchBtnEl && launchText) {
    if (hasGame) {
      launchText.textContent = '▶ 开始游戏';
      launchBtnEl.dataset.mode = 'launch';
      
      launchBtnEl.classList.remove('no-game');
    } else {
      launchText.textContent = '⏬ 前往下载';
      launchBtnEl.dataset.mode = 'download';
      
      launchBtnEl.classList.add('no-game');
    }
  }
}

const VERSION_HISTORY_FILE: string = 'gpcl_version_history.json';
const VERSION_HISTORY_PATH: string = 'users';

async function getVersionHistory(): Promise<Record<string, any>> {
  try {
    if (window.gpcl && typeof window.gpcl.readJsonFile === 'function') {
      const history = await window.gpcl.readJsonFile(VERSION_HISTORY_PATH, VERSION_HISTORY_FILE);
      return history || {};
    }
  } catch (e: any) {
    console.error('从文件读取版本历史失败:', e);
  }
  return {};
}

async function saveVersionHistory(history: Record<string, any>): Promise<void> {
  if (window.gpcl && typeof window.gpcl.writeJsonFile === 'function') {
    try {
      await window.gpcl.writeJsonFile(VERSION_HISTORY_PATH, VERSION_HISTORY_FILE, history);
    } catch (e: any) {
      console.error('写入版本历史到文件失败:', e);
    }
  }
}

async function recordVersionLaunch(versionId: string): Promise<void> {
  try {
    const history = await getVersionHistory();
    if (!history[versionId]) {
      history[versionId] = {};
    }
    history[versionId].lastLaunch = Date.now();
    await saveVersionHistory(history);
  } catch (e: any) {
    console.error('记录版本启动时间失败:', e);
  }
}

async function recordVersionDownload(versionId: string): Promise<void> {
  try {
    const history = await getVersionHistory();
    if (!history[versionId]) {
      history[versionId] = {};
    }
    history[versionId].downloadTime = Date.now();
    history[versionId].lastLaunch = Date.now(); 
    await saveVersionHistory(history);
  } catch (e: any) {
    console.error('记录版本下载时间失败:', e);
  }
}

async function renderVersionSelectList(): Promise<void> {
  const container: HTMLElement | null = document.getElementById('launch-version-list');
  const countEl: HTMLElement | null = document.getElementById('version-count');
  
  if (!container) return;
  
  try {
    let versions: string[] = [];

    if (window.gpcl && typeof window.gpcl.scanVersions === 'function') {
      try {
        versions = await window.gpcl.scanVersions(null, true);
      } catch (e: any) {
        console.error('调用scanVersions失败:', e);
      }
    }
    
    const history = await getVersionHistory();
    
    if (!versions || versions.length === 0) {
      container.innerHTML = '<div class="version-list-empty">暂无已安装的版本</div>';
      if (countEl) countEl.textContent = '0 个版本';
      return;
    }

    versions.sort((a: string, b: string) => {
      const timeA: number = history[a]?.lastLaunch || history[a]?.downloadTime || 0;
      const timeB: number = history[b]?.lastLaunch || history[b]?.downloadTime || 0;
      return timeB - timeA;
    });
    
    container.innerHTML = '';
    
    versions.forEach((versionId: string, index: number) => {
      const item: HTMLDivElement = document.createElement('div');
      item.className = 'version-item';
      item.dataset.versionId = versionId;

      const icon: string = index === 0 && (history[versionId]?.lastLaunch || history[versionId]?.downloadTime) 
        ? '⭐' : '📦';

      const lastTime: number = history[versionId]?.lastLaunch || history[versionId]?.downloadTime;
      let timeText: string = '';
      if (lastTime) {
        const date: Date = new Date(lastTime);
        const now: Date = new Date();
        const diff: number = now.getTime() - date.getTime();
        
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
    
    if (countEl) countEl.textContent = `${versions.length} 个版本`;

    if (!selectedVersionId && versions.length > 0) {
      selectVersion(versions[0]);
    }
  } catch (err: any) {
    container.innerHTML = '<div class="version-list-empty">加载版本列表失败</div>';
    if (countEl) countEl.textContent = '加载失败';
  }
}

function selectVersion(versionId: string): void {
  selectedVersionId = versionId;

  const items: NodeListOf<Element> = document.querySelectorAll('.version-item');
  items.forEach((item: Element) => {
    item.classList.toggle('selected', (item as HTMLElement).dataset.versionId === versionId);
  });

  const infoEl: HTMLElement | null = document.getElementById('selected-version-info');
  const nameEl: HTMLElement | null = document.getElementById('selected-version-name');

  if (infoEl && nameEl) {
    nameEl.textContent = `Minecraft ${versionId}`;
    infoEl.classList.remove('hidden');
  }

  const displayEl: HTMLElement | null = document.getElementById('selected-version-display');
  const textEl: HTMLElement | null = document.getElementById('selected-version-text');
  if (displayEl && textEl) {
    textEl.textContent = versionId;
    displayEl.classList.remove('hidden');
  }

  updateLaunchButtonState(true);
}

async function isVersionInstalled(versionId: string): Promise<boolean> {
  try {
    const versions: string[] = await window.gpcl.scanVersions(null, true);
    return versions.includes(versionId);
  } catch {
    return false;
  }
}

let allVersions: any[] = [];
let selectedVersionId: string | null = null;

let modLoaderState: any = {
  forge: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null },
  optifine: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null }
};

const MOD_LOADER_COMPATIBILITY: Record<string, string[]> = {
  
  forge: ['fabric'],
  fabric: ['forge'],
  
  optifine: ['forge', 'fabric']
};

async function checkForgeAvailability(mcVersion: string): Promise<{ available: boolean; versions: any[] }> {
  try {
    
    const parts: string[] = mcVersion.split('.');
    const major: number = parseInt(parts[0], 10) || 1;
    const minor: number = parseInt(parts[1], 10) || 0;

    if (major === 1 && minor < 1) {
      return { available: false, versions: [] };
    }

    const result = await window.gpcl.getForgeVersions(mcVersion);
    if (result.success) {
      return { available: result.versions.length > 0, versions: result.versions };
    }
    return { available: false, versions: [] };
  } catch (e: any) {
    console.error('检测 Forge 可用性失败:', e);
    return { available: false, versions: [] };
  }
}

async function checkAllModLoaders(mcVersion: string): Promise<void> {
  
  modLoaderState = {
    forge: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null },
    optifine: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null }
  };

  const forgeResult = await checkForgeAvailability(mcVersion);
  modLoaderState.forge = { ...modLoaderState.forge, ...forgeResult };

  const optifineResult = await checkOptiFineAvailability(mcVersion);
  modLoaderState.optifine = { ...modLoaderState.optifine, ...optifineResult };

  updateModLoaderUI();
}

async function checkOptiFineAvailability(mcVersion: string): Promise<{ available: boolean; versions: any[] }> {
  try {
    const result = await window.gpcl.getOptiFineVersions(mcVersion);
    if (result.success) {
      return { available: result.versions.length > 0, versions: result.versions };
    }
    return { available: false, versions: [] };
  } catch (e: any) {
    console.error('检测 OptiFine 可用性失败:', e);
    return { available: false, versions: [] };
  }
}

function updateModLoaderUI(): void {
  for (const [loader, state] of Object.entries(modLoaderState) as [string, any][]) {
    const card: HTMLElement | null = document.getElementById(`${loader}-option`);
    const badge: HTMLElement | null = document.getElementById(`${loader}-badge`);
    const content: HTMLElement | null = document.getElementById(`${loader}-content`);
    const loading: HTMLElement | null = document.getElementById(`${loader}-loading`);
    const versionsContainer: HTMLElement | null = document.getElementById(`${loader}-versions`);
    const error: HTMLElement | null = document.getElementById(`${loader}-error`);
    
    if (!card || !badge) continue;

    if (state.available) {
      badge.textContent = '可用';
      badge.className = 'detail-option-badge available';
      card.classList.remove('not-available');
    } else {
      badge.textContent = '不可用';
      badge.className = 'detail-option-badge unavailable';
      card.classList.add('not-available');
    }

    if (state.expanded && state.available) {
      if (content) content.classList.remove('hidden');
      if (loading) loading.classList.add('hidden');
      if (error) error.classList.add('hidden');
      if (versionsContainer) versionsContainer.classList.remove('hidden');
      renderModLoaderVersionList(loader, state.versions);
    } else if (state.expanded && !state.available) {
      if (content) content.classList.remove('hidden');
      if (loading) loading.classList.add('hidden');
      if (versionsContainer) versionsContainer.classList.add('hidden');
      if (error) error.classList.remove('hidden');
    } else {
      if (content) content.classList.add('hidden');
    }
  }
}

function renderModLoaderVersionList(loader: string, versions: any[]): void {
  const container: HTMLElement | null = document.getElementById(`${loader}-versions`);
  if (!container) return;
  
  container.innerHTML = '';
  
  versions.forEach((version: any, index: number) => {
    const item: HTMLDivElement = document.createElement('div');
    item.className = 'detail-option-version-item';
    item.dataset.versionId = version.id;
    item.dataset.version = version.version;

    if (modLoaderState[loader].selectedVersionId === version.id) {
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

function selectModLoaderVersion(loader: string, version: string, versionId: string): void {
  const state = modLoaderState[loader];

  if (state.selectedVersionId === versionId) {
    state.selectedVersionId = null;
    state.selected = null;
  } else {
    state.selectedVersionId = versionId;
    state.selected = version;
  }

  const container: HTMLElement | null = document.getElementById(`${loader}-versions`);
  if (container) {
    const items: NodeListOf<Element> = container.querySelectorAll('.detail-option-version-item');
    items.forEach((item: Element) => {
      item.classList.toggle('selected', (item as HTMLElement).dataset.versionId === state.selectedVersionId);
    });
  }
}

function updateIncompatibilityUI(): void {
  
}

function getLoaderDisplayName(loader: string): string {
  const names: Record<string, string> = {
    forge: 'Forge',
    fabric: 'Fabric',
    optifine: 'OptiFine'
  };
  return names[loader] || loader;
}

function toggleModLoader(loader: string): void {
  const state = modLoaderState[loader];
  const card: HTMLElement | null = document.getElementById(`${loader}-option`);
  const content: HTMLElement | null = document.getElementById(`${loader}-content`);
  const arrow: HTMLElement | null = card?.querySelector('.detail-option-arrow') as HTMLElement | null;
  
  if (!content) return;

  if (!state.available) return;
  
  state.expanded = !state.expanded;
  
  if (state.expanded) {
    if (arrow) arrow.classList.add('expanded');
  } else {
    if (arrow) arrow.classList.remove('expanded');
  }

  updateModLoaderUI();
}

function bindModLoaderEvents(): void {
  for (const loader of Object.keys(modLoaderState)) {
    const card: HTMLElement | null = document.getElementById(`${loader}-option`);
    if (!card) continue;
    
    const header: HTMLElement | null = card.querySelector('.detail-option-header');
    if (header) {
      header.addEventListener('click', () => toggleModLoader(loader));
    }
  }
}

function resetModLoaderState(): void {
  modLoaderState = {
    forge: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null },
    optifine: { available: false, versions: [], selected: null, expanded: false, selectedVersionId: null }
  };

  for (const loader of Object.keys(modLoaderState)) {
    const card: HTMLElement | null = document.getElementById(`${loader}-option`);
    const badge: HTMLElement | null = document.getElementById(`${loader}-badge`);
    const content: HTMLElement | null = document.getElementById(`${loader}-content`);
    const loading: HTMLElement | null = document.getElementById(`${loader}-loading`);
    const versions: HTMLElement | null = document.getElementById(`${loader}-versions`);
    const error: HTMLElement | null = document.getElementById(`${loader}-error`);
    const arrow: HTMLElement | null = card?.querySelector('.detail-option-arrow') as HTMLElement | null;
    
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
  }
}

function getCategoryLabel(type: string): string {
  const map: Record<string, string> = { release: '正式版', snapshot: '快照版', old_beta: '老版本 Beta', old_alpha: '老版本 Alpha' };
  return map[type] || type;
}

function getCategoryIcon(type: string): string {
  const map: Record<string, string> = { release: '🟢', snapshot: '🟡', old_beta: '🟠', old_alpha: '🔴' };
  return map[type] || '⚪';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d: Date = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderVersionList(versionMap: Record<string, any[]>): void {
  if (!versionListContainer) return;
  versionListContainer.innerHTML = '';

  const categoryOrder: string[] = ['release', 'snapshot', 'old_beta', 'old_alpha'];
  let totalCount: number = 0;

  categoryOrder.forEach((type: string) => {
    const items = versionMap[type];
    if (!items || items.length === 0) return;
    totalCount += items.length;

    const categoryEl: HTMLDivElement = document.createElement('div');
    categoryEl.className = 'version-category';
    categoryEl.dataset.category = type;

    const isRelease: boolean = type === 'release';
    const header: HTMLDivElement = document.createElement('div');
    header.className = 'version-category-header';
    header.innerHTML = `
      <span class="version-category-arrow ${isRelease ? '' : 'collapsed'}">▼</span>
      <span class="version-category-icon">${getCategoryIcon(type)}</span>
      <span class="version-category-name">${getCategoryLabel(type)}</span>
      <span class="version-category-count">${items.length} 个版本</span>
    `;

    const body: HTMLDivElement = document.createElement('div');
    body.className = `version-category-items ${isRelease ? '' : 'collapsed'}`;

    items.forEach((v: any) => {
      const item: HTMLDivElement = document.createElement('div');
      item.className = 'version-item';
      item.dataset.versionId = v.id;
      
      const displayName: string = v.displayName || v.id;
      item.innerHTML = `
        <span class="version-item-id">${displayName}</span>
        <span class="version-item-time">${formatDate(v.releaseTime)}</span>
      `;
      item.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        showVersionDetail(v);
      });
      body.appendChild(item);
    });

    header.addEventListener('click', () => {
      const arrow: HTMLElement | null = header.querySelector('.version-category-arrow');
      const isCollapsed: boolean = body.classList.toggle('collapsed');
      if (arrow) arrow.classList.toggle('collapsed', isCollapsed);
    });

    categoryEl.appendChild(header);
    categoryEl.appendChild(body);
    versionListContainer.appendChild(categoryEl);
  });

  if (versionCountLabel) {
    versionCountLabel.textContent = `共 ${totalCount} 个版本`;
  }
}

function showVersionDetail(version: any): void {
  selectedVersionId = version.id;
  if (versionListSection) versionListSection.classList.add('hidden');
  if (versionDetailPage) versionDetailPage.classList.remove('hidden');

  if (detailDownloadBtn) detailDownloadBtn.disabled = false;

  const idEl: HTMLElement | null = document.getElementById('detail-version-id');
  const typeEl: HTMLElement | null = document.getElementById('detail-version-type');
  const typeLabelEl: HTMLElement | null = document.getElementById('detail-type-label');
  const timeEl: HTMLElement | null = document.getElementById('detail-release-time');

  if (idEl) idEl.textContent = `Minecraft ${version.id}`;
  if (typeEl) typeEl.textContent = getCategoryLabel(version.type);
  if (typeLabelEl) typeLabelEl.textContent = `${getCategoryIcon(version.type)} ${getCategoryLabel(version.type)}`;
  if (timeEl) timeEl.textContent = formatDate(version.releaseTime) || '未知';

  resetModLoaderState();
  checkAllModLoaders(version.id);
}

function hideVersionDetail(): void {
  selectedVersionId = null;
  if (versionDetailPage) versionDetailPage.classList.add('hidden');
  if (versionListSection) versionListSection.classList.remove('hidden');
}

async function loadRemoteVersions(): Promise<void> {
  const refreshBtn: HTMLElement | null = document.getElementById('refresh-btn-page');
  try {
    if (refreshBtn) refreshBtn.classList.add('hidden');
    if (versionListContainer) {
      versionListContainer.innerHTML = '<div class="version-list-loading">正在加载版本列表...</div>';
    }
    
    let versions: any[] = [];

    if (window.gpcl && typeof window.gpcl.getVersionManifest === 'function') {
      try {
        versions = await window.gpcl.getVersionManifest();
      } catch (e: any) {
        console.error('调用getVersionManifest失败:', e);
      }
    }

    if (!versions || versions.length === 0) {
      try {
        if (window.gpcl && typeof window.gpcl.readJsonFile === 'function') {
          const cached = await window.gpcl.readJsonFile('cache', 'remote_versions.json');
          if (cached) {
            versions = cached;
          }
        }
      } catch (e: any) {
        console.error('从文件缓存获取远程版本列表失败:', e);
      }
    }

    if (!versions || versions.length === 0) {
      setStatus('无法获取远程版本列表', 'error');
      if (versionListContainer) {
        versionListContainer.innerHTML = '<div class="version-list-error">无法获取版本列表<br><button class="refresh-btn" style="margin-top:12px;" onclick="loadRemoteVersions()">重试</button></div>';
      }
      if (refreshBtn) refreshBtn.classList.remove('hidden');
      return;
    }

    const versionMap: Record<string, any[]> = {};
    versions.forEach((v: any) => {
      if (!versionMap[v.type]) versionMap[v.type] = [];
      versionMap[v.type].push(v);
    });

    try {
      if (window.gpcl && typeof window.gpcl.writeJsonFile === 'function') {
        await window.gpcl.writeJsonFile('cache', 'remote_versions.json', versions);
      }
    } catch (e: any) {
      console.error('保存远程版本列表到缓存失败:', e);
    }

    allVersions = versions;
    renderVersionList(versionMap);
    setStatus('远程版本列表已加载');
  } catch (err: any) {
    setStatus('无法获取远程版本列表，请检查网络', 'error');
    showToast('版本列表加载失败', err.message || '请检查网络连接', 'error', 'remote-versions-error');
    if (versionListContainer) {
      versionListContainer.innerHTML = '<div class="version-list-error">加载失败，请检查网络连接<br><button class="refresh-btn" style="margin-top:12px;" onclick="loadRemoteVersions()">重试</button></div>';
    }
    if (refreshBtn) refreshBtn.classList.remove('hidden');
  }
}

async function launchGame(): Promise<void> {
  
  const launchBtnEl: HTMLElement | null = document.getElementById('launch-btn');
  const mode: string = (launchBtnEl as any)?.dataset.mode || 'launch';
  
  if (mode === 'download') {
    
    showPage('download');
    setStatus('请选择要下载的游戏版本');
    return;
  }

  setStatus('[动画] launchGame 函数被调用了');
  const username: string = (usernameInput?.value || '').trim() || 'GPCL_Player';

  const versionId: string | null = selectedVersionId;

  if (!versionId) {
    setStatus('请先选择已安装的版本', 'error');
    return;
  }

  await recordVersionLaunch(versionId);

  if (window.gpcl && window.gpcl.savePlayerName) {
    await window.gpcl.savePlayerName(username);
  }

  if (launchBtnEl) (launchBtnEl as HTMLButtonElement).disabled = true;

  showLaunchAnimation(versionId);

  try {
    
    const gameDir = await initGameDir();
    setStatus('[动画] 开始启动游戏');

    const settings = await loadSettings();
    let windowMode: string = settings.game?.windowMode || 'windowed';
    let welcomeAnimPlaying: boolean = false;
    
    if (settings.appearance?.playStartupAnimation && window.gpcl && window.gpcl.playStartupAnimation) {
      setStatus('[启动动画] 正在播放欢迎动画...');
      welcomeAnimPlaying = true;
      windowMode = 'fullscreen';
      
      settings.appearance.playStartupAnimation = false;
      await gpcl.saveSettings(settings);
      const playStartupEl: HTMLInputElement | null = document.getElementById('play-startup-animation') as HTMLInputElement | null;
      if (playStartupEl) playStartupEl.checked = false;
      
      await window.gpcl.playStartupAnimation();
      setStatus('[启动动画] 动画播放完毕，正在启动游戏...');
    }

    setupGameWindowListener();
    
    const result = await window.gpcl.launch({
      versionId,
      username: msAuthData ? msAuthData.username : username,
      gameDir,
      windowMode,
      authUuid: msAuthData?.uuid,
      authAccessToken: msAuthData?.accessToken,
      authUserType: msAuthData ? 'msa' : undefined
    });

    if (result.success) {
      setStatus('[动画] 游戏启动成功，窗口已创建');
      
      if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
        window.gpcl.dismissStartupAnimation();
      }

      showLaunchSuccess();
      
      setTimeout(() => {
        hideLaunchAnimation();
      }, 800);
      
      setStatus(`游戏已启动！PID: ${result.pid}`, 'success');
      showToast('游戏已启动', `Minecraft ${versionId} (${username})`, 'success', 'game-started');
    } else if (result.cancelled) {
      
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
  } catch (err: any) {
    if (welcomeAnimPlaying && window.gpcl && window.gpcl.dismissStartupAnimation) {
      window.gpcl.dismissStartupAnimation();
    }
    hideLaunchAnimation();
    setStatus('启动出错', 'error');
    showToast('启动出错', err.message, 'error', 'launch-error');
  } finally {
    if (launchBtnEl) (launchBtnEl as HTMLButtonElement).disabled = false;
  }
}

async function showLaunchAnimation(versionId: string): Promise<void> {
  try {
    const overlay: HTMLElement | null = document.getElementById('launch-animation-overlay');
    const statusText: HTMLElement | null = document.getElementById('launch-status-text');
    const versionInfo: HTMLElement | null = document.getElementById('launch-version-info');
    const progressFill: HTMLElement | null = document.getElementById('launch-progress-fill');
    
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

    let displayName: string = versionId;
    if (window.gpcl && typeof window.gpcl.getLaunchDisplayName === 'function') {
      try {
        displayName = await window.gpcl.getLaunchDisplayName(versionId);
      } catch (e: any) {
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
  } catch (err: any) {
    setStatus('[动画] 显示启动动画失败: ' + err.message, 'error');
  }
}

const launchTips: string[] = [
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

function showRandomTip(): void {
  const tipText: HTMLElement | null = document.getElementById('launch-tip-text');
  if (!tipText) return;
  
  const randomIndex: number = Math.floor(Math.random() * launchTips.length);
  tipText.textContent = launchTips[randomIndex];
}

function simulateLaunchProgress(): void {
  const progressFill: HTMLElement | null = document.getElementById('launch-progress-fill');
  const statusText: HTMLElement | null = document.getElementById('launch-status-text');
  
  let progress: number = 0;
  const statusMessages: string[] = [
    '正在检查游戏文件...',
    '正在准备Java运行时...',
    '正在初始化游戏环境...',
    '正在启动游戏窗口...'
  ];
  
  const interval: ReturnType<typeof setInterval> = setInterval(() => {
    
    progress += Math.random() * 15 + 5;
    
    if (progress >= 90) {
      progress = 90;
    }
    
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }

    const messageIndex: number = Math.floor(progress / 25);
    if (statusText && messageIndex < statusMessages.length) {
      statusText.textContent = statusMessages[messageIndex];
    }
  }, 200);

  window.launchProgressInterval = interval;
}

let gameWindowResolve: (() => void) | null = null;
let gameWindowTimeout: ReturnType<typeof setTimeout> | null = null;

function setupGameWindowListener(): void {
  
  if (window.gpcl && window.gpcl.removeAllListeners) {
    window.gpcl.removeAllListeners();
  }

  if (window.gpcl && window.gpcl.onConfirmCloseWhileDownloading) {
    window.gpcl.onConfirmCloseWhileDownloading(async (): Promise<void> => {
      const result: boolean = await showDialog({
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

  if (window.gpcl && window.gpcl.onGameWindowCreated) {
    window.gpcl.onGameWindowCreated((data: any): void => {
      setStatus('[动画] 收到游戏窗口创建事件');
      if (gameWindowResolve) {
        if (gameWindowTimeout) clearTimeout(gameWindowTimeout);
        gameWindowResolve();
        gameWindowResolve = null;
        gameWindowTimeout = null;
      }
    });
    setStatus('[动画] 游戏窗口监听器已设置');
  }
}

function waitForGameWindow(): Promise<void> {
  return new Promise((resolve) => {
    gameWindowResolve = resolve;
    
    gameWindowTimeout = setTimeout(() => {
      setStatus('[动画] 窗口检测超时');
      gameWindowResolve = null;
      gameWindowTimeout = null;
      resolve();
    }, 10000); 
  });
}

function showLaunchSuccess(): void {
  try {
    const overlay: HTMLElement | null = document.getElementById('launch-animation-overlay');
    const pickaxe: HTMLElement | null = document.getElementById('pickaxe');
    const block: HTMLElement | null = document.getElementById('block');
    
    if (overlay) {
      overlay.classList.add('launch-success');
      setStatus('[动画] 显示成功动画');
    }
    
    if (block) {
      block.classList.add('breaking');
    }

    createParticles();
  } catch (err: any) {
    setStatus('[动画] 显示成功动画失败: ' + err.message, 'error');
  }
}

function createParticles(): void {
  const particlesContainer: HTMLElement | null = document.getElementById('particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';

  for (let i = 0; i < 12; i++) {
    const particle: HTMLDivElement = document.createElement('div');
    particle.className = 'particle';

    const angle: number = (Math.PI * 2 * i) / 12;
    const distance: number = 50 + Math.random() * 50;
    particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);

    particle.style.width = `${4 + Math.random() * 8}px`;
    particle.style.height = particle.style.width;
    particle.style.animationDelay = `${Math.random() * 0.2}s`;
    
    particlesContainer.appendChild(particle);
  }
}

function hideLaunchAnimation(): void {
  try {
    const overlay: HTMLElement | null = document.getElementById('launch-animation-overlay');
    
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

    if (window.launchProgressInterval) {
      clearInterval(window.launchProgressInterval);
      window.launchProgressInterval = null;
    }
  } catch (err: any) {
    setStatus('[动画] 隐藏启动动画失败: ' + err.message, 'error');
  }
}

async function startDownload(versionId: string): Promise<void> {
  if (!versionId) { setStatus('请先选择要下载的版本', 'error'); return; }

  const installed: boolean = await isVersionInstalled(versionId);

  let selectedModLoader: string | null = null;
  let selectedModLoaderVersion: string | null = null;
  let modLoaderName: string = '';
  
  for (const [loader, state] of Object.entries(modLoaderState) as [string, any][]) {
    if (state.selectedVersionId) {
      selectedModLoader = loader;
      selectedModLoaderVersion = state.selectedVersionId;
      modLoaderName = getLoaderDisplayName(loader);
      break;
    }
  }

  if (detailDownloadBtn) detailDownloadBtn.disabled = true;
  await loadChartJs();
  initChart();
  resetChart();

  if (downloadPanel) downloadPanel.classList.remove('hidden');
  
  hideVersionDetail();
  showPage('download');

  const scrollContainer: HTMLElement | null = document.querySelector('.main-content') as HTMLElement | null;
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');
  const filenameEl: HTMLElement | null = document.getElementById('download-filename');
  const cancelBtn: HTMLElement | null = document.getElementById('cancel-download-btn');

  if (cancelBtn) {
    cancelBtn.textContent = '取消下载';
    cancelBtn.classList.remove('complete');
    (cancelBtn as HTMLButtonElement).disabled = false;
  }

  let displayName: string = `Minecraft ${versionId}`;
  if (selectedModLoader) {
    displayName = `${modLoaderName} ${versionId}`;
  }

  if (downloadStatusEl) downloadStatusEl.textContent = `开始下载 ${displayName} ...`;
  if (filenameEl) filenameEl.textContent = `正在下载: ${displayName}`;

  window.gpcl.removeAllListeners();

  window.gpcl.onConfirmCloseWhileDownloading(async (): Promise<void> => {
    const result: boolean = await showDialog({
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

  let lastTime: number = Date.now();
  let lastBytes: number = 0;
  let lastLabel: string = '';

  window.gpcl.onDownloadProgress((data: any): void => {
    const currentTime: number = Date.now();
    const timeDiff: number = (currentTime - lastTime) / 1000;

    const currentSpeedEl: HTMLElement | null = document.getElementById('current-speed');
    const peakSpeedEl: HTMLElement | null = document.getElementById('peak-speed');
    const progressFillEl: HTMLElement | null = document.getElementById('progress-fill');
    const progressTextEl: HTMLElement | null = document.getElementById('progress-text');

    if (data.label && data.label !== lastLabel) {
      lastLabel = data.label;
      lastBytes = 0;
      lastTime = currentTime;
    }

    if (timeDiff >= 0.5 && data.bytesDownloaded !== undefined) {
      const bytesDiff: number = data.bytesDownloaded - lastBytes;
      if (bytesDiff < 0) {
        lastBytes = data.bytesDownloaded;
        lastTime = currentTime;
        return;
      }
      const speedBps: number = Math.max(0, (bytesDiff * 8) / timeDiff / 1000000);

      if (currentSpeedEl) currentSpeedEl.textContent = speedBps.toFixed(2) + ' Mbps';

      if (speedBps > peakSpeed) {
        peakSpeed = speedBps;
        if (peakSpeedEl) peakSpeedEl.textContent = peakSpeed.toFixed(2) + ' Mbps';
      }

      updateChart(speedBps);

      lastTime = currentTime;
      lastBytes = data.bytesDownloaded;
    }

    const percent: number = data.percent || 0;
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
    const maxConcurrent: number = getMaxConcurrentFromSettings();
    let result: any;
    
    if (selectedModLoader) {
      
      result = await window.gpcl.downloadWithModLoader(
        versionId, 
        selectedModLoader, 
        selectedModLoaderVersion,
        maxConcurrent
      );
    } else {
      
      result = await window.gpcl.downloadVersion(versionId, maxConcurrent);
    }
    
    if (result.success) {
      
      await recordVersionDownload(result.finalVersionId || versionId);
      
      const finalDisplayName: string = selectedModLoader 
        ? `${modLoaderName} ${versionId}` 
        : `Minecraft ${versionId}`;
      
      setStatus('下载完成', 'success');
      if (downloadStatusEl) downloadStatusEl.textContent = `下载完成: ${finalDisplayName}`;
      const progressFillEl: HTMLElement | null = document.getElementById('progress-fill');
      const progressTextEl: HTMLElement | null = document.getElementById('progress-text');
      if (progressFillEl) progressFillEl.style.width = '100%';
      if (progressTextEl) progressTextEl.textContent = '100%';
      showToast('下载完成', `${finalDisplayName} 已准备就绪`, 'success', 'download-complete');
      await loadVersions();
      
      renderVersionSelectList();
      
      if (cancelBtn) {
        cancelBtn.textContent = '下载完成';
        cancelBtn.classList.add('complete');
        (cancelBtn as HTMLButtonElement).disabled = true;
      }
    } else {
      setStatus(`下载失败: ${result.error}`, 'error');
      if (downloadStatusEl) downloadStatusEl.textContent = `下载失败: ${result.error}`;
    }
  } catch (err: any) {
    setStatus('下载出错', 'error');
    if (downloadStatusEl) downloadStatusEl.textContent = `下载出错: ${err.message || err}`;
    showToast('下载出错', err.message || String(err), 'error', 'download-error');
  }

  if (detailDownloadBtn) detailDownloadBtn.disabled = false;
}

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

if (window.gpcl && window.gpcl.onGameClosed) {
  window.gpcl.onGameClosed((code: number): void => {
    setStatus('游戏已退出');
    showToast('游戏已退出', `退出码: ${code}`, 'info', 'game-closed');
    if (launchBtn) (launchBtn as HTMLButtonElement).disabled = false;
  });
}

if (window.gpcl && window.gpcl.onGameError) {
  window.gpcl.onGameError((message: string): void => {
    setStatus(`启动出错: ${message}`, 'error');
    showToast('游戏错误', message, 'error', 'game-error');
    if (launchBtn) (launchBtn as HTMLButtonElement).disabled = false;
  });
}

if (launchBtn) launchBtn.addEventListener('click', launchGame);

(async function init(): Promise<void> {
  setStatus('正在加载...');
  initTheme();
  initScale();
  if (menuLaunch) menuLaunch.classList.add('active');

  if (usernameInput && window.gpcl && window.gpcl.getPlayerName) {
    const savedName: string = await window.gpcl.getPlayerName();
    if (savedName) usernameInput.value = savedName;
  }

  await loadVersions();
  await loadRemoteVersions();

  await renderVersionSelectList();

  await initJavaVersionStatus();
  bindJavaInstallButtons();

  bindModLoaderEvents();

  setInterval(async (): Promise<void> => {
    
    if (currentPage === 'launch') {
      await loadVersions(true);
      await renderVersionSelectList();
    }

    if (currentPage === 'download') {
      await refreshJavaStatus();
    }
  }, 2000);

  async function refreshJavaStatus(): Promise<void> {
    const javaVersions: string[] = ["8", "17", "21", "25"];
    
    for (const ver of javaVersions) {
      try {
        const result = await window.gpcl.checkJava(ver);
        const card: HTMLElement | null = document.querySelector(`.java-version-card[data-version="${ver}"]`) as HTMLElement | null;
        const badge: HTMLElement | null = document.getElementById(`java-${ver}-status`);
        const btn: HTMLElement | null = card?.querySelector('.java-install-btn') as HTMLElement | null;
        
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
              (btn as HTMLButtonElement).disabled = false;
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
              (btn as HTMLButtonElement).disabled = false;
            }
          }
        }
      } catch (e: any) {
        console.error(`检查Java ${ver} 状态失败`, e);
      }
    }
    
    updateJavaInstallStatus();
  }

  const refreshBtn: HTMLElement | null = document.getElementById('refresh-btn-page');
  if (refreshBtn) refreshBtn.addEventListener('click', async (): Promise<void> => {
    setStatus('重试加载远程版本...');
    await loadRemoteVersions();
    
    await refreshJavaStatus();
    setStatus('准备就绪');
  });

  if (cancelDownloadBtn) cancelDownloadBtn.addEventListener('click', async (): Promise<void> => {
    if (isUpdateDownloadActive) return;

    const result: boolean = await showDialog({
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

  if (window.gpcl && window.gpcl.focusWindow) {
    setTimeout(() => {
      window.gpcl.focusWindow();
    }, 100);
  }

  const launchCancelBtn: HTMLElement | null = document.getElementById('launch-cancel-btn');
  if (launchCancelBtn) {
    launchCancelBtn.addEventListener('click', () => {
      setStatus('[动画] 用户取消启动');
      if (window.gpcl && window.gpcl.cancelLaunch) {
        window.gpcl.cancelLaunch();
      }
      hideLaunchAnimation();
    });
  }

  checkForUpdates(true);

  const checkUpdateBtn: HTMLElement | null = document.getElementById('check-update-btn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', async (): Promise<void> => {
      checkUpdateBtn.disabled = true;
      checkUpdateBtn.textContent = '检查中...';
      
      await checkForUpdates(false);
      
      const updateStatus: HTMLElement | null = document.getElementById('update-status');
      const goDownloadBtnEl: HTMLElement | null = document.getElementById('go-download-btn');
      
      if (updateAvailable) {
        const newest = allNewerVersions[allNewerVersions.length - 1];
        checkUpdateBtn.textContent = `发现 ${allNewerVersions.length} 个新版本`;
        checkUpdateBtn.classList.add('new-version');
        
        if (updateStatus) {
          updateStatus.innerHTML = `<div class="update-log-title">发现 ${allNewerVersions.length} 个新版本！</div>${renderUpdateVersionCards(allNewerVersions)}`;
          updateStatus.classList.add('show', 'has-update');
        }
        
        if (goDownloadBtnEl) {
          goDownloadBtnEl.classList.remove('hidden');
        }
        const openWebsiteBtn: HTMLElement | null = document.getElementById('open-website-btn');
        if (openWebsiteBtn) {
          openWebsiteBtn.classList.remove('hidden');
        }
      } else {
        checkUpdateBtn.textContent = '已是最新版本';
        checkUpdateBtn.classList.remove('new-version');
        
        if (updateStatus) {
          updateStatus.innerHTML = '当前已是最新版本';
          updateStatus.classList.add('show');
          updateStatus.classList.remove('has-update');
        }
        
        if (goDownloadBtnEl) {
          goDownloadBtnEl.classList.add('hidden');
        }
        const openWebsiteBtn2: HTMLElement | null = document.getElementById('open-website-btn');
        if (openWebsiteBtn2) {
          openWebsiteBtn2.classList.add('hidden');
        }
      }
      
      checkUpdateBtn.disabled = false;
    });
  }

  const goDownloadBtn: HTMLElement | null = document.getElementById('go-download-btn');

  const autoCheckUpdateEl: HTMLInputElement | null = document.getElementById('auto-check-update') as HTMLInputElement | null;

  const preventMultipleLaunchEl: HTMLInputElement | null = document.getElementById('prevent-multiple-launch') as HTMLInputElement | null;

  const autoClearLogsEl: HTMLInputElement | null = document.getElementById('auto-clear-logs') as HTMLInputElement | null;
  const logRetentionContainerEl: HTMLElement | null = document.getElementById('log-retention-container');
  const logRetentionValueEl: HTMLInputElement | null = document.getElementById('log-retention-value') as HTMLInputElement | null;
  const logRetentionUnitEl: HTMLElement | null = document.getElementById('log-retention-unit');

  const aboutVersion: HTMLElement | null = document.getElementById('about-version');
  
  const customMirrorContainerEl: HTMLElement | null = document.getElementById('custom-java-mirror-container');
  const customMirrorUrlEl: HTMLInputElement | null = document.getElementById('custom-java-mirror-url') as HTMLInputElement | null;

  initCustomSelect('settings-memory', async (value: string): Promise<void> => {
    const settings = await loadSettings();
    settings.game.memory = value;
    await gpcl.saveSettings(settings);
  });

  initCustomSelect('settings-window-mode', async (value: string): Promise<void> => {
    const settings = await loadSettings();
    if (!settings.game) settings.game = {} as any;
    settings.game.windowMode = value;
    await gpcl.saveSettings(settings);
  });

  initCustomSelect('settings-theme', async (value: string): Promise<void> => {
    const settings = await loadSettings();
    if (!settings.appearance) settings.appearance = {} as any;
    settings.appearance.theme = value;
    await gpcl.saveSettings(settings);
    applyTheme(value);
  });

  initCustomSelect('settings-scale', async (value: string): Promise<void> => {
    const settings = await loadSettings();
    if (!settings.appearance) settings.appearance = {} as any;
    settings.appearance.scale = value;
    await gpcl.saveSettings(settings);
    applyScale(value);
  });

  initCustomSelect('java-mirror-select', async (value: string): Promise<void> => {
    if (customMirrorContainerEl) {
      customMirrorContainerEl.classList.toggle('hidden', value !== 'custom');
    }
    await saveJavaMirrorSettings(value, customMirrorUrlEl?.value || '');
  });

  initCustomSelect('log-retention-unit', async (unit: string): Promise<void> => {
    
    const maxValues: Record<string, number> = {
      hour: 23,
      day: 30,
      month: 11,
      year: 10
    };
    
    if (logRetentionValueEl) {
      let value: number = parseInt(logRetentionValueEl.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > maxValues[unit]) {
        value = maxValues[unit];
        logRetentionValueEl.value = String(value);
      }
    }
    
    const settings = await loadSettings();
    settings.advanced.logRetentionUnit = unit;
    if (logRetentionValueEl) {
      settings.advanced.logRetentionValue = parseInt(logRetentionValueEl.value, 10);
    }
    await gpcl.saveSettings(settings);
  });

  if (goDownloadBtn) {
    goDownloadBtn.addEventListener('click', async (): Promise<void> => {
      if (updateAvailable && allNewerVersions.length > 0) {
        showPage('download');
        const newest = allNewerVersions[allNewerVersions.length - 1];
        await startUpdateDownload(newest.version);
      }
    });
  }

  const openWebsiteBtnEl: HTMLElement | null = document.getElementById('open-website-btn');
  if (openWebsiteBtnEl) {
    openWebsiteBtnEl.addEventListener('click', () => {
      if (window.gpcl && window.gpcl.openExternal) {
        window.gpcl.openExternal('https://gamets.caellab.com/gpcl/');
      }
    });
  }

  if (autoCheckUpdateEl) {
    
    (async (): Promise<void> => {
      const settings = await loadSettings();
      autoCheckUpdateEl.checked = settings.advanced?.autoCheckUpdate !== false;
    })();
    
    autoCheckUpdateEl.addEventListener('change', async (): Promise<void> => {
      const settings = await loadSettings();
      settings.advanced.autoCheckUpdate = autoCheckUpdateEl.checked;
      await gpcl.saveSettings(settings);
      updateSettingsBadge();
    });
  }

  if (preventMultipleLaunchEl) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      preventMultipleLaunchEl.checked = settings.advanced?.preventMultipleLaunch !== false;
    })();

    preventMultipleLaunchEl.addEventListener('change', async (): Promise<void> => {
      const settings = await loadSettings();
      settings.advanced.preventMultipleLaunch = preventMultipleLaunchEl.checked;
      await gpcl.saveSettings(settings);
    });
  }

  const playStartupAnimation: HTMLInputElement | null = document.getElementById('play-startup-animation') as HTMLInputElement | null;
  if (playStartupAnimation) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      playStartupAnimation.checked = settings.appearance?.playStartupAnimation === true;
    })();

    playStartupAnimation.addEventListener('change', async (): Promise<void> => {
      const settings = await loadSettings();
      if (!settings.appearance) settings.appearance = {} as any;
      settings.appearance.playStartupAnimation = playStartupAnimation.checked;
      await gpcl.saveSettings(settings);
    });
  }

  const skipSplash: HTMLInputElement | null = document.getElementById('skip-splash') as HTMLInputElement | null;
  if (skipSplash) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      skipSplash.checked = settings.appearance?.skipSplash === true;
    })();

    skipSplash.addEventListener('change', async (): Promise<void> => {
      const settings = await loadSettings();
      if (!settings.appearance) settings.appearance = {} as any;
      settings.appearance.skipSplash = skipSplash.checked;
      await gpcl.saveSettings(settings);
    });
  }

  const developerMode: HTMLInputElement | null = document.getElementById('developer-mode') as HTMLInputElement | null;
  if (developerMode) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      developerMode.checked = settings.advanced?.developerMode === true;
    })();

    developerMode.addEventListener('change', async (): Promise<void> => {
      if (developerMode.checked) {
        const confirmed: boolean = await showDialog({
          type: 'confirm',
          title: '确认开启开发者模式',
          message: '确认要开启吗？开启后需要重启 GPCL 才能生效。开启开发者模式后将允许打开 DevTools、右键菜单及刷新页面。'
        });
        
        if (confirmed) {
          const settings = await loadSettings();
          settings.advanced.developerMode = true;
          await gpcl.saveSettings(settings);
          
          if (window.gpcl && window.gpcl.restartApp) {
            await window.gpcl.restartApp();
          } else {
            showToast('重启失败', '无法自动重启，请手动重启应用', 'error');
            developerMode.checked = false;
          }
        } else {
          developerMode.checked = false;
        }
      } else {
        const settings = await loadSettings();
        settings.advanced.developerMode = false;
        await gpcl.saveSettings(settings);
        if (window.gpcl && window.gpcl.setDeveloperMode) {
          await window.gpcl.setDeveloperMode(false);
        }
      }
    });
  }

  if (autoClearLogsEl) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      autoClearLogsEl.checked = settings.advanced?.autoClearLogs !== false;
    })();

    autoClearLogsEl.addEventListener('change', async (): Promise<void> => {
      const settings = await loadSettings();
      settings.advanced.autoClearLogs = autoClearLogsEl.checked;
      await gpcl.saveSettings(settings);
      
      if (logRetentionContainerEl) {
        logRetentionContainerEl.classList.toggle('hidden', !autoClearLogsEl.checked);
      }
    });
  }

  if (logRetentionValueEl) {
    (async (): Promise<void> => {
      const settings = await loadSettings();
      logRetentionValueEl.value = String(settings.advanced?.logRetentionValue || 7);
    })();

    logRetentionValueEl.addEventListener('change', async (): Promise<void> => {
      let value: number = parseInt(logRetentionValueEl.value, 10);
      const unit: string = getCustomSelectValue('log-retention-unit') || 'day';

      const maxValues: Record<string, number> = {
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
      
      logRetentionValueEl.value = String(value);
      
      const settings = await loadSettings();
      settings.advanced.logRetentionValue = value;
      await gpcl.saveSettings(settings);
    });
  }

  if (aboutVersion) {
    const version: string = await getCurrentVersion();
    aboutVersion.textContent = `版本: ${version}`;
  }

  if (customMirrorUrlEl) {
    customMirrorUrlEl.addEventListener('input', async (): Promise<void> => {
      await saveJavaMirrorSettings(getCustomSelectValue('java-mirror-select') || 'tsinghua', customMirrorUrlEl.value);
    });
  }

  (async (): Promise<void> => {
    const settings = await loadSettings();

    let memoryValue: string = '2'; 
    if (settings.game?.memory) {
      const storedMemory: string = String(settings.game.memory);
      if (storedMemory.includes('096')) {
        
        const mb: number = parseInt(storedMemory);
        if (!isNaN(mb)) {
          memoryValue = String(mb / 1024);
        }
      } else {
        memoryValue = storedMemory;
      }
    }
    setCustomSelectValue('settings-memory', memoryValue);

    setCustomSelectValue('settings-window-mode', settings.game?.windowMode || 'windowed');

    const theme: string = settings.appearance?.theme || 'dark';
    setCustomSelectValue('settings-theme', theme);
    applyTheme(theme);

    const scale: string = settings.appearance?.scale || '100';
    setCustomSelectValue('settings-scale', scale);
    applyScale(scale);

    const playStartupAnimSync: HTMLInputElement | null = document.getElementById('play-startup-animation') as HTMLInputElement | null;
    if (playStartupAnimSync) {
      playStartupAnimSync.checked = settings.appearance?.playStartupAnimation === true;
    }

    const skipSplashSync: HTMLInputElement | null = document.getElementById('skip-splash') as HTMLInputElement | null;
    if (skipSplashSync) {
      skipSplashSync.checked = settings.appearance?.skipSplash === true;
    }

    const javaMirror: string = settings.download?.javaMirror || 'tsinghua';
    setCustomSelectValue('java-mirror-select', javaMirror);
    if (customMirrorContainerEl) {
      customMirrorContainerEl.classList.toggle('hidden', javaMirror !== 'custom');
    }
    if (customMirrorUrlEl && settings.download?.customJavaMirror) {
      customMirrorUrlEl.value = settings.download.customJavaMirror;
    }

    setCustomSelectValue('log-retention-unit', settings.advanced?.logRetentionUnit || 'day');
  })();

  (async (): Promise<void> => {
    const resetDefaultToggle: HTMLInputElement | null = document.getElementById('settings-reset-default') as HTMLInputElement | null;
    
    if (resetDefaultToggle) {
      resetDefaultToggle.checked = false; 
      
      resetDefaultToggle.addEventListener('change', async function(this: HTMLInputElement): Promise<void> {
        if (this.checked) {
          
          const confirmed: boolean = await showDialog({
            type: 'confirm',
            title: '恢复默认设置',
            message: '确定要将所有设置恢复为默认值吗？\n\n此操作会重启启动器。'
          });
          
          if (confirmed) {
            
            if (window.gpcl && window.gpcl.resetSettings) {
              const result = await window.gpcl.resetSettings();
              if (result.success) {
                
                if (window.gpcl && window.gpcl.restartApp) {
                  await window.gpcl.restartApp();
                }
              }
            }
          } else {
            
            this.checked = false;
          }
        }
      });
    }
  })();

  const settingsSidebarItems: NodeListOf<Element> = document.querySelectorAll('.settings-sidebar-item');
  settingsSidebarItems.forEach((item: Element) => {
    item.addEventListener('click', () => {
      const tabName: string | undefined = (item as HTMLElement).dataset.tab;
      if (tabName) {
        switchSettingsTab(tabName);
      }
    });
  });

  let currentVersionForSettings: string | null = null;
  
  const versionSettingsBtn: HTMLElement | null = document.getElementById('version-settings');
  const versionSettingsPanel: HTMLElement | null = document.getElementById('version-settings-panel');
  const versionSettingsBackBtn: HTMLElement | null = document.getElementById('version-settings-back-btn');
  const versionSettingsTitle: HTMLElement | null = document.getElementById('version-settings-title');
  const versionDeleteEnable: HTMLInputElement | null = document.getElementById('version-delete-enable') as HTMLInputElement | null;
  const versionServerIpContainer: HTMLElement | null = document.getElementById('version-server-ip-container');
  const versionServerIpInput: HTMLInputElement | null = document.getElementById('version-server-ip') as HTMLInputElement | null;
  const versionSelectPanel: HTMLElement | null = document.getElementById('version-select-panel');
  const statusElement: HTMLElement | null = document.getElementById('status');
  
  async function getVersionSettings(versionId: string): Promise<any> {
    try {
      if (window.gpcl && window.gpcl.getVersionSettings) {
        const result = await window.gpcl.getVersionSettings(versionId);
        if (result.success && result.settings) {
          return result.settings;
        }
      }
    } catch (e: any) {
      console.error('获取版本设置失败:', e);
    }
    return {};
  }
  
  async function saveVersionSettings(versionId: string, settings: any): Promise<boolean> {
    try {
      if (window.gpcl && window.gpcl.saveVersionSettings) {
        const result = await window.gpcl.saveVersionSettings(versionId, settings);
        return result.success;
      }
    } catch (e: any) {
      console.error('保存版本设置失败:', e);
    }
    return false;
  }

  function updateServerIpVisibility(): void {
    const startupMode: string | null = getCustomSelectValue('version-startup-mode');
    if (startupMode === 'join') {
      if (versionServerIpContainer) versionServerIpContainer.classList.add('visible');
    } else {
      if (versionServerIpContainer) versionServerIpContainer.classList.remove('visible');
    }
  }
  
  async function loadVersionSettingsToUI(versionId: string): Promise<void> {
    const settings = await getVersionSettings(versionId);
    
    if (versionDeleteEnable) versionDeleteEnable.checked = false;
    setCustomSelectValue('version-memory', settings.memory || 'global');
    setCustomSelectValue('version-window-mode', settings.windowMode || 'global');
    setCustomSelectValue('version-startup-mode', settings.startupMode || 'default');
    if (versionServerIpInput) versionServerIpInput.value = settings.serverIp || '';
    
    updateServerIpVisibility();
  }
  
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  function saveCurrentVersionSettings(): void {
    if (!currentVersionForSettings) return;
    
    const settings = {
      memory: getCustomSelectValue('version-memory') || 'global',
      windowMode: getCustomSelectValue('version-window-mode') || 'global',
      startupMode: getCustomSelectValue('version-startup-mode') || 'default',
      serverIp: versionServerIpInput?.value || ''
    };
    
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async (): Promise<void> => {
      const success: boolean = await saveVersionSettings(currentVersionForSettings!, settings);
      if (success) {
        showToast('保存成功', `版本 ${currentVersionForSettings} 的设置已保存`, 'success');
      } else {
        showToast('保存失败', '无法保存版本设置', 'error');
      }
    }, 300);
  }
  
  async function showVersionSettingsPanel(versionId: string): Promise<void> {
    if (!versionSettingsPanel) return;
    
    currentVersionForSettings = versionId;
    if (versionSettingsTitle) versionSettingsTitle.textContent = `版本设置 - ${versionId}`;
    
    if (versionSelectPanel) versionSelectPanel.classList.add('hidden');
    if (statusElement) statusElement.style.display = 'none';
    
    versionSettingsPanel.classList.remove('hidden');
    versionSettingsPanel.classList.remove('slide-out');
    
    await loadVersionSettingsToUI(versionId);
  }
  
  async function hideVersionSettingsPanel(): Promise<void> {
    if (!versionSettingsPanel) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    if (currentVersionForSettings) {
      const settings = {
        memory: getCustomSelectValue('version-memory') || 'global',
        windowMode: getCustomSelectValue('version-window-mode') || 'global',
        startupMode: getCustomSelectValue('version-startup-mode') || 'default',
        serverIp: versionServerIpInput?.value || ''
      };
      await saveVersionSettings(currentVersionForSettings, settings);
    }
    
    versionSettingsPanel.classList.add('slide-out');
    
    setTimeout(() => {
      if (versionSettingsPanel) {
        versionSettingsPanel.classList.add('hidden');
        versionSettingsPanel.classList.remove('slide-out');
      }
      if (statusElement) statusElement.style.display = '';
      currentVersionForSettings = null;
    }, 300);
  }
  
  if (versionSettingsBtn) {
    versionSettingsBtn.addEventListener('click', async (): Promise<void> => {
      if (selectedVersionId) {
        
        if (versionSelectPanel && !versionSelectPanel.classList.contains('hidden')) {
          versionSelectPanel.classList.add('hidden');
        }
        await showVersionSettingsPanel(selectedVersionId);
      } else {
        showToast('未选择版本', '请先选择一个版本', 'warning');
      }
    });
  }
  
  if (versionSettingsBackBtn) {
    versionSettingsBackBtn.addEventListener('click', async (): Promise<void> => {
      await hideVersionSettingsPanel();
    });
  }
  
  if (versionDeleteEnable) {
    versionDeleteEnable.addEventListener('change', async function(this: HTMLInputElement): Promise<void> {
      if (this.checked) {
        const confirmed: boolean = await showDialog({
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
            } catch (e: any) {
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

  const versionOpenModsBtn: HTMLElement | null = document.getElementById('version-open-mods-btn');
  if (versionOpenModsBtn) {
    versionOpenModsBtn.addEventListener('click', async (): Promise<void> => {
      if (currentVersionForSettings && window.gpcl && window.gpcl.getGameDir) {
        const gameDir: string = await window.gpcl.getGameDir();
        if (gameDir) {
          const modsPath: string = gameDir + '\\versions\\' + currentVersionForSettings + '\\mods';
          window.gpcl.openFolder(modsPath);
        }
      }
    });
  }

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

  if (versionServerIpInput) {
    versionServerIpInput.addEventListener('input', () => {
      saveCurrentVersionSettings();
    });
  }

  const versionSelectBtn: HTMLElement | null = document.getElementById('version-select');
  const versionPanel: HTMLElement | null = document.getElementById('version-select-panel');
  if (versionSelectBtn && versionPanel) {
    versionSelectBtn.addEventListener('click', () => {
      
      if (versionSettingsPanel && !versionSettingsPanel.classList.contains('hidden')) {
        return;
      }

      if (versionPanel.classList.contains('hidden')) {
        versionPanel.classList.remove('hidden');
        renderVersionSelectList();
      } else {
        versionPanel.classList.add('hidden');
      }
    });
  }

  const authMicrosoftBtn: HTMLElement | null = document.getElementById('auth-microsoft');
  const authOfflineBtn: HTMLElement | null = document.getElementById('auth-offline');

  // 全局监听微软认证结果（只注册一次）
  if (window.gpcl && window.gpcl.onMicrosoftAuthResult) {
    window.gpcl.onMicrosoftAuthResult((result: any) => {
      if (result.status === 'success') {
        msAuthData = {
          uuid: result.uuid,
          username: result.username,
          accessToken: result.accessToken
        };
        authMicrosoftBtn?.classList.add('auth-tab-active');
        authOfflineBtn?.classList.remove('auth-tab-active');
        if (usernameInput) {
          usernameInput.value = result.username;
          usernameInput.disabled = true;
        }
        showToast('登录成功', `欢迎回来，${result.username}！`, 'success');
      } else if (result.status === 'timeout') {
        showToast('登录超时', '登录超时，请重试', 'error');
      } else if (result.status === 'error') {
        showToast('登录失败', result.message || '微软登录失败', 'error');
      }
    });
  }

  if (authMicrosoftBtn) {
    // 启用正版按钮
    authMicrosoftBtn.removeAttribute('disabled');
    authMicrosoftBtn.classList.remove('auth-tab-disabled');

    authMicrosoftBtn.addEventListener('click', async () => {
      if (msAuthData) {
        // 已登录 -> 登出
        msAuthData = null;
        authMicrosoftBtn.classList.remove('auth-tab-active');
        authOfflineBtn?.classList.add('auth-tab-active');
        if (usernameInput) {
          const savedName: string = await window.gpcl.getPlayerName();
          usernameInput.value = savedName || 'GPCL_Player';
          usernameInput.disabled = false;
        }
        showToast('已登出', '已切换到离线模式', 'info');
        return;
      }

      showToast('正版登录', '正在打开浏览器进行微软登录...', 'info');

      // 启动认证
      if (window.gpcl && window.gpcl.startMicrosoftAuth) {
        await window.gpcl.startMicrosoftAuth();
      }
    });
  }

  if (authOfflineBtn) {
    authOfflineBtn.addEventListener('click', () => {
      if (msAuthData) {
        showToast('提示', '请先点击正版按钮登出', 'warning');
        return;
      }
      authOfflineBtn.classList.add('auth-tab-active');
      authMicrosoftBtn?.classList.remove('auth-tab-active');
      if (usernameInput) {
        usernameInput.disabled = false;
        window.gpcl.getPlayerName().then((name: string) => {
          usernameInput.value = name || 'GPCL_Player';
        });
      }
    });
  }
})();

let latestVersion: string | null = null;
let latestVersionLog: string | null = null;
let updateAvailable: boolean = false;
let allNewerVersions: any[] = [];

async function getCurrentVersion(): Promise<string> {
  try {
    if (window.gpcl && window.gpcl.getAppVersion) {
      return await window.gpcl.getAppVersion();
    }
  } catch (e: any) {}
  return '1.0.0';
}

function compareVersions(current: string, latest: string): number {
  const currentParts: number[] = current.split('.').map(Number);
  const latestParts: number[] = latest.split('.').map(Number);
  
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c: number = currentParts[i] || 0;
    const l: number = latestParts[i] || 0;
    if (l > c) return 1;
    if (c > l) return -1;
  }
  return 0;
}

function parseLauncherVersions(launcherData: any[]): { version: string; title: string; log: string }[] {
  const versions: { version: string; title: string; log: string }[] = [];
  let current: { version: string; title: string; log: string } | null = null;

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

function renderUpdateVersionCards(newerVersions: any[]): string {
  if (!newerVersions || newerVersions.length === 0) return '';

  const cards: string = newerVersions.map((v: any, index: number) => {
    const isNewest: boolean = index === newerVersions.length - 1;
    const titleHtml: string = v.title ? `<div class="update-card-title">${v.title}</div>` : '';
    const logHtml: string = v.log ? `<div class="update-card-log">${v.log}</div>` : '';
    return `<div class="update-version-card ${isNewest ? 'newest' : ''}">` +
      `<div class="update-card-header"><span class="update-card-version">${v.version}</span>` +
      `${isNewest ? '<span class="update-card-badge">最新</span>' : ''}</div>` +
      `${titleHtml}${logHtml}</div>`;
  }).reverse().join('');

  return `<div class="update-versions-list">${cards}</div>`;
}

async function checkForUpdates(silent: boolean = false): Promise<void> {
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
    
    const currentVersion: string = await getCurrentVersion();
    setStatus(`[版本检查] 当前版本: ${currentVersion}, 最新版本: ${latestVersion}`);
    
    allNewerVersions = parsedVersions
      .filter((v: any) => compareVersions(currentVersion, v.version) > 0)
      .sort((a: any, b: any) => compareVersions(b.version, a.version));
    
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
      const titlePart: string = newest.title ? ` "${newest.title}"` : '';
      showToast('发现新版本', `GPCL ${newest.version}${titlePart} 已发布`, 'warning', 'update-available');
    }
    
    await updateSettingsBadge();
    
  } catch (e: any) {
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

// ===== 应用内更新下载 =====

async function startUpdateDownload(version: string): Promise<void> {
  if (!window.gpcl || !window.gpcl.downloadUpdate) {
    showToast('更新失败', '更新功能不可用', 'error');
    return;
  }

  isUpdateDownloadActive = true;

  await loadChartJs();
  initChart();
  resetChart();

  const downloadPanelEl: HTMLElement | null = document.getElementById('download-panel');
  const filenameEl: HTMLElement | null = document.getElementById('download-filename');
  const downloadStatusEl: HTMLElement | null = document.getElementById('download-status');
  const progressFill: HTMLElement | null = document.getElementById('progress-fill');
  const progressText: HTMLElement | null = document.getElementById('progress-text');
  const cancelBtn: HTMLElement | null = document.getElementById('cancel-download-btn');

  if (downloadPanelEl) downloadPanelEl.classList.remove('hidden');
  if (filenameEl) filenameEl.textContent = `正在下载: GPCL ${version} 安装程序`;
  if (downloadStatusEl) downloadStatusEl.textContent = `正在下载 GPCL ${version} ...`;
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '0%';
  if (cancelBtn) {
    cancelBtn.textContent = '取消下载';
    cancelBtn.classList.remove('complete');
    (cancelBtn as HTMLButtonElement).disabled = false;
  }

  if (window.gpcl.onUpdateDownloadProgress) {
    let lastTime: number = 0;
    let lastBytes: number = 0;
    let peakSpeedInner: number = 0;

    window.gpcl.onUpdateDownloadProgress((data: any): void => {
      const percent: number = data.percent || 0;
      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = percent.toFixed(1) + '%';
      if (downloadStatusEl) downloadStatusEl.textContent = `正在下载 GPCL ${version}: ${percent.toFixed(1)}%`;

      const currentSpeedEl: HTMLElement | null = document.getElementById('current-speed');
      const peakSpeedEl: HTMLElement | null = document.getElementById('peak-speed');
      if (data.bytesDownloaded && data.totalBytes) {
        const now: number = Date.now();
        if (lastTime > 0 && now > lastTime) {
          const timeDiff: number = (now - lastTime) / 1000;
          if (timeDiff >= 0.5) {
            const bytesDiff: number = data.bytesDownloaded - lastBytes;
            if (bytesDiff >= 0) {
              const speedBps: number = Math.max(0, (bytesDiff * 8) / timeDiff / 1000000);
              if (currentSpeedEl) currentSpeedEl.textContent = speedBps.toFixed(2) + ' Mbps';
              if (speedBps > peakSpeedInner) {
                peakSpeedInner = speedBps;
                if (peakSpeedEl) peakSpeedEl.textContent = peakSpeedInner.toFixed(2) + ' Mbps';
              }
              updateChart(speedBps);
            }
            lastTime = now;
            lastBytes = data.bytesDownloaded;
          }
        } else {
          lastTime = now;
          lastBytes = data.bytesDownloaded;
        }
      }
    });
  }

  const handleCancel = async (): Promise<void> => {
    if (window.gpcl.cancelUpdateDownload) {
      await window.gpcl.cancelUpdateDownload();
    }
    if (downloadPanelEl) downloadPanelEl.classList.add('hidden');
    if (downloadStatusEl) downloadStatusEl.textContent = '下载已取消';
    showToast('已取消', '更新下载已取消', 'info');
    if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
  };
  if (cancelBtn) {
    cancelBtn.onclick = handleCancel as any;
  }

  try {
    const result = await window.gpcl.downloadUpdate(version);

    if (result.success) {
      if (downloadStatusEl) downloadStatusEl.textContent = '下载完成，正在校验...';
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '100%';

      const verifyResult = await window.gpcl.verifyUpdateSHA1(result.filePath);
      let sha1Ok: boolean = verifyResult.success;
      let sha1Message: string = '下载完成';

      if (!sha1Ok) {
        const proceed: boolean = await showDialog({
          type: 'warning',
          title: '文件校验异常',
          message: `SHA1校验未通过：${verifyResult.error || '无法获取校验信息'}\n\n文件可能不完整或已损坏，是否仍要继续安装？`,
          confirmText: '继续安装',
          cancelText: '取消'
        });
        if (!proceed) {
          if (downloadPanelEl) downloadPanelEl.classList.add('hidden');
          showToast('已取消', '更新安装已取消', 'info');
          return;
        }
        sha1Message = '校验异常，已跳过';
      } else {
        sha1Message = '下载完成，校验通过';
      }

      if (downloadStatusEl) downloadStatusEl.textContent = sha1Message + '，准备安装...';
      if (cancelBtn) {
        cancelBtn.textContent = '下载完成';
        cancelBtn.classList.add('complete');
        (cancelBtn as HTMLButtonElement).disabled = true;
        cancelBtn.onclick = null;
      }

      const userConfirmed: boolean = await showDialog({
        type: 'confirm',
        title: '更新就绪',
        message: 'GoodPlanCraftLauncher 已经准备好全新的开始，接下来需要重新启动，是否继续？',
        confirmText: '继续更新',
        cancelText: '稍后'
      });

      if (userConfirmed) {
        if (downloadPanelEl) downloadPanelEl.classList.add('hidden');
        const execResult = await window.gpcl.executeUpdateInstaller(result.filePath);
        if (execResult.success) {
          showToast('正在更新', '启动器即将关闭并开始安装...', 'info');
          setTimeout(() => {
            if (window.gpcl.closeWindow) window.gpcl.closeWindow();
          }, 1000);
        } else {
          showToast('执行失败', execResult.error || '无法启动安装程序', 'error');
        }
      } else {
        await window.gpcl.setUpdateShutdownHook(result.filePath);
        if (downloadPanelEl) downloadPanelEl.classList.add('hidden');
        showToast('已记住', '关闭启动器时将自动执行更新', 'info');
      }
    } else if (result.cancelled) {
      if (downloadPanelEl) downloadPanelEl.classList.add('hidden');
      if (downloadStatusEl) downloadStatusEl.textContent = '下载已取消';
    } else {
      throw new Error(result.error || '下载失败');
    }
  } catch (err: any) {
    if (downloadStatusEl) downloadStatusEl.textContent = `下载失败: ${err.message}`;
    showToast('更新下载失败', err.message, 'error');
    if (cancelBtn) {
      (cancelBtn as HTMLButtonElement).disabled = true;
      cancelBtn.onclick = null;
    }
  } finally {
    isUpdateDownloadActive = false;
  }
}


// ===== 应用内更新下载结束 =====

async function updateSettingsBadge(): Promise<void> {
  const settingsMenu: HTMLElement | null = document.getElementById('menu-settings');
  const aboutTab: HTMLElement | null = document.getElementById('settings-tab-about');
  const checkUpdateBtn: HTMLElement | null = document.getElementById('check-update-btn');

  const oldSettingsBadge: HTMLElement | null = settingsMenu?.querySelector('.update-badge') as HTMLElement | null;
  if (oldSettingsBadge) oldSettingsBadge.remove();

  const oldAboutBadge: HTMLElement | null = aboutTab?.querySelector('.update-badge') as HTMLElement | null;
  if (oldAboutBadge) oldAboutBadge.remove();

  const settings = await loadSettings();

  if (updateAvailable && settings.advanced?.autoCheckUpdate !== false) {
    
    if (settingsMenu) {
      const badge: HTMLSpanElement = document.createElement('span');
      badge.className = 'update-badge';
      badge.textContent = '';
      badge.style.cssText = 'position:absolute;top:2px;right:2px;width:8px;height:8px;background:#f44336;border-radius:50%;';
      settingsMenu.style.position = 'relative';
      settingsMenu.appendChild(badge);
    }

    if (aboutTab) {
      const badge: HTMLSpanElement = document.createElement('span');
      badge.className = 'update-badge';
      badge.textContent = '';
      badge.style.cssText = 'position:absolute;top:6px;right:8px;width:8px;height:8px;background:#f44336;border-radius:50%;';
      aboutTab.style.position = 'relative';
      aboutTab.appendChild(badge);
    }

    if (checkUpdateBtn) {
      checkUpdateBtn.classList.add('new-version');
      checkUpdateBtn.textContent = `发现 ${allNewerVersions.length} 个新版本`;
    }
  } else {
    
    if (checkUpdateBtn && !updateAvailable) {
      checkUpdateBtn.classList.remove('new-version');
      checkUpdateBtn.textContent = '检查更新';
    }
  }
}

async function loadSettings(): Promise<any> {
  try {
    return await gpcl.getSettings();
  } catch (e: any) {
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
        scale: '100',
        playStartupAnimation: true,
        skipSplash: false
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
        developerMode: false
      }
    };
  }
}

function applyTheme(theme: string): void {
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}

async function saveThemeSetting(theme: string): Promise<void> {
  const settings = await loadSettings();
  settings.appearance.theme = theme;
  await gpcl.saveSettings(settings);
}

async function initTheme(): Promise<void> {
  const settings = await loadSettings();
  const theme: string = settings.appearance?.theme || 'dark';
  applyTheme(theme);
  
  const themeSelect: HTMLElement | null = document.getElementById('settings-theme');
  if (themeSelect) {
    (themeSelect as HTMLInputElement).value = theme;
    themeSelect.addEventListener('change', async (): Promise<void> => {
      const newTheme: string = (themeSelect as HTMLInputElement).value;
      applyTheme(newTheme);
      await saveThemeSetting(newTheme);
    });
  }
}

function applyScale(scale: string): void {
  const factor: number = parseInt(scale, 10) / 100;
  (document.body.style as any).zoom = factor;
}

async function saveScaleSetting(scale: string): Promise<void> {
  const settings = await loadSettings();
  settings.appearance.scale = scale;
  await gpcl.saveSettings(settings);
}

async function initScale(): Promise<void> {
  const settings = await loadSettings();
  const scale: string = settings.appearance?.scale || '100';
  applyScale(scale);
  
  const scaleSelect: HTMLElement | null = document.getElementById('settings-scale');
  if (scaleSelect) {
    (scaleSelect as HTMLInputElement).value = scale;
    scaleSelect.addEventListener('change', async (): Promise<void> => {
      const newScale: string = (scaleSelect as HTMLInputElement).value;
      applyScale(newScale);
      await saveScaleSetting(newScale);
    });
  }
}

async function saveJavaMirrorSettings(mirror: string, customUrl: string): Promise<void> {
  const settings = await loadSettings();
  settings.download.javaMirror = mirror;
  settings.download.customJavaMirror = customUrl;
  await gpcl.saveSettings(settings);
}
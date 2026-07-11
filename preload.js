/* 
 * CaelLab BY-SA Code License 
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS 

 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher 
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gpcl', {
  // 获取游戏目录路径
  getGameDir: () => ipcRenderer.invoke('get-game-dir'),

  // 扫描本地已安装版本
  scanVersions: (gameDir, silent) => ipcRenderer.invoke('scan-versions', gameDir, silent),

  // 启动游戏
  launch: (options) => ipcRenderer.invoke('launch-minecraft', options),

  // 获取远程版本列表
  getVersionManifest: () => ipcRenderer.invoke('get-version-manifest'),

  downloadVersion: (versionId, maxConcurrent) => ipcRenderer.invoke('download-version', versionId, maxConcurrent),

  onGameLog: (callback) => {
    ipcRenderer.on('game-log', (event, text) => callback(text));
  },

  onGameClosed: (callback) => {
    ipcRenderer.on('game-closed', (event, code) => callback(code));
  },

  onGameError: (callback) => {
    ipcRenderer.on('game-error', (event, message) => callback(message));
  },

  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },

  onConfirmCloseWhileDownloading: (callback) => {
    ipcRenderer.on('confirm-close-while-downloading', () => callback());
  },

  getPlayerName: () => ipcRenderer.invoke('get-player-name'),

  savePlayerName: (name) => ipcRenderer.invoke('save-player-name', name),

  showMessageDialog: (options) => ipcRenderer.invoke('show-message-dialog', options),

  confirmCloseDownload: () => ipcRenderer.invoke('confirm-close-download'),

  cancelDownloadOnly: () => ipcRenderer.invoke('cancel-download-only'),

  getJavaMirrorSettings: () => ipcRenderer.invoke('get-java-mirror-settings'),

  getJavaDownloadUrl: (javaVersion) => ipcRenderer.invoke('get-java-download-url', javaVersion),

  cancelClose: () => ipcRenderer.invoke('cancel-close'),

  checkJava: (versionId) => ipcRenderer.invoke('check-java', versionId),

  showJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (event, data) => callback(data));
  },

  selectJavaVersion: (data) => ipcRenderer.invoke('select-java-version', data),

  installJava: (javaVersion) => ipcRenderer.invoke('install-java', javaVersion),

  uninstallJava: (javaVersion) => ipcRenderer.invoke('uninstall-java', javaVersion),

  onJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (event, data) => callback(data));
  },

  onJavaDownloadCompleted: (callback) => {
    ipcRenderer.on('java-download-completed', (event, data) => callback(data));
  },

  onJavaDownloadFailed: (callback) => {
    ipcRenderer.on('java-download-failed', (event, data) => callback(data));
  },

  onGameWindowCreated: (callback) => {
    ipcRenderer.on('game-window-created', (event, data) => callback(data));
  },

  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  focusWindow: () => ipcRenderer.invoke('window-focus'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  deleteVersion: (versionId) => ipcRenderer.invoke('delete-version', versionId),
  getVersionSettings: (versionId) => ipcRenderer.invoke('get-version-settings', versionId),
  saveVersionSettings: (versionId, settings) => ipcRenderer.invoke('save-version-settings', versionId, settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  cancelLaunch: () => ipcRenderer.invoke('cancel-launch'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  resetSettings: () => ipcRenderer.invoke('reset-settings'),

  playStartupAnimation: () => ipcRenderer.invoke('play-startup-animation'),

  dismissStartupAnimation: () => ipcRenderer.invoke('dismiss-startup-animation'),

  setDeveloperMode: (enabled) => ipcRenderer.invoke('set-developer-mode', enabled),

  restartApp: () => ipcRenderer.invoke('restart-app'),

  readJsonFile: (subPath, fileName) => ipcRenderer.invoke('read-json-file', subPath, fileName),
  writeJsonFile: (subPath, fileName, data) => ipcRenderer.invoke('write-json-file', subPath, fileName, data),

  getForgeVersions: (mcVersion) => ipcRenderer.invoke('get-forge-versions', mcVersion),
  getFabricVersions: (mcVersion) => ipcRenderer.invoke('get-fabric-versions', mcVersion),
  getOptiFineVersions: (mcVersion) => ipcRenderer.invoke('get-optifine-versions', mcVersion),

  downloadWithModLoader: (versionId, loaderType, loaderVersion, maxConcurrent) => 
    ipcRenderer.invoke('download-with-modloader', versionId, loaderType, loaderVersion, maxConcurrent),

  getVersionConfig: (versionId) => ipcRenderer.invoke('get-version-config', versionId),
  getVersionDisplayName: (versionId) => ipcRenderer.invoke('get-version-display-name', versionId),
  getLaunchDisplayName: (versionId) => ipcRenderer.invoke('get-launch-display-name', versionId),

  getMemoryUsage: () => ipcRenderer.invoke('get-memory-usage'),
  optimizeMemory: () => ipcRenderer.invoke('optimize-memory'),

  // 应用内更新系统
  downloadUpdate: (version) => ipcRenderer.invoke('download-update', version),
  cancelUpdateDownload: () => ipcRenderer.invoke('cancel-update-download'),
  verifyUpdateSHA1: (filePath) => ipcRenderer.invoke('verify-update-sha1', filePath),
  executeUpdateInstaller: (installerPath) => ipcRenderer.invoke('execute-update-installer', installerPath),
  setUpdateShutdownHook: (installerPath) => ipcRenderer.invoke('set-update-shutdown-hook', installerPath),

  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, data) => callback(data));
  },
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('game-log');
    ipcRenderer.removeAllListeners('game-closed');
    ipcRenderer.removeAllListeners('game-error');
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('confirm-close-while-downloading');
    ipcRenderer.removeAllListeners('show-java-install-dialog');
    ipcRenderer.removeAllListeners('java-download-completed');
    ipcRenderer.removeAllListeners('java-download-failed');
    ipcRenderer.removeAllListeners('game-window-created');
    ipcRenderer.removeAllListeners('update-download-progress');
  }
});

window.addEventListener('keydown', e => {
  const key = (e.key || '').toLowerCase();
  if (key === 'f12' ||
      (e.ctrlKey && e.shiftKey && key === 'i') ||
      (e.metaKey && e.altKey && key === 'i')) {
    e.preventDefault();
  }
}, { capture: true });

window.addEventListener('contextmenu', e => {
  e.preventDefault();
}, { capture: true });

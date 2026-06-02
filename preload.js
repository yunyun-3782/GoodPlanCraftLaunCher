/* 
 * CaelLab BY-SA Code License 
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS 
 * Source: https://git.caellab.com/yunyun/GoodPlanCraftLauncher 
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

  // 下载指定版本
  downloadVersion: (versionId, maxConcurrent) => ipcRenderer.invoke('download-version', versionId, maxConcurrent),

  // 监听游戏日志
  onGameLog: (callback) => {
    ipcRenderer.on('game-log', (event, text) => callback(text));
  },

  // 监听游戏关闭
  onGameClosed: (callback) => {
    ipcRenderer.on('game-closed', (event, code) => callback(code));
  },

  // 监听启动错误
  onGameError: (callback) => {
    ipcRenderer.on('game-error', (event, message) => callback(message));
  },

  // 监听下载进度
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },

  // 监听关闭确认询问
  onConfirmCloseWhileDownloading: (callback) => {
    ipcRenderer.on('confirm-close-while-downloading', () => callback());
  },

  // 读取玩家名
  getPlayerName: () => ipcRenderer.invoke('get-player-name'),

  // 保存玩家名
  savePlayerName: (name) => ipcRenderer.invoke('save-player-name', name),

  // 显示消息对话框
  showMessageDialog: (options) => ipcRenderer.invoke('show-message-dialog', options),

  // 确认关闭并清理下载
  confirmCloseDownload: () => ipcRenderer.invoke('confirm-close-download'),

  // 取消下载（只清理，不关闭窗口）
  cancelDownloadOnly: () => ipcRenderer.invoke('cancel-download-only'),

  // 获取Java镜像源设置
  getJavaMirrorSettings: () => ipcRenderer.invoke('get-java-mirror-settings'),

  // 获取Java版本对应的下载URL
  getJavaDownloadUrl: (javaVersion) => ipcRenderer.invoke('get-java-download-url', javaVersion),

  // 取消关闭
  cancelClose: () => ipcRenderer.invoke('cancel-close'),

  // 检查Java是否已安装
  checkJava: (versionId) => ipcRenderer.invoke('check-java', versionId),

  // 显示Java安装对话框
  showJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (event, data) => callback(data));
  },

  // 选择Java版本
  selectJavaVersion: (data) => ipcRenderer.invoke('select-java-version', data),

  // 安装Java
  installJava: (javaVersion) => ipcRenderer.invoke('install-java', javaVersion),

  // 卸载Java
  uninstallJava: (javaVersion) => ipcRenderer.invoke('uninstall-java', javaVersion),

  // 监听Java安装对话框
  onJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (event, data) => callback(data));
  },

  // 监听Java下载完成
  onJavaDownloadCompleted: (callback) => {
    ipcRenderer.on('java-download-completed', (event, data) => callback(data));
  },

  // 监听Java下载失败
  onJavaDownloadFailed: (callback) => {
    ipcRenderer.on('java-download-failed', (event, data) => callback(data));
  },

  // 监听游戏窗口创建成功
  onGameWindowCreated: (callback) => {
    ipcRenderer.on('game-window-created', (event, data) => callback(data));
  },

  // 移除所有监听器（避免重复绑定）
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
  
  // 获取设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  // 保存设置
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // 重置设置
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  
  // 播放启动动画
  playStartupAnimation: () => ipcRenderer.invoke('play-startup-animation'),
  
  // 关闭启动动画
  dismissStartupAnimation: () => ipcRenderer.invoke('dismiss-startup-animation'),
  
  // 开发者模式
  setDeveloperMode: (enabled) => ipcRenderer.invoke('set-developer-mode', enabled),
  
  // 重启应用
  restartApp: () => ipcRenderer.invoke('restart-app'),
  
  // 文件读写
  readJsonFile: (subPath, fileName) => ipcRenderer.invoke('read-json-file', subPath, fileName),
  writeJsonFile: (subPath, fileName, data) => ipcRenderer.invoke('write-json-file', subPath, fileName, data),
  
  // 模组加载器版本获取
  getForgeVersions: (mcVersion) => ipcRenderer.invoke('get-forge-versions', mcVersion),
  getFabricVersions: (mcVersion) => ipcRenderer.invoke('get-fabric-versions', mcVersion),
  getOptiFineVersions: (mcVersion) => ipcRenderer.invoke('get-optifine-versions', mcVersion),
  
  // 下载带模组加载器的版本
  downloadWithModLoader: (versionId, loaderType, loaderVersion, maxConcurrent) => 
    ipcRenderer.invoke('download-with-modloader', versionId, loaderType, loaderVersion, maxConcurrent),
    
  // 读取版本配置
  getVersionConfig: (versionId) => ipcRenderer.invoke('get-version-config', versionId),
  getVersionDisplayName: (versionId) => ipcRenderer.invoke('get-version-display-name', versionId),
  getLaunchDisplayName: (versionId) => ipcRenderer.invoke('get-launch-display-name', versionId),
  
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
  }
});

// 屏蔽开发者工具快捷键（生产环境）
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

/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS
 * Licensed under the CaelLab BY-SA Code License, Version 2.0
 * or any later version. https://www.caellab.com/license/bysa-code-v2.txt
 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { GPCLApi } from './types';

const gpclApi: GPCLApi = {
  getGameDir: () => ipcRenderer.invoke('get-game-dir'),
  scanVersions: (gameDir: string, silent?: boolean) => ipcRenderer.invoke('scan-versions', gameDir, silent),
  launch: (options) => ipcRenderer.invoke('launch-minecraft', options),
  getVersionManifest: () => ipcRenderer.invoke('get-version-manifest'),
  downloadVersion: (versionId: string, maxConcurrent: number) => ipcRenderer.invoke('download-version', versionId, maxConcurrent),

  onGameLog: (callback) => {
    ipcRenderer.on('game-log', (_event, text) => callback(text));
  },
  onGameClosed: (callback) => {
    ipcRenderer.on('game-closed', (_event, code) => callback(code));
  },
  onGameError: (callback) => {
    ipcRenderer.on('game-error', (_event, message) => callback(message));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, data) => callback(data));
  },
  onConfirmCloseWhileDownloading: (callback) => {
    ipcRenderer.on('confirm-close-while-downloading', () => callback());
  },

  getPlayerName: () => ipcRenderer.invoke('get-player-name'),
  savePlayerName: (name: string) => ipcRenderer.invoke('save-player-name', name),
  showMessageDialog: (options) => ipcRenderer.invoke('show-message-dialog', options),
  confirmCloseDownload: () => ipcRenderer.invoke('confirm-close-download'),
  cancelDownloadOnly: () => ipcRenderer.invoke('cancel-download-only'),
  getJavaMirrorSettings: () => ipcRenderer.invoke('get-java-mirror-settings'),
  getJavaDownloadUrl: (javaVersion: string) => ipcRenderer.invoke('get-java-download-url', javaVersion),
  cancelClose: () => ipcRenderer.invoke('cancel-close'),
  checkJava: (versionId: string) => ipcRenderer.invoke('check-java', versionId),

  showJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (_event, data) => callback(data));
  },
  selectJavaVersion: (data) => ipcRenderer.invoke('select-java-version', data),
  installJava: (javaVersion: string) => ipcRenderer.invoke('install-java', javaVersion),
  uninstallJava: (javaVersion: string) => ipcRenderer.invoke('uninstall-java', javaVersion),

  onJavaInstallDialog: (callback) => {
    ipcRenderer.on('show-java-install-dialog', (_event, data) => callback(data));
  },
  onJavaDownloadCompleted: (callback) => {
    ipcRenderer.on('java-download-completed', (_event, data) => callback(data));
  },
  onJavaDownloadFailed: (callback) => {
    ipcRenderer.on('java-download-failed', (_event, data) => callback(data));
  },
  onGameWindowCreated: (callback) => {
    ipcRenderer.on('game-window-created', (_event, data) => callback(data));
  },

  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  focusWindow: () => ipcRenderer.invoke('window-focus'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  deleteVersion: (versionId: string) => ipcRenderer.invoke('delete-version', versionId),
  getVersionSettings: (versionId: string) => ipcRenderer.invoke('get-version-settings', versionId),
  saveVersionSettings: (versionId: string, settings: any) => ipcRenderer.invoke('save-version-settings', versionId, settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  cancelLaunch: () => ipcRenderer.invoke('cancel-launch'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  playStartupAnimation: () => ipcRenderer.invoke('play-startup-animation'),
  dismissStartupAnimation: () => ipcRenderer.invoke('dismiss-startup-animation'),
  setDeveloperMode: (enabled: boolean) => ipcRenderer.invoke('set-developer-mode', enabled),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  readJsonFile: (subPath: string, fileName: string) => ipcRenderer.invoke('read-json-file', subPath, fileName),
  writeJsonFile: (subPath: string, fileName: string, data: any) => ipcRenderer.invoke('write-json-file', subPath, fileName, data),

  getForgeVersions: (mcVersion: string) => ipcRenderer.invoke('get-forge-versions', mcVersion),
  getFabricVersions: (mcVersion: string) => ipcRenderer.invoke('get-fabric-versions', mcVersion),
  getOptiFineVersions: (mcVersion: string) => ipcRenderer.invoke('get-optifine-versions', mcVersion),
  downloadWithModLoader: (versionId: string, loaderType: string, loaderVersion: string, maxConcurrent: number) =>
    ipcRenderer.invoke('download-with-modloader', versionId, loaderType, loaderVersion, maxConcurrent),

  getVersionConfig: (versionId: string) => ipcRenderer.invoke('get-version-config', versionId),
  getVersionDisplayName: (versionId: string) => ipcRenderer.invoke('get-version-display-name', versionId),
  getLaunchDisplayName: (versionId: string) => ipcRenderer.invoke('get-launch-display-name', versionId),

  getMemoryUsage: () => ipcRenderer.invoke('get-memory-usage'),
  optimizeMemory: () => ipcRenderer.invoke('optimize-memory'),

  downloadUpdate: (version: string) => ipcRenderer.invoke('download-update', version),
  cancelUpdateDownload: () => ipcRenderer.invoke('cancel-update-download'),
  verifyUpdateSHA1: (filePath: string) => ipcRenderer.invoke('verify-update-sha1', filePath),
  executeUpdateInstaller: (installerPath: string) => ipcRenderer.invoke('execute-update-installer', installerPath),
  setUpdateShutdownHook: (installerPath: string) => ipcRenderer.invoke('set-update-shutdown-hook', installerPath),

  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (_event, data) => callback(data));
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
    ipcRenderer.removeAllListeners('microsoft-auth-result');
  },

  startMicrosoftAuth: () => ipcRenderer.invoke('start-microsoft-auth'),
  onMicrosoftAuthResult: (callback) => {
    ipcRenderer.on('microsoft-auth-result', (_event, result) => callback(result));
  },
};

contextBridge.exposeInMainWorld('gpcl', gpclApi);

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const key = (e.key || '').toLowerCase();
  if (
    key === 'f12' ||
    (e.ctrlKey && e.shiftKey && key === 'i') ||
    (e.metaKey && e.altKey && key === 'i')
  ) {
    e.preventDefault();
  }
}, { capture: true });

window.addEventListener('contextmenu', (e: Event) => {
  e.preventDefault();
}, { capture: true });

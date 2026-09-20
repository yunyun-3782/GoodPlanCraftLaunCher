/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS
 * Licensed under the CaelLab BY-SA Code License, Version 2.0
 * or any later version. https://www.caellab.com/license/bysa-code-v2.txt
 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher
 */

import { app, BrowserWindow, ipcMain, net, dialog, Menu, shell } from 'electron';
import path from 'path';
import { spawn, spawnSync, execFile, execSync, exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

process.env.TZ = 'Asia/Shanghai';

process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');

app.commandLine.appendSwitch('js-flags', '--compile-hints-always');
app.commandLine.appendSwitch('disk-cache-size', '134217728');

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

function checkDebuggerAttached(): boolean {
  try {
    if (process.execArgv.some(arg => arg.includes('--inspect') || arg.includes('--debug-brk'))) {
      return true;
    }
    if (process.env.ELECTRON_ENABLE_STACK_DUMPING) {
      return true;
    }
  } catch (e) {}
  return false;
}

let isDeveloperMode: boolean = false;

let BASE_DIR: string;
let GAME_DIR: string;
let CACHE_DIR: string;
let LOG_DIR: string;
let LOG_FILE: string;
let APP_VERSION: string;
let CONFIG_DIR: string;
let UPDATA_DIR: string;

const DEFAULT_SETTINGS = {
  game: {
    memory: '2',
    playerName: 'GPCL_Player',
    javaPath: '',
    jvmArgs: '',
    windowMode: 'windowed'
  },
  appearance: {
    theme: 'light',
    scale: '110',
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

function parseIni(text: string): any {
  const result: any = {};
  let currentSection: string | null = null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }
    const keyValueMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (keyValueMatch && currentSection) {
      const key = keyValueMatch[1].trim();
      let value: any = keyValueMatch[2].trim();
      if (value.toLowerCase() === 'true') {
        value = true;
      } else if (value.toLowerCase() === 'false') {
        value = false;
      } else {
        const num = Number(value);
        if (!isNaN(num)) {
          value = num;
        }
      }
      result[currentSection][key] = value;
    }
  }
  return result;
}

function stringifyIni(obj: any): string {
  let result = '';
  for (const [section, sectionData] of Object.entries(obj)) {
    result += `[${section}]\n`;
    for (const [key, value] of Object.entries(sectionData as Record<string, any>)) {
      result += `${key}=${value}\n`;
    }
    result += '\n';
  }
  return result.trim();
}

function mergeWithDefaults(settings: any): any {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const [section, sectionData] of Object.entries(settings)) {
    if (merged[section]) {
      for (const [key, value] of Object.entries(sectionData as Record<string, any>)) {
        if (key in merged[section]) {
          merged[section][key] = value;
        }
      }
    }
  }
  return merged;
}

function loadSettings(): any {
  try {
    const configPath = path.join(BASE_DIR, 'gpcl', 'config', 'setting.ini');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseIni(content);
      const merged = mergeWithDefaults(parsed);
      writeLog('配置已加载');
      return merged;
    }
  } catch (e: any) {
    writeLog(`加载配置失败: ${e.message}`);
  }
  writeLog('使用默认配置');
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettings(settings: any): boolean {
  try {
    const configDir = path.join(BASE_DIR, 'gpcl', 'config');
    const configPath = path.join(configDir, 'setting.ini');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const content = stringifyIni(settings);
    fs.writeFileSync(configPath, content, 'utf8');
    writeLog('配置已保存');
    return true;
  } catch (e: any) {
    writeLog(`保存配置失败: ${e.message}`);
    return false;
  }
}

function initPaths(): void {
  BASE_DIR = app.getPath('userData');
  GAME_DIR = path.join(BASE_DIR, '.minecraft');
  CACHE_DIR = path.join(BASE_DIR, 'gpcl', 'cache');
  LOG_DIR = path.join(BASE_DIR, 'gpcl', 'log');
  CONFIG_DIR = path.join(BASE_DIR, 'gpcl', 'config');
  UPDATA_DIR = path.join(BASE_DIR, 'gpcl', 'updata');
  const startupTime = new Date().toISOString().replace(/:/g, '-').replace('.', '_');
  LOG_FILE = path.join(LOG_DIR, `${startupTime}.log`);

  const requiredDirs = [
    path.join(BASE_DIR, 'gpcl', 'config'),
    path.join(BASE_DIR, 'gpcl', 'users'),
    LOG_DIR,
    CACHE_DIR,
    UPDATA_DIR
  ];

  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  fs.writeFileSync(LOG_FILE, '\uFEFF', 'utf8');

  // 启动时清理上次下载的更新安装包
  try {
    if (fs.existsSync(UPDATA_DIR)) {
      const files = fs.readdirSync(UPDATA_DIR);
      for (const file of files) {
        if (file.startsWith('GPCL-') && file.endsWith('-Setup.exe')) {
          fs.unlinkSync(path.join(UPDATA_DIR, file));
        }
      }
    }
  } catch (e) {}
}

function cleanupExpiredLogs(): void {
  try {
    const settings = loadSettings();
    const autoClearLogs = settings.advanced?.autoClearLogs;
    
    if (!autoClearLogs) {
      writeLog('[日志清理] 自动清理日志已禁用');
      return;
    }

    const retentionValue = settings.advanced?.logRetentionValue || 7;
    const retentionUnit = settings.advanced?.logRetentionUnit || 'day';

    const now = Date.now();
    let expireTime: number;
    
    switch (retentionUnit) {
      case 'hour':
        expireTime = now - retentionValue * 60 * 60 * 1000;
        break;
      case 'day':
        expireTime = now - retentionValue * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        expireTime = now - retentionValue * 30 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        expireTime = now - retentionValue * 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        expireTime = now - retentionValue * 24 * 60 * 60 * 1000;
    }

    if (!fs.existsSync(LOG_DIR)) {
      writeLog('[日志清理] 日志目录不存在');
      return;
    }

    const files = fs.readdirSync(LOG_DIR);
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filePath = path.join(LOG_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime.getTime() < expireTime) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (e: any) {
        writeLog(`[日志清理] 清理文件失败: ${file} - ${e.message}`);
      }
    }

    if (cleanedCount > 0) {
      writeLog(`[日志清理] 已清理 ${cleanedCount} 个过期日志文件`);
    } else {
      writeLog('[日志清理] 没有需要清理的过期日志');
    }
  } catch (e: any) {
    writeLog(`[日志清理] 清理过程出错: ${e.message}`);
  }
}

let mainWindow: BrowserWindow | null;
APP_VERSION = require('./package.json').version;

function writeLog(message: string): void {
  const timestamp = formatTimestamp();
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    if (LOG_FILE) {
      fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    }
    console.log(`[${timestamp}] LOG:`, message);
  } catch (e) {
    console.error(`[${formatTimestamp()}] 写入日志失败:`, e);
  }
}

let isDownloading: boolean = false;
let currentDownloadVersion: string | null = null;
let shouldCancelDownload: boolean = false;
let currentDownloadType: string | null = null;
let currentDownloadPath: string | null = null;
let javaDownloadResolve: ((value: any) => void) | null = null;
let javaDownloadReject: ((reason: any) => void) | null = null;
let isJavaDownloading: boolean = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    maxWidth: 1920,
    maxHeight: 1080,
    frame: false,
    title: 'GoodPlanCraftLauncher',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0d0d15',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      shell.openExternal(details.url);
      writeLog(`[外部链接] 通过 window.open 拦截并打开: ${details.url}`);
    } catch (e: any) {
      writeLog(`[外部链接] 打开失败: ${e.message}`);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('new-window', (event: any, url: string) => {
    event.preventDefault();
    try {
      shell.openExternal(url);
      writeLog(`[外部链接] 通过 new-window 拦截并打开: ${url}`);
    } catch (e: any) {
      writeLog(`[外部链接] 打开失败: ${e.message}`);
    }
  });

  try { Menu.setApplicationMenu(null); } catch (e) {}
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));

  mainWindow.on('close', (event: any) => {
    if (isDownloading || isJavaDownloading) {
      event.preventDefault();
      mainWindow!.webContents.send('confirm-close-while-downloading');
    }
  });

  mainWindow.webContents.on('before-input-event', (event: any, input: any) => {
    if (isDeveloperMode) return;
    const key = input.key && input.key.toLowerCase();
    const ctrlOrCmd = input.control || input.meta;
    if ((ctrlOrCmd && key === 'r') || input.key === 'F5') event.preventDefault();
    if ((input.control && input.shift && key === 'i') || input.key === 'F12' || (input.meta && input.alt && key === 'i')) event.preventDefault();
  });

  mainWindow.webContents.on('context-menu', (e: any) => {
    if (!isDeveloperMode) e.preventDefault();
  });
}

app.on('web-contents-created', (event: any, contents: any) => {
  try {
    contents.on('context-menu', (e: any) => {
      if (!isDeveloperMode) e.preventDefault();
    });
    contents.on('before-input-event', (event: any, input: any) => {
      if (isDeveloperMode) return;
      const key = input.key && input.key.toLowerCase();
      const ctrlOrCmd = input.control || input.meta;
      if ((ctrlOrCmd && key === 'r') || input.key === 'F5') event.preventDefault();
      if ((input.control && input.shift && key === 'i') || input.key === 'F12' || (input.meta && input.alt && key === 'i')) event.preventDefault();
    });

    contents.setWindowOpenHandler((details: any) => {
      try {
        shell.openExternal(details.url);
        writeLog(`[外部链接] 通过 window.open 拦截并打开: ${details.url}`);
      } catch (e: any) {
        writeLog(`[外部链接] 打开失败: ${e.message}`);
      }
      return { action: 'deny' };
    });

    contents.on('new-window', (event: any, url: string) => {
      event.preventDefault();
      try {
        shell.openExternal(url);
        writeLog(`[外部链接] 通过 new-window 拦截并打开: ${url}`);
      } catch (e: any) {
        writeLog(`[外部链接] 打开失败: ${e.message}`);
      }
    });
  } catch (e) {}
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createGPCLShortcut(): void {
  try {
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const shortcutPath = path.join(startMenuDir, 'GPCL.lnk');
    
    if (fs.existsSync(shortcutPath)) {
      return;
    }
    
    if (app.isPackaged) {
      const exePath = process.execPath;
      shell.writeShortcutLink(shortcutPath, 'create', {
        target: exePath,
        description: 'GoodPlanCraftLauncher - Minecraft 启动器',
        icon: exePath,
        iconIndex: 0
      });
      writeLog('[快捷方式] 已创建 GPCL 快捷方式');
    }
  } catch (e: any) {
    writeLog(`[快捷方式] 创建 GPCL 快捷方式失败: ${e.message}`);
  }
}

app.whenReady().then(() => {
  const isTesting = process.argv.includes('--squirrel-install') || 
                    process.argv.includes('--squirrel-obsolete') ||
                    process.argv.includes('--squirrel-updated') ||
                    process.argv.includes('--testing');
  
  if (isTesting) {
    console.log('[启动] 检测到构建测试模式，跳过窗口创建');
    app.quit();
    return;
  }

  BASE_DIR = app.getPath('userData');

  let preventMultipleLaunch = true;
  try {
    const configPath = path.join(BASE_DIR, 'gpcl', 'config', 'setting.ini');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseIni(content);
      if (parsed.advanced) {
        if (parsed.advanced.preventMultipleLaunch === false || parsed.advanced.preventmultiplelaunch === false) {
          preventMultipleLaunch = false;
        }
      }
    }
  } catch (e) {}

  if (preventMultipleLaunch) {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      writeLog('检测到已有实例运行，退出');
      app.quit();
      return;
    }
  }

  initPaths();
  cleanupExpiredLogs();
  
  try {
    const devConfigPath = path.join(BASE_DIR, 'gpcl', 'config', 'setting.ini');
    if (fs.existsSync(devConfigPath)) {
      const devContent = fs.readFileSync(devConfigPath, 'utf8');
      const devParsed = parseIni(devContent);
      if (devParsed.advanced && devParsed.advanced.developerMode === true) {
        isDeveloperMode = true;
        writeLog('[开发者模式] 启动时已启用');
      }
    }
  } catch (e) {}
  
  createGPCLShortcut();
  
  writeLog(`GPCL v${APP_VERSION} 启动`);
  console.log('日志文件路径:', LOG_FILE);
  try {
    createWindow();
  } catch (e: any) {
    writeLog(`[致命错误] 创建窗口失败: ${e.message}`);
    console.error('创建窗口失败:', e);
  }
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('show-message-dialog', async (_: any, options: any) => {
  if (!mainWindow) return { success: false };
  const result = await dialog.showMessageBox(mainWindow, {
    type: options.type || 'info',
    title: options.title || '提示',
    message: options.message || '',
    detail: options.detail || '',
    buttons: options.buttons || ['确定'],
    defaultId: options.defaultId || 0,
    cancelId: options.cancelId || 0,
    noLink: true
  });
  return { success: true, response: result.response };
});

const JAVA_RUNTIME_MAP: Record<string, string> = {
  "8": "jre-legacy", "16": "java-runtime-beta", "17": "java-runtime-gamma",
  "21": "java-runtime-delta", "25": "java-runtime-epsilon"
};

const JAVA_DOWNLOAD_KEYS: Record<string, string> = {
  "8": "jre-legacy", "17": "java-runtime-gamma",
  "21": "java-runtime-delta", "25": "java-runtime-epsilon"
};

const JAVA_VERSIONS_AVAILABLE: string[] = ["8", "17", "21", "25"];

function getJavaRuntimeDir(javaVersion: string): string {
  const runtimeName = JAVA_RUNTIME_MAP[javaVersion] || `jre${javaVersion}`;
  return path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft', 'runtime', runtimeName);
}

function findJavaExecutable(runtimeDir: string): string | null {
  const javaPath = path.join(runtimeDir, 'bin', 'java.exe');
  if (fs.existsSync(javaPath)) {
    try {
      fs.accessSync(javaPath, fs.constants.R_OK);
      return javaPath;
    } catch (e) { return null; }
  }
  return findJavaExecutableInDir(runtimeDir);
}

async function checkJavaInstalled(javaVersion: string): Promise<{ installed: boolean; javaPath: string | null }> {
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  if (fs.existsSync(runtimeDir)) {
    const exe = findJavaExecutable(runtimeDir);
    if (exe) return { installed: true, javaPath: exe };
  }
  return { installed: false, javaPath: null };
}

function getJavaVersionForMCVersion(versionId: string): string {
  const parts = versionId.split('.');
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  if (isNaN(major)) major = 1;
  if (isNaN(minor)) {
    if (major >= 26) return '25';
    if (major >= 21) return '21';
    return '17';
  }
  if (major === 1) {
    if (minor < 17) return '8';
    if (minor === 17) return '16';
    if (minor <= 20) return '17';
    return '21';
  }
  if (major >= 26) return '25';
  if (major >= 21) return '21';
  return '17';
}

function getJavaVersionFromVersionData(versionData: any): string {
  if (versionData?.javaVersion?.majorVersion) return String(versionData.javaVersion.majorVersion);
  if (versionData?.javaVersion?.component) {
    const m = versionData.javaVersion.component.match(/\d+/);
    if (m) return m[0];
  }
  return getJavaVersionForMCVersion(versionData.id);
}

async function ensureJavaRuntime(version: string): Promise<string | null> {
  const javaVersion = typeof version === 'string' ? version : String(version);
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  writeLog(`[Java] 查找 Java ${javaVersion} 运行时: ${runtimeDir}`);
  if (fs.existsSync(runtimeDir)) {
    const exe = findJavaExecutable(runtimeDir);
    if (exe) { writeLog(`[Java] 找到 Java ${javaVersion}: ${exe}`); return exe; }
  }
  writeLog(`[Java] 未找到 Java ${javaVersion} 运行时`);
  return null;
}

async function ensureJavaRuntimeWithInstall(version: string, mainWindow: BrowserWindow): Promise<any> {
  const javaVersion = typeof version === 'string' ? version : String(version);
  const installed = await checkJavaInstalled(javaVersion);
  if (installed.installed && installed.javaPath) {
    writeLog(`[Java] Java ${javaVersion} 已安装: ${installed.javaPath}`);
    return { success: true, javaPath: installed.javaPath };
  }
  writeLog(`[Java] Java ${javaVersion} 未安装，开始下载流程`);
  return null;
}

ipcMain.handle('confirm-close-download', async () => {
  if (isDownloading && currentDownloadVersion) {
    shouldCancelDownload = true;
    try {
      const versionDir = currentDownloadPath || path.join(GAME_DIR, 'versions', currentDownloadVersion);
      const cancelFilePath = path.join(versionDir, 'CancelDownload.txt');
      const cancelContent = `GoodPlanCraftLauncher ${APP_VERSION}\n取消时间：${formatTimestamp()}\n\n正确的关闭\n您在下载完成前正确地关闭了GPCL。`;
      if (fs.existsSync(versionDir)) {
        fs.writeFileSync(cancelFilePath, cancelContent, 'utf8');
        const files = fs.readdirSync(versionDir);
        for (const file of files) {
          const filePath = path.join(versionDir, file);
          if (file !== 'CancelDownload.txt') {
            if (fs.statSync(filePath).isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
      writeLog(`已清理游戏版本下载目录: ${versionDir}`);
    } catch (e: any) {
      console.error('清理下载失败:', e);
      writeLog(`清理下载失败: ${e.message}`);
    }
    isDownloading = false;
    currentDownloadVersion = null;
    currentDownloadType = null;
    currentDownloadPath = null;
  }
  if (mainWindow) mainWindow.destroy();
  return { success: true };
});

ipcMain.handle('cancel-close', () => ({ success: true }));

let launchCancelFlag: boolean = false;
let currentGameProcess: any = null;
let currentGamePid: number | null = null;

function killGameProcessTree(pid: number): boolean {
  try {
    const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    if (result.status === 0) { writeLog(`[启动] 已终止进程树 PID: ${pid}`); return true; }
    writeLog(`[启动] taskkill PID ${pid} 返回: ${result.status}, ${result.stderr?.toString().trim()}`);
  } catch (e: any) { writeLog(`[启动] taskkill 失败: ${e.message}`); }
  return false;
}

function findAndKillMinecraftJavaProcesses(): boolean {
  try {
    const script = `
      $javaProcs = Get-Process -Name "java","javaw" -ErrorAction SilentlyContinue
      if ($javaProcs) {
        foreach ($p in $javaProcs) {
          try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmdLine -and ($cmdLine -like '*net.minecraft*' -or $cmdLine -like '*minecraft*' -or $cmdLine -like '*forge*' -or $cmdLine -like '*fabric*' -or $cmdLine -like '*optifine*')) {
              Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
              Write-Output "KILLED:$($p.Id)"
            }
          } catch {}
        }
      }
    `;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
    const output = (result.stdout || '').toString().trim();
    if (output) {
      const pids = output.split('\n').filter(l => l.startsWith('KILLED:')).map(l => l.replace('KILLED:', ''));
      writeLog(`[启动] 通过命令行匹配杀死了 ${pids.length} 个Minecraft Java进程: ${pids.join(', ')}`);
      return pids.length > 0;
    }
  } catch (e: any) { writeLog(`[启动] 查找Minecraft进程失败: ${e.message}`); }
  return false;
}

ipcMain.handle('cancel-launch', async () => {
  launchCancelFlag = true;
  writeLog('[启动] 用户取消启动');
  let killed = false;
  if (currentGameProcess) {
    try {
      const pid = currentGameProcess.pid;
      if (pid) { writeLog(`[启动] 尝试终止游戏进程 PID: ${pid}`); killed = killGameProcessTree(pid); try { currentGameProcess.kill(); } catch {} }
    } catch (e: any) { writeLog(`[启动] 终止游戏进程异常: ${e.message}`); }
    currentGameProcess = null;
    currentGamePid = null;
  }
  if (!killed) { writeLog('[启动] 未找到已保存的游戏进程，尝试通过命令行匹配查找Minecraft Java进程'); findAndKillMinecraftJavaProcesses(); }
  if (mainWindow) mainWindow.webContents.send('game-closed', -1);
  return { success: true };
});

ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const url = 'https://gamets.caellab.com/gpcl/data.json';
    writeLog('[更新] 开始检查更新...');
    https.get(url, (res: any) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          writeLog('[更新] 检查更新完成');
          resolve({ success: true, data: json });
        } catch (e: any) {
          writeLog('[更新] JSON解析失败: ' + e.message);
          resolve({ success: false, error: 'JSON解析失败: ' + e.message });
        }
      });
    }).on('error', (e: any) => {
      writeLog('[更新] 请求失败: ' + e.message);
      resolve({ success: false, error: e.message });
    });
  });
});

ipcMain.handle('get-app-version', () => APP_VERSION || app.getVersion() || '1.0.0');

let updateShutdownHook: string | null = null;
let isUpdateDownloading: boolean = false;
let shouldCancelUpdateDownload: boolean = false;
const UPDATE_BASE_URL = 'https://dl.caellab.com/file/games/gpcl';
const UPDATE_SHA1_URL = 'https://dl.caellab.com/file/games/gpcl/GPCL.sha1';

function getUpdateInstallerPath(version: string): string {
  return path.join(UPDATA_DIR, `GPCL-${version}-Setup.exe`);
}

function computeFileSHA1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data: any) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

ipcMain.handle('get-update-installer-path', (_: any, version: string) => getUpdateInstallerPath(version));

ipcMain.handle('download-update', async (event: any, version: string) => {
  if (isUpdateDownloading) return { success: false, error: '已有更新下载进行中' };
  const downloadUrl = `${UPDATE_BASE_URL}/GPCL-${version}-Setup.exe`;
  const destPath = getUpdateInstallerPath(version);
  writeLog(`[更新] 开始下载更新: ${version}`);
  writeLog(`[更新] 下载URL: ${downloadUrl}`);
  writeLog(`[更新] 保存路径: ${destPath}`);
  if (!fs.existsSync(UPDATA_DIR)) fs.mkdirSync(UPDATA_DIR, { recursive: true });
  isUpdateDownloading = true;
  shouldCancelUpdateDownload = false;
  return new Promise((resolve) => {
    let finished = false;
    const doDownload = (url: string) => {
      const protocol = url.startsWith('https') ? https : http;
      const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } };
      const req = protocol.get(url, options, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          writeLog(`[更新] 重定向到: ${res.headers.location}`);
          doDownload(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { finished = true; isUpdateDownloading = false; resolve({ success: false, error: `HTTP ${res.statusCode}` }); return; }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk: Buffer) => {
          if (shouldCancelUpdateDownload) { req.destroy(); file.destroy(); if (!finished) { finished = true; isUpdateDownloading = false; try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {} resolve({ success: false, cancelled: true }); } return; }
          downloaded += chunk.length;
          file.write(chunk);
          const percent = totalBytes > 0 ? Math.floor((downloaded / totalBytes) * 100) : 0;
          if (mainWindow) mainWindow.webContents.send('update-download-progress', { percent, bytesDownloaded: downloaded, totalBytes });
        });
        res.on('end', () => { file.end(() => { if (!finished) { finished = true; isUpdateDownloading = false; writeLog(`[更新] 下载完成: ${downloaded} bytes`); resolve({ success: true, filePath: destPath, size: downloaded }); } }); });
        res.on('error', (err: any) => { file.destroy(); if (!finished) { finished = true; isUpdateDownloading = false; try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {} resolve({ success: false, error: err.message }); } });
        file.on('error', (err: any) => { if (!finished) { finished = true; isUpdateDownloading = false; resolve({ success: false, error: err.message }); } });
      });
      req.on('error', (err: any) => { if (!finished) { finished = true; isUpdateDownloading = false; try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {} resolve({ success: false, error: err.message }); } });
      req.setTimeout(600000, () => { req.destroy(); if (!finished) { finished = true; isUpdateDownloading = false; try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (e) {} resolve({ success: false, error: '下载超时' }); } });
    };
    doDownload(downloadUrl);
  });
});

ipcMain.handle('cancel-update-download', () => { shouldCancelUpdateDownload = true; writeLog('[更新] 用户取消更新下载'); return { success: true }; });

ipcMain.handle('verify-update-sha1', async (_: any, filePath: string) => {
  try {
    writeLog(`[更新] 开始SHA1校验: ${filePath}`);
    if (!fs.existsSync(filePath)) { writeLog('[更新] 文件不存在，跳过校验'); return { success: false, error: '文件不存在' }; }
    let expectedSHA1: string | null = null;
    try {
      const sha1Content = await new Promise<string>((resolve, reject) => {
        const req = https.get(UPDATE_SHA1_URL, { timeout: 15000 }, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => resolve(data.trim()));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
      });
      expectedSHA1 = sha1Content.split(/\s+/)[0].toLowerCase();
      writeLog(`[更新] 期望SHA1: ${expectedSHA1}`);
    } catch (e: any) { writeLog(`[更新] 获取SHA1校验文件失败: ${e.message}，跳过校验`); return { success: true, skipped: true }; }
    if (!expectedSHA1 || expectedSHA1.length !== 40) { writeLog(`[更新] SHA1格式无效 (${expectedSHA1})，跳过校验`); return { success: true, skipped: true }; }
    const actualSHA1 = await computeFileSHA1(filePath);
    writeLog(`[更新] 实际SHA1: ${actualSHA1}`);
    if (actualSHA1 === expectedSHA1) { writeLog('[更新] SHA1校验通过'); return { success: true, verified: true }; }
    else { writeLog('[更新] SHA1校验失败'); return { success: false, error: 'SHA1校验失败', expected: expectedSHA1, actual: actualSHA1 }; }
  } catch (e: any) { writeLog(`[更新] SHA1校验异常: ${e.message}，跳过校验`); return { success: true, skipped: true }; }
});

ipcMain.handle('execute-update-installer', (_: any, installerPath: string) => {
  try {
    writeLog(`[更新] 执行安装程序: ${installerPath}`);
    if (!fs.existsSync(installerPath)) return { success: false, error: '安装程序不存在' };
    spawn(installerPath, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return { success: true };
  } catch (e: any) { writeLog(`[更新] 执行安装程序失败: ${e.message}`); return { success: false, error: e.message }; }
});

ipcMain.handle('set-update-shutdown-hook', (_: any, installerPath: string) => { updateShutdownHook = installerPath; writeLog(`[更新] 已设置关闭钩子: ${installerPath}`); return { success: true }; });

app.on('before-quit', () => {
  if (updateShutdownHook) {
    try { writeLog(`[更新] 触发关闭钩子，执行安装程序: ${updateShutdownHook}`); spawn(updateShutdownHook, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch (e: any) { writeLog(`[更新] 关闭钩子执行失败: ${e.message}`); }
    updateShutdownHook = null;
  }
});

ipcMain.handle('open-external', (_: any, url: string) => { try { shell.openExternal(url); return { success: true }; } catch (e: any) { writeLog('[外部链接] 打开失败: ' + e.message); return { success: false, error: e.message }; } });

ipcMain.handle('open-folder', async (_: any, folderPath: string) => { try { if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true }); await shell.openPath(folderPath); return { success: true }; } catch (e: any) { writeLog('[文件夹] 打开失败: ' + e.message); return { success: false, error: e.message }; } });

// ========== Microsoft 正版登录 ==========
const AUTH_BASE = 'https://api.caellab.com/gamets/gpcl/auth';
const AUTH_POLL_INTERVAL = 1000; // 1s
const AUTH_TIMEOUT = 120000; // 2min

ipcMain.handle('start-microsoft-auth', async () => {
  try {
    const state: string = crypto.randomBytes(32).toString('hex');
    const startUrl: string = `${AUTH_BASE}/start.php?state=${state}`;
    const resultUrl: string = `${AUTH_BASE}/result.php?state=${state}`;

    writeLog(`[正版登录] 开始认证, state=${state}`);
    writeLog(`[正版登录] 启动 URL: ${startUrl}`);

    // 打开浏览器跳转到微软登录
    shell.openExternal(startUrl);

    // 轮询获取结果
    const startTime: number = Date.now();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    return new Promise<void>((resolve) => {
      pollTimer = setInterval(async () => {
        try {
          // 超时检查
          if (Date.now() - startTime > AUTH_TIMEOUT) {
            writeLog('[正版登录] 超时');
            if (pollTimer) clearInterval(pollTimer);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('microsoft-auth-result', {
                status: 'timeout',
                message: '登录超时，请重试'
              });
            }
            resolve();
            return;
          }

          // 请求 result.php
          const result: any = await new Promise<any>((res, rej) => {
            const req = https.get(resultUrl, { timeout: 5000 }, (resp) => {
              let data = '';
              resp.on('data', (chunk: string) => data += chunk);
              resp.on('end', () => {
                try { res(JSON.parse(data)); }
                catch { rej(new Error('解析失败')); }
              });
            });
            req.on('error', rej);
            req.on('timeout', () => { req.destroy(); rej(new Error('请求超时')); });
          });

          if (result.status === 'success' || result.status === 'error') {
            writeLog(`[正版登录] 收到结果: status=${result.status}, username=${result.username || ''}`);
            if (pollTimer) clearInterval(pollTimer);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('microsoft-auth-result', result);
            }
            resolve();
          }
          // status === 'pending' 则继续轮询
        } catch (e: any) {
          writeLog(`[正版登录] 轮询请求失败: ${e.message}`);
          // 继续轮询，不中断
        }
      }, AUTH_POLL_INTERVAL);
    });
  } catch (e: any) {
    writeLog(`[正版登录] 启动失败: ${e.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('microsoft-auth-result', {
        status: 'error',
        message: `启动认证失败: ${e.message}`
      });
    }
  }
});

ipcMain.handle('uninstall-java', async (_: any, javaVersion: string) => {
  try {
    const runtimeDir = getJavaRuntimeDir(javaVersion);
    writeLog(`[Java] 开始卸载 Java ${javaVersion}，目录: ${runtimeDir}`);
    if (!fs.existsSync(runtimeDir)) return { success: false, error: `Java ${javaVersion} 未安装` };
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    writeLog(`[Java] Java ${javaVersion} 已卸载，目录已删除: ${runtimeDir}`);
    if (mainWindow) mainWindow.webContents.send('java-uninstalled', { javaVersion });
    return { success: true };
  } catch (e: any) { writeLog(`[Java] 卸载 Java ${javaVersion} 失败: ${e.message}`); return { success: false, error: e.message }; }
});

ipcMain.handle('get-java-mirror-settings', () => {
  try {
    const settingsPath = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return { mirror: 'tsinghua', customUrl: '' };
  } catch (e) { return { mirror: 'tsinghua', customUrl: '' }; }
});

ipcMain.handle('get-java-download-url', async (_: any, javaVersion: string) => {
  try {
    const settingsPath = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    let settings: any = { mirror: 'tsinghua', customUrl: '' };
    if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const url = getJavaDownloadUrl(javaVersion, settings.mirror, settings.customUrl);
    writeLog(`[Java] 获取下载URL: Java ${javaVersion} - ${url}`);
    return { success: true, url };
  } catch (e: any) { writeLog(`[Java] 获取下载URL失败: ${e.message}`); return { success: false, error: e.message }; }
});

async function fetchJavaDownloadUrlFromAPI(javaVersion: string): Promise<string | null> {
  try {
    writeLog(`[Java] 通过 Adoptium API 获取 Java ${javaVersion} 下载地址...`);
    const apiUrl = `https://api.adoptium.net/v3/assets/latest/${javaVersion}/hotspot?image_type=jre&architecture=x64&os=windows`;
    const data = await fetchText(apiUrl);
    const json = JSON.parse(data);
    if (json && json.length > 0 && json[0].binary?.package?.link) {
      const url = json[0].binary.package.link;
      writeLog(`[Java] Adoptium API 返回 URL: ${url}`);
      return url;
    }
    writeLog(`[Java] Adoptium API 未返回有效下载链接`);
    return null;
  } catch (e: any) {
    writeLog(`[Java] Adoptium API 请求失败: ${e.message}`);
    return null;
  }
}

function getJavaDownloadUrl(javaVersion: string, mirror: string, customUrl: string): string {
  const tsinghuaMirrors: Record<string, string> = {
    "8": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jre/x64/windows/OpenJDK8U-jre_x64_windows_hotspot_8u492b09.zip",
    "17": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/x64/windows/OpenJDK17U-jre_x64_windows_hotspot_17.0.19_10.zip",
    "21": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jre/x64/windows/OpenJDK21U-jre_x64_windows_hotspot_21.0.12_8.zip",
    "25": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/25/jre/x64/windows/OpenJDK25U-jre_x64_windows_hotspot_25.0.3_9.zip"
  };
  if (mirror === 'custom' && customUrl) {
    let url = customUrl;
    url = url.replace(/\{v\}/gi, javaVersion);
    const versionMap: Record<string, string> = { "8": "8u492b09", "17": "17.0.19_10", "21": "21.0.12_8", "25": "25.0.3_9" };
    url = url.replace(/\{version\}/gi, versionMap[javaVersion] || javaVersion);
    return url;
  }
  return tsinghuaMirrors[javaVersion] || tsinghuaMirrors["17"];
}

function saveJavaMirrorSettings(mirror: string, customUrl: string): boolean {
  try {
    const settingsDir = path.join(GAME_DIR, 'settings');
    if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'java_mirror.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ mirror, customUrl }, null, 2));
    writeLog(`[Java] 镜像源设置已保存: ${mirror}`);
    return true;
  } catch (e: any) { writeLog(`[Java] 保存镜像源设置失败: ${e.message}`); return false; }
}


ipcMain.handle('cancel-download-only', async () => {
  writeLog('[取消下载] 开始取消下载流程');

  shouldCancelDownload = true;

  const pendingCount: number = downloadQueue.length;
  downloadQueue = [];
  writeLog(`[取消下载] 已清空 ${pendingCount} 个待处理下载任务`);

  const waitStart: number = Date.now();
  while (activeDownloads > 0 && (Date.now() - waitStart) < 2000) {
    await new Promise<void>(r => setTimeout(r, 100));
  }
  writeLog(`[取消下载] 活跃下载数: ${activeDownloads}`);
  
  if ((isDownloading && currentDownloadVersion) || isJavaDownloading) {
    try {
      if (currentDownloadType === 'game' && currentDownloadPath) {
        
        const versionDir: string = currentDownloadPath;
        if (fs.existsSync(versionDir)) {
          const files: string[] = fs.readdirSync(versionDir);
          for (const file of files) {
            const filePath: string = path.join(versionDir, file);
            try {
              if (fs.statSync(filePath).isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch (e: any) {
              writeLog(`清理文件失败: ${filePath} - ${e.message}`);
            }
          }
        }
        writeLog(`[取消下载] 已清理游戏版本下载目录: ${versionDir}`);
      } else if (currentDownloadType === 'java' && currentDownloadPath) {
        
        const javaFile: string = currentDownloadPath;
        if (fs.existsSync(javaFile)) {
          try {
            fs.unlinkSync(javaFile);
            writeLog(`[取消下载] 已清理Java下载文件: ${javaFile}`);
          } catch (e: any) {
            writeLog(`清理Java文件失败: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      console.error('清理下载失败:', e);
      writeLog(`清理下载失败: ${e.message}`);
    }

    isDownloading = false;
    isJavaDownloading = false;
    currentDownloadVersion = null;
    currentDownloadType = null;
    currentDownloadPath = null;
    activeDownloads = 0;
    totalDownloadFiles = 0;
    completedDownloadFiles = 0;
  }

  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('download-cancelled');
  }
  
  writeLog('[取消下载] 取消下载流程完成');
  return { success: true };
});

ipcMain.handle('show-java-install-dialog', async (_, options: any) => {
  try {
    const { mcVersion, recommendedJava } = options;

    const versionPriority: any = {
      [recommendedJava]: 0,
      "17": 1,
      "21": 2,
      "25": 3,
      "8": 4
    };
    
    const sortedVersions: string[] = [...JAVA_VERSIONS_AVAILABLE].sort((a: string, b: string) => {
      return (versionPriority[a] || 99) - (versionPriority[b] || 99);
    });
    
    const result = await new Promise<any>((resolve, reject) => {
      javaDownloadResolve = resolve;
      javaDownloadReject = reject;

      if (mainWindow) {
        mainWindow.webContents.send('show-java-install-dialog', {
          mcVersion,
          recommendedJava,
          availableVersions: sortedVersions
        });
      } else {
        reject(new Error('窗口未初始化'));
      }
    });
    
    return result;
  } catch (e: any) {
    writeLog(`Java安装对话框错误: ${e.message}`);
    return { success: false, cancelled: true };
  }
});

ipcMain.handle('select-java-version', async (_, data: any) => {
  const { selectedVersion, cancelled } = data;
  
  if (cancelled) {
    if (javaDownloadResolve) {
      javaDownloadResolve({ success: false, cancelled: true });
      javaDownloadResolve = null;
      javaDownloadReject = null;
    }
    return { success: false, cancelled: true };
  }
  
  if (selectedVersion && javaDownloadResolve) {
    javaDownloadResolve({ success: true, selectedVersion });
    javaDownloadResolve = null;
    javaDownloadReject = null;
    return { success: true, selectedVersion };
  }
  
  return { success: false, cancelled: true };
});

async function downloadAndInstallJava(javaVersion: string): Promise<any> {
  const runtimeDir: string = getJavaRuntimeDir(javaVersion);
  
  writeLog(`[Java] 开始安装 Java ${javaVersion} 运行时`);
  
  try {
    
    if (fs.existsSync(runtimeDir)) {
      const exe: string | null = findJavaExecutable(runtimeDir);
      if (exe) {
        writeLog(`[Java] Java ${javaVersion} 已存在，无需下载`);
        return { success: true, javaPath: exe };
      }
    }

    const settingsPath: string = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    let settings: any = { mirror: 'tsinghua', customUrl: '' };
    
    try {
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e: any) {}

    // 优先通过 Adoptium API 获取最新下载地址
    let downloadUrl: string | null = null;
    if (settings.mirror !== 'custom') {
      try {
        downloadUrl = await fetchJavaDownloadUrlFromAPI(javaVersion);
      } catch (e: any) {
        writeLog(`[Java] Adoptium API 获取失败: ${e.message}`);
      }
    }

    // API 失败则使用配置的镜像源
    if (!downloadUrl) {
      downloadUrl = getJavaDownloadUrl(javaVersion, settings.mirror, settings.customUrl);
      writeLog(`[Java] 使用镜像源: ${settings.mirror}, URL: ${downloadUrl}`);
    } else {
      writeLog(`[Java] 使用 Adoptium API URL: ${downloadUrl}`);
    }

    const result = await downloadJavaWithWebContents(javaVersion, downloadUrl);
    
    // 如果第一个源下载失败，尝试备用源
    if (!result.success && !result.error?.includes('取消')) {
      writeLog(`[Java] 首个下载源失败: ${result.error}，尝试备用源...`);
      const fallbackUrl = getJavaDownloadUrl(javaVersion, 'tsinghua', '');
      if (fallbackUrl !== downloadUrl) {
        writeLog(`[Java] 尝试备用源: ${fallbackUrl}`);
        const fallbackResult = await downloadJavaWithWebContents(javaVersion, fallbackUrl);
        return fallbackResult;
      }
    }
    
    return result;
    
  } catch (e: any) {
    writeLog(`[Java] Java ${javaVersion} 安装失败: ${e.message}`);

    if (fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (e2: any) {}
    }
    
    return { success: false, error: e.message };
  }
}

async function downloadJavaWithWebContents(javaVersion: string, downloadUrl: string): Promise<any> {
  const runtimeName: string = JAVA_RUNTIME_MAP[javaVersion];
  const runtimeDir: string = getJavaRuntimeDir(javaVersion);
  const tempDir: string = path.join(CACHE_DIR, 'java_temp');
  const tempFile: string = path.join(tempDir, `java-${javaVersion}.zip`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  writeLog(`[Java] 使用Electron下载 Java ${javaVersion}: ${downloadUrl}`);

  currentDownloadVersion = `java-${javaVersion}`;
  currentDownloadType = 'java';
  currentDownloadPath = tempFile;
  shouldCancelDownload = false;
  isJavaDownloading = true;

  return new Promise<any>((resolve, reject) => {
    const win: any = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) {
      isJavaDownloading = false;
      currentDownloadVersion = null;
      currentDownloadType = null;
      currentDownloadPath = null;
      reject(new Error('没有可用的窗口'));
      return;
    }

    win.webContents.downloadURL(downloadUrl, true);

    win.webContents.session.once('will-download', (event: any, item: any) => {
      
      item.setSavePath(tempFile);
      
      const totalBytes: number = item.getTotalBytes();
      writeLog(`[Java] 开始下载，总大小: ${totalBytes} bytes`);

      item.on('updated', (event: any, state: string) => {
        if (state === 'progressing') {
          const received: number = item.getReceivedBytes();
          const percent: number = totalBytes > 0 ? Math.floor((received / totalBytes) * 100) : 0;
          
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('download-progress', {
              label: `Java ${javaVersion}`,
              percent: percent,
              bytesDownloaded: received,
              current: completedDownloadFiles,
              total: totalDownloadFiles
            });
          }

          if (shouldCancelDownload) {
            item.cancel();
            writeLog(`[Java] 下载已取消`);
          }
        }
      });

      item.on('done', (event: any, state: string) => {
        if (state === 'cancelled') {
          isJavaDownloading = false;
          currentDownloadVersion = null;
          currentDownloadType = null;
          currentDownloadPath = null;
          reject(new Error('下载已取消'));
          return;
        }

        if (state === 'interrupted') {
          isJavaDownloading = false;
          currentDownloadVersion = null;
          currentDownloadType = null;
          currentDownloadPath = null;
          reject(new Error('网络连接中断，请检查网络后重试'));
          return;
        }

        if (state === 'completed') {
          writeLog(`[Java] 下载完成，开始验证...`);

          const fileStats = fs.statSync(tempFile);
          const fileSize: number = fileStats.size;
          writeLog(`[Java] 下载文件大小: ${fileSize} bytes`);
          
          if (fileSize < 1024) {
            // 可能下载到了拦截页面，尝试读取内容判断
            let hint = '';
            try {
              const content = fs.readFileSync(tempFile, 'utf8').slice(0, 200);
              if (content.includes('<html') || content.includes('<!DOCTYPE')) {
                hint = '（下载到了网页而非ZIP文件，镜像源可能不可用）';
              }
            } catch (e) {}
            reject(new Error(`下载失败：文件太小 (${fileSize} bytes)${hint}`));
            return;
          }

          const header: Buffer = Buffer.alloc(4);
          const fd: number = fs.openSync(tempFile, 'r');
          fs.readSync(fd, header, 0, 4, 0);
          fs.closeSync(fd);
          
          if (header.toString('hex') !== '504b0304') {
            let hint = '';
            try {
              const content = fs.readFileSync(tempFile, 'utf8').slice(0, 500);
              if (content.includes('<html') || content.includes('<!DOCTYPE')) {
                hint = '（文件内容是HTML页面，镜像源返回了拦截页面）';
              } else {
                hint = `（文件头: ${header.toString('hex')}，内容: ${content.slice(0, 100)}）`;
              }
            } catch (e) {}
            reject(new Error(`下载失败：文件不是有效的ZIP格式${hint}`));
            return;
          }
          
          writeLog(`[Java] 文件验证通过，大小: ${fileSize} bytes`);

          const parentDir: string = path.dirname(runtimeDir);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          
          if (fs.existsSync(runtimeDir)) {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
          }
          
          try {
            const AdmZip: any = require('adm-zip');
            const zip: any = new AdmZip(tempFile);
            zip.extractAllTo(parentDir, false);
            writeLog(`[Java] 解压完成`);
          } catch (zipError: any) {
            reject(new Error(`解压失败: ${zipError.message}`));
            return;
          }

          const entries: string[] = fs.readdirSync(parentDir);
          let extractedDir: string | null = null;
          for (const entry of entries) {
            const entryPath: string = path.join(parentDir, entry);
            if (fs.statSync(entryPath).isDirectory()) {
              if (entry.includes('jdk') || entry.includes('jre')) {
                const binPath: string = path.join(entryPath, 'bin', 'java.exe');
                if (fs.existsSync(binPath)) {
                  extractedDir = entryPath;
                  writeLog(`[Java] 找到目录: ${entry}`);
                  break;
                }
              }
            }
          }
          
          if (extractedDir && extractedDir !== runtimeDir) {
            if (fs.existsSync(runtimeDir)) {
              fs.rmSync(runtimeDir, { recursive: true, force: true });
            }
            fs.renameSync(extractedDir, runtimeDir);
            writeLog(`[Java] 已重命名为: ${runtimeName}`);
          }

          try {
            fs.unlinkSync(tempFile);
          } catch (e: any) {}

          const javaPath: string | null = findJavaExecutable(runtimeDir);
          if (!javaPath) {
            reject(new Error('Java运行时安装失败，未找到java.exe'));
            return;
          }
          
          writeLog(`[Java] Java ${javaVersion} 安装成功: ${javaPath}`);
          isJavaDownloading = false;
          currentDownloadVersion = null;
          currentDownloadType = null;
          currentDownloadPath = null;
          resolve({ success: true, javaPath });
        } else {
          isJavaDownloading = false;
          currentDownloadVersion = null;
          currentDownloadType = null;
          currentDownloadPath = null;
          reject(new Error(`下载失败: ${state}`));
        }
      });
    });

    setTimeout(() => {
      if (isJavaDownloading) {
        writeLog(`[Java] 下载超时`);
        isJavaDownloading = false;
        currentDownloadVersion = null;
        currentDownloadType = null;
        currentDownloadPath = null;
        reject(new Error('下载超时'));
      }
    }, 600000);
  }).catch((e: any) => {
    writeLog(`[Java] Java ${javaVersion} 安装失败: ${e.message}`);
    if (fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (e2: any) {}
    }
    return { success: false, error: e.message };
  });
}


async function getJavaRuntimeDownloadInfo(javaVersion: string): Promise<any> {
  try {
    const runtimeKey: string = JAVA_DOWNLOAD_KEYS[javaVersion];
    if (!runtimeKey) {
      writeLog(`[Java] 不支持的Java版本: ${javaVersion}`);
      return null;
    }
    
    writeLog(`[Java] 正在查找 Java ${javaVersion} (${runtimeKey}) 的下载信息...`);

    // 优先通过 Adoptium API 获取最新下载地址
    try {
      const apiUrl = `https://api.adoptium.net/v3/assets/latest/${javaVersion}/hotspot?image_type=jre&architecture=x64&os=windows`;
      const data = await fetchText(apiUrl);
      const json = JSON.parse(data);
      if (json && json.length > 0 && json[0].binary?.package?.link) {
        const url = json[0].binary.package.link;
        const size = json[0].binary.package.size || null;
        writeLog(`[Java] ✓ Adoptium API 获取成功: ${url}`);
        return { url, name: runtimeKey, sha1: null, size };
      }
    } catch (e: any) {
      writeLog(`[Java] Adoptium API 请求失败: ${e.message}，使用镜像源`);
    }

    // API 失败则使用镜像源
    const runtimeInfo: any = {
      "8": { id: "jre-legacy", url: getJavaDownloadUrl("8", "tsinghua", "") },
      "17": { id: "java-runtime-gamma", url: getJavaDownloadUrl("17", "tsinghua", "") },
      "21": { id: "java-runtime-delta", url: getJavaDownloadUrl("21", "tsinghua", "") },
      "25": { id: "java-runtime-epsilon", url: getJavaDownloadUrl("25", "tsinghua", "") }
    };
    
    const javaInfo: any = runtimeInfo[javaVersion];
    if (javaInfo) {
      writeLog(`[Java] ✓ 使用镜像源 URL: ${javaInfo.url}`);
      return { url: javaInfo.url, name: javaInfo.id, sha1: null, size: null };
    }
    
    writeLog(`[Java] ✗ 无法找到 Java ${javaVersion} 的下载信息`);
    return null;
    
  } catch (e: any) {
    writeLog(`[Java] 获取Java运行时下载信息失败: ${e.message}`);
    return null;
  }
}

function getRecommendedJavaVersion(mcVersion: string): string {

  const parts: string[] = mcVersion.split('.');
  let major: number = parseInt(parts[0], 10);
  let minor: number = parseInt(parts[1], 10);
  let patch: number = parts.length > 2 ? parseInt(parts[2], 10) : 0;

  if (isNaN(major)) major = 1;

  if (isNaN(minor)) {
    
    if (major >= 26) return '25';
    
    if (major >= 21) return '21';
    return '17';
  }

  if (major === 1) {
    if (minor < 17) return '8';
    if (minor === 17) return '17';
    if (minor <= 20) return '17';
    if (minor === 21 && patch <= 4) return '21';
    if (minor === 21 && patch > 4) return '21';
    if (minor >= 22) return '21';
    return '17';
  }

  if (major >= 26) return '25';
  
  if (major >= 21) return '21';
  return '17';
}

function findJavaExecutableInDir(rootDir: string): string | null {
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current: string = stack.pop()!;
    if (!fs.existsSync(current)) continue;
    const javaw: string = path.join(current, 'bin', 'javaw.exe');
    const java: string = path.join(current, 'bin', 'java.exe');
    if (fs.existsSync(javaw)) return javaw;
    if (fs.existsSync(java)) return java;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) stack.push(path.join(current, e.name));
      }
    } catch (e: any) {}
  }
  return null;
}

async function fetchText(url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let finished: boolean = false;

    const fallbackToHttps = (reason: any): void => {
      if (finished) return;
      try {
        const https = require('https');
        const req2 = https.get(url, { timeout: 20000 }, (res2: any) => {
          let body: string = '';
          res2.on('data', (d: any) => body += d);
          res2.on('end', () => { finished = true; resolve(body); });
          res2.on('error', (err2: any) => { if (!finished) { finished = true; reject(err2); } });
        });
        req2.on('timeout', () => { req2.destroy(); if (!finished) { finished = true; reject('超时'); } });
        req2.on('error', (err2: any) => { if (!finished) { finished = true; reject(err2); } });
      } catch (e2: any) {
        if (!finished) { finished = true; reject(e2); }
      }
    };

    try {
      const req = net.request(url);
      const to: any = setTimeout(() => { try { req.abort(); } catch {} ; fallbackToHttps('timeout'); }, 20000);

      req.on('response', (res: any) => {
        clearTimeout(to);
        let body: string = '';
        res.on('data', (d: any) => body += d);
        res.on('end', () => { if (!finished) { finished = true; resolve(body); } });
        res.on('error', (err: any) => { if (!finished) fallbackToHttps(err); });
      });

      req.on('error', (err: any) => { if (!finished) fallbackToHttps(err); });
      req.end();
    } catch (e: any) {
      fallbackToHttps(e);
    }
  });
}

let MAX_CONCURRENT: number = 128;
let downloadQueue: any[] = [];
let activeDownloads: number = 0;
let totalDownloadFiles: number = 0;
let completedDownloadFiles: number = 0;
let currentDownloadSpeed: number = 0;

async function downloadWithPool(url: string, dest: string, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    downloadQueue.push({ url, dest, label, resolve, reject });
    processDownloadQueue();
  });
}

async function processDownloadQueue(): Promise<void> {
  while (downloadQueue.length > 0 && activeDownloads < MAX_CONCURRENT && !shouldCancelDownload) {
    const task: any = downloadQueue.shift();
    activeDownloads++;
    downloadFileInternal(task.url, task.dest, task.label)
      .then(() => {
        task.resolve();
      })
      .catch((err: any) => {
        task.reject(err);
      })
      .finally(() => {
        activeDownloads--;
        completedDownloadFiles++;
        processDownloadQueue();
      });
  }

  if (shouldCancelDownload) {
    while (downloadQueue.length > 0) {
      const task: any = downloadQueue.shift();
      task.reject(new Error('下载已取消'));
    }
    
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('download-cancelled');
    }
  }
}

async function downloadFile(url: string, dest: string, label: string): Promise<void> {
  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest);
    if (stat.size > 1024) {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('download-progress', {
          label,
          percent: 100,
          current: completedDownloadFiles,
          total: totalDownloadFiles
        });
      }
      return;
    }
  }
  await downloadWithPool(url, dest, label);
}

async function downloadFileInternal(url: string, dest: string, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const dir: string = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(dest, { encoding: undefined as any });
    let loaded: number = 0;
    let total: number = 0;

    const fallbackToHttps = (reason: any): void => {
      writeLog(`[下载] ${label} HTTP请求失败: ${reason}，尝试HTTPS`);
      try {
        const https = require('https');
        
        const options: any = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
        
        const req2 = https.get(url, options, (res2: any) => {
          
          if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
            writeLog(`[下载] ${label} 重定向到: ${res2.headers.location}`);
            file.close();
            
            downloadFileInternal(res2.headers.location, dest, label).then(resolve).catch(reject);
            return;
          }
          
          total = parseInt(res2.headers['content-length'] || '0', 10);

          const contentType: string = res2.headers['content-type'] || '';
          if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
            writeLog(`[下载] ${label} 警告: 内容类型是 ${contentType}，可能不是ZIP文件`);
          }
          
          writeLog(`[下载] ${label} 开始下载，大小: ${total} bytes`);
          
          res2.on('data', (d: any) => {
            if (shouldCancelDownload) {
              req2.destroy();
              file.destroy();
              reject(new Error('下载已取消'));
              return;
            }
            loaded += d.length;
            file.write(d);
            const p: number = total > 0 ? Math.floor((loaded / total) * 100) : 0;
            for (const w of BrowserWindow.getAllWindows()) {
              w.webContents.send('download-progress', {
                label,
                percent: p,
                bytesDownloaded: loaded,
                current: completedDownloadFiles,
                total: totalDownloadFiles
              });
            }
          });
          res2.on('end', () => {
            file.end();
            writeLog(`[下载] ${label} 下载完成，实际大小: ${loaded} bytes`);
            resolve();
          });
          res2.on('error', (err2: any) => {
            file.destroy();
            reject(err2);
          });
        });
        req2.on('timeout', () => { req2.destroy(); reject('超时'); });
        req2.on('error', (err2: any) => {
          file.destroy();
          reject(err2);
        });
      } catch (e2: any) {
        file.destroy();
        reject(e2);
      }
    };

    try {
      const req = net.request(url);
      const to: any = setTimeout(() => { try { req.abort(); } catch {} ; fallbackToHttps('timeout'); }, 60000);

      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      req.on('response', (res: any) => {
        clearTimeout(to);

        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          writeLog(`[下载] ${label} 重定向到: ${res.headers.location}`);
          file.close();
          
          downloadFileInternal(res.headers.location, dest, label).then(resolve).catch(reject);
          return;
        }
        
        total = parseInt(res.headers['content-length'] || '0', 10);

        const contentType: string = res.headers['content-type'] || '';
        if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
          writeLog(`[下载] ${label} 警告: 内容类型是 ${contentType}，可能不是ZIP文件`);
        }
        
        writeLog(`[下载] ${label} 开始下载，大小: ${total} bytes`);
        
        res.on('data', (d: any) => {
          if (shouldCancelDownload) {
            try { req.abort(); } catch {}
            file.destroy();
            reject(new Error('下载已取消'));
            return;
          }
          loaded += d.length;
          file.write(d);
          const p: number = total > 0 ? Math.floor((loaded / total) * 100) : 0;
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('download-progress', {
              label,
              percent: p,
              bytesDownloaded: loaded,
              current: completedDownloadFiles,
              total: totalDownloadFiles
            });
          }
        });
        res.on('end', () => {
          file.end();
          writeLog(`[下载] ${label} 下载完成，实际大小: ${loaded} bytes`);
          resolve();
        });
        res.on('error', (err: any) => {
          file.destroy();
          fallbackToHttps(err);
        });
      });

      req.on('error', (err: any) => {
        file.destroy();
        fallbackToHttps(err);
      });

      req.end();
    } catch (e: any) {
      file.destroy();
      fallbackToHttps(e);
    }
  });
}

async function downloadFileInternalWithTimeout(url: string, dest: string, label: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled: boolean = false;
    const timer: any = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`连接超时 (${timeoutMs / 1000}秒)`));
      }
    }, timeoutMs);

    downloadFileInternal(url, dest, label)
      .then((result: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch((err: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}


async function installVersion(versionId: string, maxConcurrent: number = 20, downloadPath: string | null = null): Promise<any> {
  const targetDir: string = downloadPath || path.join(GAME_DIR, 'versions', versionId);
  const versionDir: string = targetDir;
  const cancelFilePath: string = path.join(versionDir, 'CancelDownload.txt');
  if (fs.existsSync(cancelFilePath)) {
    try { fs.unlinkSync(cancelFilePath); } catch (e: any) {}
  }

  shouldCancelDownload = false;
  isDownloading = true;
  currentDownloadVersion = versionId;
  currentDownloadType = 'game';
  currentDownloadPath = targetDir;
  writeLog(`开始下载：${versionId} 到 ${targetDir}`);

  try {
    MAX_CONCURRENT = maxConcurrent;
    downloadQueue = [];
    activeDownloads = 0;
    totalDownloadFiles = 0;
    completedDownloadFiles = 0;

    const versionDir2: string = path.join(GAME_DIR, 'versions', versionId);
    if (!fs.existsSync(versionDir2)) fs.mkdirSync(versionDir2, { recursive: true });

    const versionJsonPath: string = path.join(versionDir2, versionId + '.json');
    const versionJarPath: string = path.join(versionDir2, versionId + '.jar');

    const manifest: any = JSON.parse(await fetchText('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
    const vInfo: any = manifest.versions.find((v: any) => v.id === versionId);
    if (!vInfo) throw new Error('版本不存在: ' + versionId);

    if (!fs.existsSync(versionJsonPath)) {
      const vData: string = await fetchText(vInfo.url);
      fs.writeFileSync(versionJsonPath, vData);
    }

    const versionData: any = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

    if (!fs.existsSync(versionJarPath)) {
      await downloadFile(versionData.downloads.client.url, versionJarPath, '客户端');
    }

    if (shouldCancelDownload) {
      writeLog(`下载取消：${versionId}`);
      throw new Error('下载已取消');
    }

    const assetIndexPath: string = path.join(GAME_DIR, 'assets', 'indexes', versionData.assetIndex.id + '.json');
    if (!fs.existsSync(assetIndexPath)) {
      await downloadFile(versionData.assetIndex.url, assetIndexPath, '资源索引');
    }

    if (shouldCancelDownload) {
      writeLog(`下载取消：${versionId}`);
      throw new Error('下载已取消');
    }

    let assetIndexData: any;
    for (let i: number = 0; i < 10; i++) {
      try {
        assetIndexData = JSON.parse(fs.readFileSync(assetIndexPath, 'utf8'));
        break;
      } catch (e: any) {
        await new Promise<void>(r => setTimeout(r, 500));
      }
    }
    if (!assetIndexData) throw new Error('无法读取资源索引');

    const toDownload: any[] = [];

    for (const [name, obj] of Object.entries(assetIndexData.objects) as [string, any][]) {
      const hash: string = obj.hash;
      const prefix: string = hash.substring(0, 2);
      const assetPath: string = path.join(GAME_DIR, 'assets', 'objects', prefix, hash);
      if (!fs.existsSync(assetPath)) {
        toDownload.push({
          url: `https://resources.download.minecraft.net/${prefix}/${hash}`,
          dest: assetPath,
          label: `资源: ${name}`
        });
      }
    }

    for (const lib of versionData.libraries) {
      if (lib.downloads?.artifact) {
        const libPath: string = path.join(GAME_DIR, 'libraries', lib.downloads.artifact.path);
        if (!fs.existsSync(libPath)) {
          toDownload.push({
            url: lib.downloads.artifact.url,
            dest: libPath,
            label: `库: ${lib.name}`
          });
        }
      }
      if (lib.downloads?.classifiers) {
        for (const [cls, info] of Object.entries(lib.downloads.classifiers) as [string, any][]) {
          if (cls.includes('natives-windows')) {
            const libPath: string = path.join(GAME_DIR, 'libraries', info.path);
            if (!fs.existsSync(libPath)) {
              toDownload.push({
                url: info.url,
                dest: libPath,
                label: `原生库: ${lib.name}`
              });
            }
          }
        }
      }
    }

    totalDownloadFiles = toDownload.length;
    completedDownloadFiles = 0;

    const downloadPromises: Promise<void>[] = toDownload.map((item: any) => downloadFile(item.url, item.dest, item.label));
    await Promise.all(downloadPromises);

    const nativesDir: string = path.join(GAME_DIR, 'versions', versionId, 'natives');
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

    for (const lib of versionData.libraries) {
      if (lib.downloads?.classifiers) {
        for (const [cls, info] of Object.entries(lib.downloads.classifiers) as [string, any][]) {
          if (cls.includes('natives-windows')) {
            const libPath: string = path.join(GAME_DIR, 'libraries', info.path);
            if (fs.existsSync(libPath)) {
              const AdmZip: any = require('adm-zip');
              const zip: any = new AdmZip(libPath);
              zip.extractAllTo(nativesDir, true);
            }
          }
        }
      }
    }

    if (shouldCancelDownload) {
      writeLog(`下载取消：${versionId}`);
      throw new Error('下载已取消');
    }

    writeLog(`下载完成：${versionId}`);

    updateVersionLastPlayed(versionId, targetDir);
    
    return { success: true };
  } catch (e: any) {
    writeLog(`下载失败：${versionId} - ${e.message}`);
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
        writeLog(`已删除下载失败的文件夹：${targetDir}`);
      } catch (delErr: any) {
        writeLog(`删除文件夹失败：${delErr.message}`);
      }
    }
    return { success: false, error: e.message };
  } finally {
    isDownloading = false;
    currentDownloadVersion = null;
    currentDownloadType = null;
    currentDownloadPath = null;
    shouldCancelDownload = false;
    downloadQueue = [];
    activeDownloads = 0;
    totalDownloadFiles = 0;
    completedDownloadFiles = 0;
  }
}

function updateVersionLastPlayed(versionId: string, targetDir?: string): void {
  try {
    const versionDir: string = targetDir || path.join(GAME_DIR, 'versions', versionId);
    const gpclDir: string = path.join(versionDir, 'gpcl');
    const configPath: string = path.join(gpclDir, 'config.json');
    
    let settings: any = {};

    if (fs.existsSync(configPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e: any) {
        settings = {};
      }
    }

    settings.lastPlayed = new Date().toISOString();

    if (!fs.existsSync(gpclDir)) {
      fs.mkdirSync(gpclDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    writeLog(`[版本] ${versionId} 最后启动时间已更新: ${settings.lastPlayed}`);
    
  } catch (e: any) {
    writeLog(`[版本] 更新 ${versionId} 最后启动时间失败: ${e.message}`);
  }
}

ipcMain.handle('scan-versions', async (_, gameDir?: string, silent: boolean = false) => {
  const targetDir: string = gameDir ? path.resolve(gameDir) : GAME_DIR;
  const versionsDir: string = path.join(targetDir, 'versions');
  if (!fs.existsSync(versionsDir)) {
    if (!silent) writeLog('扫描本地版本：未找到versions目录');
    return [];
  }
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versions: string[] = [];
  const skippedVersions: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const versionDir: string = path.join(versionsDir, entry.name);
      try {
        const files: string[] = fs.readdirSync(versionDir);

        if (files.length === 1 && files[0] === 'CancelDownload.txt') {
          skippedVersions.push(entry.name);
          if (!silent) writeLog(`扫描本地版本：跳过空目录 "${entry.name}"（仅包含 CancelDownload.txt）`);
          continue;
        }

        const jsonFiles: string[] = files.filter((f: string) => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
          skippedVersions.push(entry.name);
          if (!silent) writeLog(`扫描本地版本：跳过 "${entry.name}"（无 .json 文件）`);
          continue;
        }


        
        const baseVersionId: string = entry.name; 
        const mcVersion: string = baseVersionId; 

        if (jsonFiles.includes(`${baseVersionId}.json`)) {
          versions.push(baseVersionId);
        }

        for (const jsonFile of jsonFiles) {
          const jsonVersionId: string = jsonFile.replace('.json', '');
          
          if (jsonVersionId !== baseVersionId && !versions.includes(jsonVersionId)) {
            versions.push(jsonVersionId);
          }
        }
        
      } catch (e: any) {
        writeLog(`扫描本地版本：读取目录 "${entry.name}" 失败 - ${e.message}`);
      }
    }
  }
  
  if (skippedVersions.length > 0 && !silent) {
    writeLog(`扫描本地版本：跳过 ${skippedVersions.length} 个无效目录 - [${skippedVersions.join(', ')}]`);
  }
  if (!silent) writeLog(`扫描本地版本：共 ${versions.length} 个版本 - [${versions.join(', ')}]`);
  return versions;
});

ipcMain.handle('get-version-manifest', async () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cacheFile: string = path.join(CACHE_DIR, 'version_manifest.json');

    let data: string | undefined;
    let fromCache: boolean = false;
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const age: number = Date.now() - stat.mtimeMs;
      if (age < 10 * 60 * 1000) {
        data = fs.readFileSync(cacheFile, 'utf8');
        fromCache = true;
      }
    }

    if (!data) {
      try {
        data = await fetchText('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        fs.writeFileSync(cacheFile, data);
        writeLog('远程拉取版本列表：成功');
      } catch (e: any) {
        writeLog(`远程拉取版本列表：失败 - ${e.message}`);
        return [];
      }
    } else {
      writeLog(`读取本地缓存版本列表：成功`);
    }

    const parsed: any = JSON.parse(data!);
    
    writeLog(`版本列表：共 ${parsed.versions.length} 个版本`);
    return parsed.versions;
  } catch (e: any) {
    writeLog(`版本列表解析失败：${e.message}`);
    return [];
  }
});

ipcMain.handle('download-version', (event: any, versionId: string, maxConcurrent: number, downloadPath: string) => installVersion(versionId, maxConcurrent, downloadPath));

ipcMain.handle('download-with-modloader', (event: any, versionId: string, loaderType: string, loaderVersion: string, maxConcurrent: number) => 
  installVersionWithModLoader(versionId, loaderType, loaderVersion, maxConcurrent));

ipcMain.handle('get-version-config', (event: any, versionId: string) => readVersionConfig(versionId));
ipcMain.handle('get-version-display-name', (event: any, versionId: string) => generateVersionDisplayName(versionId));
ipcMain.handle('get-launch-display-name', (event: any, versionId: string) => generateLaunchDisplayName(versionId));

ipcMain.handle('delete-version', async (_, versionId: string) => {
  try {
    const versionDir: string = path.join(GAME_DIR, 'versions', versionId);
    
    if (!fs.existsSync(versionDir)) {
      return { success: false, error: '版本不存在' };
    }
    
    writeLog(`[删除版本] 开始删除版本: ${versionId}`);
    
    fs.rmSync(versionDir, { recursive: true, force: true });
    
    writeLog(`[删除版本] 版本 ${versionId} 删除成功`);
    
    return { success: true };
  } catch (e: any) {
    writeLog(`[删除版本] 删除版本失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-version-settings', async (_, versionId: string) => {
  try {
    const versionDir: string = path.join(GAME_DIR, 'versions', versionId);
    const gpclDir: string = path.join(versionDir, 'gpcl');
    const configPath: string = path.join(gpclDir, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      return { success: true, settings: null };
    }
    
    const content: string = fs.readFileSync(configPath, 'utf8');
    const settings: any = JSON.parse(content);
    
    return { success: true, settings };
  } catch (e: any) {
    writeLog(`[版本设置] 读取版本 ${versionId} 设置失败: ${e.message}`);
    return { success: false, error: e.message, settings: null };
  }
});

ipcMain.handle('save-version-settings', async (_, versionId: string, settings: any) => {
  try {
    const versionDir: string = path.join(GAME_DIR, 'versions', versionId);
    const gpclDir: string = path.join(versionDir, 'gpcl');
    
    if (!fs.existsSync(gpclDir)) {
      fs.mkdirSync(gpclDir, { recursive: true });
    }
    
    const configPath: string = path.join(gpclDir, 'config.json');

    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    
    writeLog(`[版本设置] 版本 ${versionId} 设置已保存`);
    
    return { success: true };
  } catch (e: any) {
    writeLog(`[版本设置] 保存版本 ${versionId} 设置失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-game-dir', () => {
  return GAME_DIR;
});

ipcMain.handle('get-player-name', () => {
  try {
    const playerFile: string = path.join(app.getPath('userData'), 'gpcl', 'player.json');
    if (fs.existsSync(playerFile)) {
      const data: any = JSON.parse(fs.readFileSync(playerFile, 'utf8'));
      return data.name || 'GPCL_Player';
    }
  } catch (e: any) {
    console.error('读取玩家名失败:', e);
  }
  return 'GPCL_Player';
});

ipcMain.handle('save-player-name', (_: any, name: string) => {
  try {
    const gpclDir: string = path.join(app.getPath('userData'), 'gpcl');
    if (!fs.existsSync(gpclDir)) fs.mkdirSync(gpclDir, { recursive: true });
    const playerFile: string = path.join(gpclDir, 'player.json');
    fs.writeFileSync(playerFile, JSON.stringify({ name: name || 'GPCL_Player' }));
    return { success: true };
  } catch (e: any) {
    console.error('保存玩家名失败:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
  return { success: true };
});

ipcMain.handle('window-focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
  return { success: true };
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
  return { success: true };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('check-java', async (_, versionOrJavaVersion: string) => {
  try {
    
    const isMcVersion: boolean = versionOrJavaVersion && versionOrJavaVersion.match(/^\d+\.\d+/) as any;
    
    if (isMcVersion) {
      
      const versionId: string = versionOrJavaVersion;
      const jsonPath: string = path.join(GAME_DIR, 'versions', versionId, versionId + '.json');
      if (!fs.existsSync(jsonPath)) {
        return { success: false, error: '版本未下载' };
      }
      
      const versionData: any = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const javaVersion: string = getJavaVersionFromVersionData(versionData);
      const result: any = await checkJavaInstalled(javaVersion);
      
      return {
        success: true,
        installed: result.installed,
        javaVersion: javaVersion,
        javaPath: result.javaPath
      };
    } else {
      
      const javaVersion: string = versionOrJavaVersion;
      const result: any = await checkJavaInstalled(javaVersion);
      
      return {
        success: true,
        installed: result.installed,
        javaVersion: javaVersion,
        javaPath: result.javaPath
      };
    }
  } catch (e: any) {
    writeLog(`检查Java失败：${e.message}`);
    return { success: false, error: e.message };
  }
});

function parseMCArguments(template: string, vars: any): string {
  let result: string = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value as string);
  }
  return result;
}

function splitArgs(str: string): string[] {
  const args: string[] = [];
  let current: string = '';
  let inQuotes: boolean = false;
  for (let i: number = 0; i < str.length; i++) {
    const c: string = str[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ' ' && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function checkLibraryRules(rules: any[]): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed: boolean = false;
  for (const rule of rules) {
    let match: boolean = true;
    if (rule.os) {
      const platform: string = os.platform();
      if (rule.os.name === 'windows' && platform !== 'win32') match = false;
      if (rule.os.name === 'linux' && platform !== 'linux') match = false;
      if (rule.os.name === 'osx' && platform !== 'darwin') match = false;
    }
    if (match) {
      allowed = (rule.action === 'allow');
    }
  }
  return allowed;
}

function resolveInheritsFrom(vd: any, gameDir: string): any {
  if (!vd.inheritsFrom) return vd;
  const parentJsonPath: string = path.join(gameDir, 'versions', vd.inheritsFrom, `${vd.inheritsFrom}.json`);
  if (!fs.existsSync(parentJsonPath)) {
    writeLog(`[启动] 警告: inheritsFrom 版本 ${vd.inheritsFrom} 不存在，忽略继承`);
    return vd;
  }
  const parent: any = JSON.parse(fs.readFileSync(parentJsonPath, 'utf8'));
  const resolvedParent: any = resolveInheritsFrom(parent, gameDir);
  
  const merged: any = { ...resolvedParent, ...vd };
  
  const parentLibs: any[] = resolvedParent.libraries || [];
  const childLibs: any[] = vd.libraries || [];
  const libMap: Map<string, any> = new Map();
  for (const lib of parentLibs) {
    libMap.set(lib.name, lib);
  }
  for (const lib of childLibs) {
    libMap.set(lib.name, lib);
  }
  merged.libraries = Array.from(libMap.values());
  
  if (resolvedParent.arguments?.game || vd.arguments?.game) {
    if (!merged.arguments) merged.arguments = {};
    const parentGame: any[] = (resolvedParent.arguments?.game || []).filter((a: any) => typeof a === 'string');
    const childGame: any[] = (vd.arguments?.game || []);
    const childStrings: Set<string> = new Set(childGame.filter((a: any) => typeof a === 'string'));
    const mergedGame: any[] = parentGame.filter((a: any) => !childStrings.has(a)).concat(childGame);
    merged.arguments.game = mergedGame;
  }
  
  writeLog(`[启动] 已解析 inheritsFrom: ${vd.inheritsFrom} -> 合并 ${merged.libraries?.length || 0} 个库`);
  return merged;
}

function buildLaunchArgs(vd: any, gameDir: string, versionId: string, username: string, windowMode: string, memoryMB: number | null, serverIp: string | null, authInfo?: { uuid: string; accessToken: string; userType: string }): any {
  const cp: string[] = [];
  
  const clientJar: string = path.join(gameDir, 'versions', versionId, `${versionId}.jar`);
  if (fs.existsSync(clientJar)) {
    cp.push(clientJar);
  }
  
  let missingLibs: number = 0;
  for (const lib of vd.libraries || []) {
    if (!checkLibraryRules(lib.rules)) continue;
    
    if (lib.downloads?.artifact?.path) {
      const libPath: string = path.join(gameDir, 'libraries', lib.downloads.artifact.path);
      if (fs.existsSync(libPath)) {
        cp.push(libPath);
      } else {
        missingLibs++;
        writeLog(`[启动] 库文件缺失: ${lib.downloads.artifact.path}`);
      }
    }
    
    if (lib.downloads?.classifiers?.['natives-windows']?.path) {
      const nativePath: string = path.join(gameDir, 'libraries', lib.downloads.classifiers['natives-windows'].path);
      if (fs.existsSync(nativePath)) {
        cp.push(nativePath);
      } else {
        missingLibs++;
        writeLog(`[启动] Native库缺失: ${lib.downloads.classifiers['natives-windows'].path}`);
      }
    }
  }
  if (missingLibs > 0) {
    writeLog(`[启动] 警告: ${missingLibs} 个库文件缺失`);
  }

  const nativesDir: string = path.join(gameDir, 'versions', versionId, 'natives');
  const assetsDir: string = path.join(gameDir, 'assets');

  const jvmArgs: string[] = [
    `-Djava.library.path=${nativesDir}`,
    '-cp', cp.join(';'),
  ];

  if (memoryMB) {
    jvmArgs.unshift(`-Xmx${memoryMB}M`);
    writeLog(`[启动] 已设置最大内存: ${memoryMB}M`);
  } else {
    writeLog(`[启动] 未设置内存限制`);
  }

  const vars: any = {
    auth_player_name: username,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: assetsDir,
    assets_index_name: vd.assetIndex?.id || vd.assets || versionId,
    auth_uuid: authInfo?.uuid || '00000000000000000000000000000000',
    auth_access_token: authInfo?.accessToken || 'offline',
    auth_session: authInfo?.accessToken || 'offline',
    user_type: authInfo?.userType || 'legacy',
    user_properties: '{}',
    version_type: 'GPCL'
  };

  let gameArgs: string[] = [];

  if (vd.arguments?.game) {
    for (const arg of vd.arguments.game) {
      if (typeof arg === 'string') {
        gameArgs.push(parseMCArguments(arg, vars));
      }
      
    }
  }
  
  else if (vd.minecraftArguments) {
    const parsed: string = parseMCArguments(vd.minecraftArguments, vars);
    gameArgs = splitArgs(parsed);
  }
  
  else {
    gameArgs = [
      '--username', username,
      '--version', versionId,
      '--gameDir', gameDir,
      '--assetsDir', assetsDir,
      '--assetIndex', vd.assetIndex?.id || vd.assets || versionId,
      '--accessToken', authInfo?.accessToken || 'offline',
      '--userType', authInfo?.userType || 'legacy',
      '--uuid', authInfo?.uuid || '00000000000000000000000000000000'
    ];
  }

  if (windowMode === 'fullscreen') {
    gameArgs.push('--fullscreen');
    writeLog(`[启动] 已添加全屏参数: --fullscreen`);
  } else if (windowMode === 'borderless') {
    
    gameArgs.push('--fullscreen');
    gameArgs.push('--width');
    gameArgs.push('1920');
    gameArgs.push('--height');
    gameArgs.push('1080');
    writeLog(`[启动] 已添加无边框窗口参数: --fullscreen --width 1920 --height 1080`);
  } else if (windowMode === 'minimized') {
    
    writeLog(`[启动] 已设置最小化模式`);
  }

  if (serverIp && serverIp.trim()) {
    const ipParts: string[] = serverIp.trim().split(':');
    const serverAddress: string = ipParts[0];
    const serverPort: string = ipParts[1] || '25565';
    
    gameArgs.push('--server');
    gameArgs.push(serverAddress);
    gameArgs.push('--port');
    gameArgs.push(serverPort);
    
    writeLog(`[启动] 已添加服务器连接参数: --server ${serverAddress} --port ${serverPort}`);
  }

  return { jvmArgs, gameArgs, mainClass: vd.mainClass };
}


ipcMain.handle('launch-minecraft', async (_, opt: any) => {
  try {
    
    launchCancelFlag = false;
    
    const { versionId, username, gameDir: rawGameDir, windowMode } = opt;
    
    const gameDir: string = rawGameDir ? path.resolve(rawGameDir) : GAME_DIR;
    
    const mode: string = windowMode || 'windowed';
    writeLog(`启动游戏：玩家 ${username}，版本 ${versionId}，目录: ${gameDir}，窗口模式: ${mode}`);

    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }
    
    const jsonPath: string = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    if (!fs.existsSync(jsonPath)) {
      writeLog(`启动游戏失败：版本 ${versionId} 未下载`);
      return { success: false, error: '请先下载游戏' };
    }

    const vd_raw: any = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const vd: any = resolveInheritsFrom(vd_raw, gameDir);
    const javaVersion: string = getJavaVersionFromVersionData(vd);

    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    const settings: any = loadSettings();
    let memoryMB: number | null = null;
    let actualWindowMode: string = mode;
    let serverIp: string | null = null;

    try {
      const versionConfigPath: string = path.join(gameDir, 'versions', versionId, 'gpcl', 'config.json');
      if (fs.existsSync(versionConfigPath)) {
        const versionSettings: any = JSON.parse(fs.readFileSync(versionConfigPath, 'utf8'));

        if (versionSettings.memory && versionSettings.memory !== 'global') {
          const memoryVal: number = parseFloat(versionSettings.memory);
          if (!isNaN(memoryVal)) {
            if (versionSettings.memory === '0.5') {
              memoryMB = 512; 
            } else {
              memoryMB = Math.floor(memoryVal * 1024);
            }
            writeLog(`[启动] 使用版本内存设置: ${memoryMB}M`);
          }
        }

        if (versionSettings.windowMode && versionSettings.windowMode !== 'global') {
          actualWindowMode = versionSettings.windowMode;
          writeLog(`[启动] 使用版本窗口模式: ${actualWindowMode}`);
        }

        if (versionSettings.startupMode === 'join' && versionSettings.serverIp) {
          serverIp = versionSettings.serverIp;
          writeLog(`[启动] 使用版本启动模式: 加入服务器 ${serverIp}`);
        }
      }
    } catch (e: any) {
      writeLog(`[启动] 读取版本设置失败: ${e.message}`);
    }

    if (memoryMB === null && settings.game?.memory) {
      const globalMemory: number = parseFloat(settings.game.memory);
      if (!isNaN(globalMemory)) {
        memoryMB = Math.floor(globalMemory * 1024);
        writeLog(`[启动] 使用全局内存设置: ${memoryMB}M`);
      }
    }

    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    let java: string | null = await ensureJavaRuntime(javaVersion);

    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    if (!java) {
      writeLog(`[Java] Java ${javaVersion} 未安装，自动开始下载`);

      if (mainWindow) {
        mainWindow.webContents.send('java-auto-download-start', {
          javaVersion: javaVersion,
          mcVersion: versionId
        });
      }

      const installResult: any = await downloadAndInstallJava(javaVersion);

      if (launchCancelFlag) {
        writeLog('[启动] 用户已取消启动（Java下载完成后）');
        return { success: false, error: '启动已取消', cancelled: true };
      }
      
      if (installResult.success) {
        java = installResult.javaPath;
        writeLog(`[Java] Java ${javaVersion} 安装成功: ${java}`);

        if (mainWindow) {
          mainWindow.webContents.send('java-auto-download-complete', {
            javaVersion: javaVersion,
            javaPath: java
          });
        }
      } else {
        writeLog(`[Java] Java ${javaVersion} 安装失败: ${installResult.error}`);
        return {
          success: false,
          error: `Java ${javaVersion} 安装失败: ${installResult.error}`
        };
      }
    }

    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动（即将启动游戏前）');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    const authInfo: any = opt.authUuid && opt.authAccessToken
      ? { uuid: opt.authUuid, accessToken: opt.authAccessToken, userType: opt.authUserType || 'msa' }
      : undefined;
    const { jvmArgs, gameArgs, mainClass } = buildLaunchArgs(vd, gameDir, versionId, username, actualWindowMode, memoryMB, serverIp, authInfo);
    const args: string[] = [...jvmArgs, mainClass, ...gameArgs];

    writeLog(`[启动] Java: ${java}`);
    writeLog(`[启动] 主类: ${mainClass}`);
    writeLog(`[启动] 窗口模式: ${actualWindowMode}`);
    writeLog(`[启动] 参数数: ${args.length}`);
    writeLog(`[启动] JVM参数: ${JSON.stringify(jvmArgs)}`);
    writeLog(`[启动] 游戏参数: ${JSON.stringify(gameArgs.slice(0, 10))}...`);
    writeLog(`[启动] Classpath条目数: ${jvmArgs[2].split(';').length}`);
    writeLog(`[启动] Classpath总长度: ${jvmArgs[2].length} 字符`);

    let proc: any;
    for (let i: number = 0; i < 3; i++) {
      try {
        proc = spawn(java!, args, { cwd: gameDir, detached: false, windowsHide: false });
        writeLog(`启动游戏成功：PID ${proc.pid}`);
        break;
      } catch (e: any) {
        if (e.code === 'EBUSY' && i < 2) {
          await new Promise<void>(r => setTimeout(r, 1500));
          continue;
        }
        writeLog(`启动游戏失败：${e.message}`);
        return { success: false, error: e.message };
      }
    }

    currentGameProcess = proc;
    currentGamePid = proc.pid;

    if (launchCancelFlag) {
      writeLog('[启动] 进程已启动但取消标志已设置，立即终止');
      killGameProcessTree(proc.pid);
      try { proc.kill(); } catch {}
      currentGameProcess = null;
      currentGamePid = null;
      return { success: false, error: '启动已取消', cancelled: true };
    }

    await detectGameWindow(proc.pid);

    if (launchCancelFlag) {
      writeLog('[启动] 窗口检测结束后检测到取消标志');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    let stdoutData: string = '';
    let stderrData: string = '';
    proc.stdout?.on('data', (d: any) => {
      const text: string = d.toString();
      stdoutData += text;
      if (mainWindow) {
        mainWindow.webContents.send('game-log', text);
      }

      if (text.includes('LWJGL Version') || text.includes('OpenGL version') || text.includes('Window')) {
        writeLog(`[启动] 检测到窗口初始化日志`);
        if (mainWindow) {
          mainWindow.webContents.send('game-window-created', { pid: proc.pid });
        }
      }
    });
    proc.stderr?.on('data', (d: any) => {
      const text: string = d.toString();
      stderrData += text;
      if (mainWindow) {
        mainWindow.webContents.send('game-log', text);
      }

      if (text.includes('LWJGL Version') || text.includes('OpenGL version') || text.includes('Window')) {
        writeLog(`[启动] 检测到窗口初始化日志`);
        if (mainWindow) {
          mainWindow.webContents.send('game-window-created', { pid: proc.pid });
        }
      }
    });
    proc.on('error', (err: any) => {
      writeLog(`[启动] 进程错误: ${err.message}`);
    });
    proc.on('exit', (code: number | null) => {
      writeLog(`[启动] 进程退出，代码: ${code}`);
      if (code !== 0 && stderrData) {
        writeLog(`[启动] 错误输出: ${stderrData.slice(0, 1000)}`);
      }
      if (currentGamePid === proc.pid) {
        currentGameProcess = null;
        currentGamePid = null;
      }
      if (mainWindow) {
        mainWindow.webContents.send('game-closed', code);
      }
    });

    return { success: true, pid: proc.pid };
  } catch (e: any) {
    writeLog(`启动游戏异常：${e.message}`);
    return { success: false, error: e.message };
  }
});

async function detectGameWindow(pid: number): Promise<void> {
  writeLog(`[启动] 开始检测游戏窗口，PID: ${pid}`);

  return new Promise<void>((resolve) => {
    let resolved: boolean = false;
    const done = (): void => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const cancelCheck: any = setInterval(() => {
      if (launchCancelFlag) {
        writeLog(`[启动] 窗口检测期间检测到取消标志，立即终止游戏进程并退出`);
        clearInterval(cancelCheck);
        try { detector.kill(); } catch {}
        killGameProcessTree(pid);
        try {
          if (currentGameProcess) { currentGameProcess.kill(); }
        } catch {}
        currentGameProcess = null;
        currentGamePid = null;
        done();
      }
    }, 100);

    const timeout: any = setTimeout(() => {
      writeLog(`[启动] 游戏窗口检测超时（8秒），继续启动流程`);
      clearInterval(cancelCheck);
      try { detector.kill(); } catch {}
      if (mainWindow && !launchCancelFlag) {
        mainWindow.webContents.send('game-window-created', { pid, timeout: true });
      }
      done();
    }, 8000);

    const script: string = `
      $deadline = (Get-Date).AddSeconds(7)
      while ((Get-Date) -lt $deadline) {
        try {
          $p = Get-Process -Id ${pid} -ErrorAction Stop
          if ($p.MainWindowHandle -ne 0) { Write-Output "FOUND"; exit 0 }
        } catch { Write-Output "GONE"; exit 1 }
        Start-Sleep -Milliseconds 150
      }
      Write-Output "TIMEOUT"; exit 2
    `;
    const detector = spawn('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
    let output: string = '';

    detector.stdout.on('data', (d: any) => { output += d.toString(); });
    detector.stderr.on('data', (d: any) => { output += d.toString(); });

    detector.on('close', (code: number | null) => {
      clearInterval(cancelCheck);
      clearTimeout(timeout);

      if (launchCancelFlag) { done(); return; }

      if (output.includes('FOUND')) {
        writeLog(`[启动] 检测到游戏窗口（MainWindowHandle != 0）`);
      } else if (output.includes('GONE')) {
        writeLog(`[启动] 进程已退出`);
      } else {
        writeLog(`[启动] 窗口检测结束，code=${code}，output=${output.trim()}`);
      }

      if (mainWindow) {
        mainWindow.webContents.send('game-window-created', { pid, windowDetected: output.includes('FOUND') });
      }
      done();
    });

    detector.on('error', (err: any) => {
      clearInterval(cancelCheck);
      clearTimeout(timeout);
      writeLog(`[启动] 窗口检测器启动失败: ${err.message}`);
      if (mainWindow && !launchCancelFlag) {
        mainWindow.webContents.send('game-window-created', { pid, error: true });
      }
      done();
    });
  });
}

ipcMain.handle('install-java', async (_, javaVersion: string) => {
  try {
    writeLog(`[Java] 开始安装 Java ${javaVersion}`);

    if (mainWindow) {
      mainWindow.webContents.send('java-download-started', { javaVersion });
    }
    
    const result: any = await downloadAndInstallJava(javaVersion);
    
    if (result.success) {
      writeLog(`[Java] Java ${javaVersion} 安装成功: ${result.javaPath}`);
      if (mainWindow) {
        mainWindow.webContents.send('java-download-completed', {
          javaVersion,
          javaPath: result.javaPath
        });
      }
      return result;
    } else {
      writeLog(`[Java] Java ${javaVersion} 安装失败: ${result.error}`);
      if (mainWindow) {
        mainWindow.webContents.send('java-download-failed', {
          javaVersion,
          error: result.error
        });
      }
      return result;
    }
  } catch (e: any) {
    writeLog(`[Java] 安装Java异常: ${e.message}`);
    if (mainWindow) {
      mainWindow.webContents.send('java-download-failed', {
        javaVersion,
        error: e.message
      });
    }
    return { success: false, error: e.message };
  }
});

let currentSettings: any = null;

ipcMain.handle('get-settings', () => {
  if (!currentSettings) {
    currentSettings = loadSettings();
  }
  return currentSettings;
});

ipcMain.handle('save-settings', (_: any, settings: any) => {
  currentSettings = mergeWithDefaults(settings);
  const success: boolean = saveSettings(currentSettings);
  return { success, settings: currentSettings };
});

ipcMain.handle('reset-settings', () => {
  currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const success: boolean = saveSettings(currentSettings);
  return { success, settings: currentSettings };
});

ipcMain.handle('restart-app', () => {
  writeLog('[重启] 正在重启应用...');
  app.relaunch();
  app.exit();
});

ipcMain.handle('set-developer-mode', (_: any, enabled: boolean) => {
  isDeveloperMode = !!enabled;
  writeLog('[开发者模式] ' + (isDeveloperMode ? '已启用' : '已禁用'));
  return { success: true };
});


let activeAnimWindow: any = null;

function cleanupAnimTempDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e: any) {}
}

ipcMain.handle('play-startup-animation', async () => {
  if (activeAnimWindow && !activeAnimWindow.isDestroyed()) {
    try { activeAnimWindow.close(); } catch (e: any) {}
    activeAnimWindow = null;
  }

  writeLog('[启动动画] 开始播放启动动画');

  const iconDir: string = path.join(__dirname, 'static', 'icon');
  const tempAnimDir: string = path.join(app.getPath('temp'), 'gpcl-anim-' + Date.now());
  try { fs.mkdirSync(tempAnimDir, { recursive: true }); } catch (e: any) {}

  var imageNames: string[] = ['caellab.png', 'gamets.png', 'gamets.ico', 'GPCL.png'];
  for (var _i: number = 0; _i < imageNames.length; _i++) {
    var src: string = path.join(iconDir, imageNames[_i]);
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, path.join(tempAnimDir, imageNames[_i])); } catch (e: any) {}
    }
  }

  var hasCaelab: boolean = fs.existsSync(path.join(tempAnimDir, 'caellab.png'));
  var hasGamets: boolean = fs.existsSync(path.join(tempAnimDir, 'gamets.png')) || fs.existsSync(path.join(tempAnimDir, 'gamets.ico'));
  var hasGpcl: boolean = fs.existsSync(path.join(tempAnimDir, 'GPCL.png'));
  var gametsFile: string = fs.existsSync(path.join(tempAnimDir, 'gamets.png')) ? 'gamets.png' : 'gamets.ico';

  writeLog('[启动动画] 资源: caellab=' + hasCaelab + ' gamets=' + hasGamets + ' gpcl=' + hasGpcl);

  var ANIM_DURATION: number = 30;

  var htmlContent: string = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>\n' +
'*{margin:0;padding:0;box-sizing:border-box}\n' +
'html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0a}\n' +
'canvas{position:fixed;top:0;left:0;width:100%;height:100%;z-index:1}\n' +
'.scene{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:10;opacity:0}\n' +
'#welcome-txt{text-align:center;font-family:"Microsoft YaHei","Segoe UI",sans-serif}\n' +
'#welcome-txt h1{font-size:56px;font-weight:700;color:#fff;letter-spacing:3px;text-shadow:0 0 25px rgba(91,135,49,0.6),0 0 50px rgba(91,135,49,0.2);margin-bottom:16px}\n' +
'#welcome-txt p{font-size:20px;color:rgba(180,180,180,0.7);letter-spacing:5px}\n' +
'.logo-row{display:flex;flex-direction:row;align-items:center;justify-content:center}\n' +
'#logo-caellab img{max-height:130px;max-width:300px;object-fit:contain;filter:drop-shadow(0 0 18px rgba(91,135,49,0.35))}\n' +
'#logo-both .logo-row{gap:50px}\n' +
'#logo-both img{max-height:110px;max-width:240px;object-fit:contain}\n' +
'#logo-both .caellab-img{filter:drop-shadow(0 0 18px rgba(91,135,49,0.35))}\n' +
'#logo-both .gamets-img{filter:drop-shadow(0 0 14px rgba(255,255,255,0.25))}\n' +
'#logo-gpcl img{max-height:170px;max-width:340px;object-fit:contain;filter:drop-shadow(0 0 25px rgba(91,135,49,0.4))}\n' +
'.logo-text{text-align:center;font-family:"Microsoft YaHei","Segoe UI",sans-serif;margin-top:18px}\n' +
'.logo-text-bottom{position:absolute;bottom:40px;left:0;width:100%;margin-top:0}\n' +
'.logo-title{font-size:20px;color:rgba(200,200,200,0.85);letter-spacing:4px;margin-bottom:6px}\n' +
'.footer-link{font-size:14px;color:rgba(91,135,49,0.7);text-decoration:underline;pointer-events:auto;cursor:pointer}\n' +
'.copyright{font-size:13px;color:rgba(160,160,160,0.6);letter-spacing:1px;margin-bottom:6px}\n' +
'.license-text{font-size:12px;color:rgba(140,140,140,0.5);margin:0}\n' +
'.license-text .footer-link{font-size:12px}\n' +
'.disclaimer{font-size:12px;color:rgba(120,120,120,0.45);max-width:600px;line-height:1.6;margin:40px auto 0;text-align:center}\n' +
'#sweep-line{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:25;opacity:0}\n' +
'#sweep-line .band{position:absolute;top:0;height:100%;width:100px;background:linear-gradient(90deg,transparent,rgba(91,135,49,0.1),rgba(127,255,0,0.12),rgba(91,135,49,0.1),transparent)}\n' +
'#fade{position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a0a;opacity:0;pointer-events:none;z-index:30;transition:opacity 1.5s ease-in}\n' +
'#fade.show{opacity:1}\n' +
'#flash{position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;opacity:0;pointer-events:none;z-index:28}\n' +
'</style></head><body>\n' +
'<canvas id="c"></canvas>\n' +
'<div class="scene" id="welcome"><div id="welcome-txt"><h1>Minecraft\u6B22\u8FCE\u4F60\uFF01</h1><p>By GPCL And AllMinecraftPlayer</p></div></div>\n' +
'<div class="scene" id="logo-caellab"><div class="logo-row"><img src="caellab.png" alt="CaelLab"></div><div class="logo-text"><div class="logo-title">\u865A\u821F\u5B9E\u9A8C\u5BA4</div><a href="https://www.caellab.com" target="_blank" class="footer-link">caellab.com</a></div></div>\n' +
'<div class="scene" id="logo-both"><div class="logo-row"><img class="caellab-img" src="caellab.png" alt="CaelLab"><img class="gamets-img" src="' + gametsFile + '" alt="GameTS"></div><div class="logo-text logo-text-bottom"><div class="copyright">Copyright \u00A9 2026 Yunyun(\u4E91\u4E91) By \u865A\u821F\u5B9E\u9A8C\u5BA4(CaelLab) / CaelLabGameTS</div><p class="license-text">Licensed under <a href="https://www.caellab.com/license/bysa-code-v2.txt" target="_blank" class="footer-link">CaelLab BY-SA Code License v2.0</a>. Open Source on <a href="https://github.com/yunyun-3782/GoodPlanCraftLaunCher" target="_blank" class="footer-link">GitHub</a>.</p></div></div>\n' +
'<div class="scene" id="logo-gpcl"><img src="GPCL.png" alt="GPCL"><div class="logo-text logo-text-bottom"><div class="disclaimer">GoodPlanCraftLauncher \u4E0E Mojang Studios \u53CA Microsoft\u3001Xbox \u65E0\u5B98\u65B9\u5173\u8054\u3002Minecraft \u4E3A Mojang Studios \u5546\u6807\u3002</div></div></div>\n' +
'<div id="sweep-line"><div class="band" id="sweep-band"></div></div>\n' +
'<div id="flash"></div><div id="fade"></div>\n' +
'<script>\n' +
'(function(){\n' +
'var canvas=document.getElementById("c"),ctx=canvas.getContext("2d");\n' +
'var W,H,dpr=window.devicePixelRatio||1;\n' +
'function resize(){W=window.innerWidth;H=window.innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}\n' +
'resize();window.addEventListener("resize",resize);\n' +
'var startTime=performance.now();\n' +
'var DUR=' + ANIM_DURATION + ';\n' +
'function rand(a,b){return a+Math.random()*(b-a)}\n' +
'function easeOut(t){return 1-Math.pow(1-t,3)}\n' +
'function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}\n' +
'function clamp(v,a,b){return v<a?a:v>b?b:v}\n' +
'function lerp(a,b,t){return a+(b-a)*t}\n' +
'var BS=24;\n' +
'var MC_COLORS=["#8B6B3D","#6B6B6B","#5B8731","#3E6B1F","#6B4226","#5A5A5A","#7B5B2D","#4A4A4A"];\n' +
'var terrCols=Math.ceil(W/BS)+1;\n' +
'var terrH=[];\n' +
'for(var i=0;i<terrCols;i++){terrH.push(2+~~rand(0,4))}\n' +
'var parts=[];\n' +
'for(var i=0;i<160;i++){\n' +
'  var a=rand(0,6.283),sp=rand(0.12,0.6);\n' +
'  parts.push({x:rand(0,W),y:rand(0,H),vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,\n' +
'    sz:rand(8,18),c:MC_COLORS[~~rand(0,MC_COLORS.length)],a:0,ta:rand(.08,.25),\n' +
'    rot:rand(0,6.28),rs:rand(-.012,.012)});\n' +
'}\n' +
'var star={active:false,x:0,y:0,sx:0,sy:0,tx:0,ty:0,t:0,dur:1.6,trail:[]};\n' +
'var sparkles=[];\n' +
'function addSparkle(x,y){for(var i=0;i<6;i++){var a=rand(0,6.28),sp=rand(0.5,2);\n' +
'  sparkles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,a:1,sz:rand(3,6)})}}\n' +
'var shockwaves=[];\n' +
'function addShock(x,y,c,mr,d){shockwaves.push({x:x,y:y,r:0,mr:mr,c:c,a:.35,d:d,t:0})}\n' +
'var phaseShown={};\n' +
'function showScene(id,o,d){document.title="show:"+id+":"+o+":"+d}\n' +
'function hideScene(id,d){document.title="hide:"+id+":"+d}\n' +
'var waitingForDismiss=false;\n' +
'window.dismissAnimation=function(){\n' +
'  var f=document.getElementById("fade");f.style.transition="opacity 1.2s ease-in";f.classList.add("show");\n' +
'  setTimeout(function(){document.title="ended"},1300);\n' +
'};\n' +
'function drawBlock(x,y,sz,color,alpha){\n' +
'  ctx.save();ctx.globalAlpha=alpha;\n' +
'  ctx.fillStyle=color;ctx.fillRect(x,y,sz,sz);\n' +
'  ctx.fillStyle="rgba(255,255,255,0.09)";ctx.fillRect(x,y,sz,1);ctx.fillRect(x,y,1,sz);\n' +
'  ctx.fillStyle="rgba(0,0,0,0.18)";ctx.fillRect(x,y+sz-1,sz,1);ctx.fillRect(x+sz-1,y,1,sz);\n' +
'  ctx.restore();\n' +
'}\n' +
'function drawTerrain(t){\n' +
'  var a=clamp(t*.3,0,.2);\n' +
'  for(var c=0;c<terrCols;c++){\n' +
'    for(var r=0;r<terrH[c];r++){\n' +
'      var y=H-(r+1)*BS;var x=c*BS;\n' +
'      var col=r===0?"#3E6B1F":r===1?"#5B4B2D":"#3D3D3D";\n' +
'      drawBlock(x,y,BS,col,a);\n' +
'    }\n' +
'  }\n' +
'}\n' +
'function drawGrid(t){\n' +
'  var a=clamp(t*.3,0,.018);\n' +
'  ctx.save();ctx.strokeStyle="rgba(255,255,255,"+a+")";ctx.lineWidth=0.5;\n' +
'  for(var x=0;x<W;x+=BS){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}\n' +
'  for(var y=0;y<H;y+=BS){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}\n' +
'  ctx.restore();\n' +
'}\n' +
'function frame(now){\n' +
'  var t=(now-startTime)/1000;\n' +
'  ctx.clearRect(0,0,W,H);\n' +
'  ctx.fillStyle="rgba(10,10,10,"+clamp(t*.5,0,1)+")";ctx.fillRect(0,0,W,H);\n' +
'  drawGrid(t);\n' +
'  drawTerrain(t);\n' +
'  if(t>1&&t<8){\n' +
'    var gp=clamp((t-1)*.6,0,.3);var r=100+gp*120;\n' +
'    var g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,r);\n' +
'    g.addColorStop(0,"rgba(91,135,49,"+(.06*gp)+")");g.addColorStop(1,"rgba(62,107,31,0)");\n' +
'    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);\n' +
'  }\n' +
'  if(t>22&&t<28){\n' +
'    var gp2=clamp((t-22)*.5,0,.25);var r2=120+gp2*130;\n' +
'    var g2=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,r2);\n' +
'    g2.addColorStop(0,"rgba(91,135,49,"+(.06*gp2)+")");g2.addColorStop(1,"rgba(62,107,31,0)");\n' +
'    ctx.fillStyle=g2;ctx.fillRect(0,0,W,H);\n' +
'  }\n' +
'  for(var i=0;i<parts.length;i++){var p=parts[i];\n' +
'    p.a=clamp(p.a+.003,0,p.ta);p.x+=p.vx;p.y+=p.vy;p.rot+=p.rs;\n' +
'    p.vx*=.9995;p.vy*=.9995;\n' +
'    if(p.x<-30)p.x=W+30;if(p.x>W+30)p.x=-30;\n' +
'    if(p.y<-30)p.y=H+30;if(p.y>H+30)p.y=-30;\n' +
'    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);\n' +
'    drawBlock(-p.sz/2,-p.sz/2,p.sz,p.c,p.a);ctx.restore();\n' +
'  }\n' +
'  if(star.active){\n' +
'    var st=clamp((t-star.t)/star.dur,0,1);var e=easeInOut(st);\n' +
'    star.x=lerp(star.sx,star.tx,e);star.y=lerp(star.sy,star.ty,e);\n' +
'    star.trail.push({x:star.x,y:star.y,a:1});if(star.trail.length>35)star.trail.shift();\n' +
'    for(var j=0;j<star.trail.length;j++){var tr=star.trail[j];tr.a*=.93;\n' +
'      ctx.save();ctx.globalAlpha=tr.a*.5;ctx.fillStyle="#7FFF00";\n' +
'      ctx.fillRect(tr.x-2,tr.y-2,4,4);ctx.restore();}\n' +
'    ctx.save();ctx.fillStyle="#7FFF00";ctx.shadowColor="#7FFF00";ctx.shadowBlur=15;\n' +
'    ctx.fillRect(star.x-5,star.y-5,10,10);\n' +
'    ctx.shadowBlur=30;ctx.fillStyle="rgba(127,255,0,0.12)";\n' +
'    ctx.fillRect(star.x-14,star.y-14,28,28);ctx.restore();\n' +
'    if(Math.random()>.6)addSparkle(star.x+rand(-8,8),star.y+rand(-8,8));\n' +
'    if(st>=1)star.active=false;\n' +
'  }\n' +
'  for(var s=sparkles.length-1;s>=0;s--){var sp=sparkles[s];\n' +
'    sp.x+=sp.vx;sp.y+=sp.vy;sp.a*=.95;sp.vx*=.97;sp.vy*=.97;\n' +
'    if(sp.a<.01){sparkles.splice(s,1);continue}\n' +
'    ctx.save();ctx.globalAlpha=sp.a;ctx.fillStyle="#7FFF00";\n' +
'    ctx.fillRect(sp.x-sp.sz/2,sp.y-sp.sz/2,sp.sz,sp.sz);ctx.restore();\n' +
'  }\n' +
'  for(var s=shockwaves.length-1;s>=0;s--){var sw=shockwaves[s];\n' +
'    sw.t+=1/60;var pct=sw.t/sw.d;if(pct>=1){shockwaves.splice(s,1);continue}\n' +
'    sw.r=sw.mr*easeOut(pct);sw.a=.35*(1-pct);\n' +
'    ctx.save();ctx.strokeStyle=sw.c;ctx.globalAlpha=sw.a;ctx.lineWidth=2+2*(1-pct);\n' +
'    ctx.beginPath();ctx.arc(sw.x,sw.y,sw.r,0,6.28);ctx.stroke();ctx.restore();\n' +
'  }\n' +
'  if(t>1.5&&!phaseShown.w){phaseShown.w=true;showScene("welcome",1,1)}\n' +
'  if(t>7&&!phaseShown.hidew){phaseShown.hidew=true;hideScene("welcome",1)}\n' +
'  if(t>8.5&&!phaseShown.star){\n' +
'    phaseShown.star=true;\n' +
'    star.active=true;star.sx=-50;star.sy=H*.55;star.tx=W/2;star.ty=H/2;star.t=t;star.trail=[];\n' +
'  }\n' +
'  if(t>10.5&&!phaseShown.ca){phaseShown.ca=true;addShock(W/2,H/2,"rgba(91,135,49,0.3)",400,1.2);showScene("logo-caellab",1,1.2)}\n' +
'  if(t>14.5&&!phaseShown.hideca){phaseShown.hideca=true;hideScene("logo-caellab",.8)}\n' +
'  if(t>15.5&&!phaseShown.both){phaseShown.both=true;showScene("logo-both",1,1.2)}\n' +
'  if(t>20.5&&!phaseShown.hideboth){phaseShown.hideboth=true;hideScene("logo-both",1)}\n' +
'  if(t>22&&!phaseShown.gpcl){phaseShown.gpcl=true;addShock(W/2,H/2,"rgba(127,255,0,0.12)",350,1);showScene("logo-gpcl",1,1.5)}\n' +
'  if(t>26&&!phaseShown.sweep){\n' +
'    phaseShown.sweep=true;\n' +
'    var sl=document.getElementById("sweep-line");sl.style.opacity="1";\n' +
'    var band=document.getElementById("sweep-band");var swStart=performance.now();\n' +
'    function sweepFrame(swNow){var swT=(swNow-swStart)/1500;\n' +
'      if(swT>1){sl.style.opacity="0";return}\n' +
'      band.style.left=(-200+(W+400)*easeInOut(swT))+"px";\n' +
'      requestAnimationFrame(sweepFrame)}\n' +
'    requestAnimationFrame(sweepFrame);\n' +
'  }\n' +
'  if(t>27.5&&!phaseShown.launch){phaseShown.launch=true;document.title="launch"}\n' +
'  if(t>28&&!phaseShown.hgpcl){phaseShown.hgpcl=true;hideScene("logo-gpcl",1)}\n' +
'  if(t>29.5&&!phaseShown.fadeblk){phaseShown.fadeblk=true;document.getElementById("fade").classList.add("show")}\n' +
'  if(t>DUR&&!waitingForDismiss){waitingForDismiss=true;document.title="waiting"}\n' +
'  requestAnimationFrame(frame);\n' +
'}\n' +
'document.title="meta:"+DUR;\n' +
'requestAnimationFrame(frame);\n' +
'})();\n' +
'<\/script></body></html>';

  var tempHtmlPath: string = path.join(tempAnimDir, 'index.html');
  try { fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8'); } catch (e: any) {
    writeLog('[启动动画] 写入临时文件失败: ' + e.message);
    cleanupAnimTempDir(tempAnimDir);
    return { success: false, error: '写入临时文件失败', duration: 0 };
  }

  return new Promise<any>(function(resolve) {
    var animWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      skipTaskbar: true,
      backgroundColor: '#000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    activeAnimWindow = animWindow;

    animWindow.setAlwaysOnTop(true, 'screen-saver');
    animWindow.webContents.setWindowOpenHandler(function(details: any) {
      shell.openExternal(details.url);
      return { action: 'deny' } as any;
    });
    animWindow.loadFile(tempHtmlPath);

    var resolved: boolean = false;

    animWindow.on('page-title-updated', function(e: any, title: string) {
      e.preventDefault();

      if (title.startsWith('show:')) {
        var parts: string[] = title.split(':');
        var sceneId: string = parts[1];
        var opacity: string = parts[2];
        var dur: string = parts[3];
        animWindow.webContents.executeJavaScript(
          '(function(){var el=document.getElementById("' + sceneId + '");' +
          'if(el){el.style.transition="opacity ' + dur + 's ease-out";' +
          'el.style.opacity="' + opacity + '"}})()'
        );
        return;
      }

      if (title.startsWith('hide:')) {
        var parts: string[] = title.split(':');
        var sceneId: string = parts[1];
        var dur: string = parts[2];
        animWindow.webContents.executeJavaScript(
          '(function(){var el=document.getElementById("' + sceneId + '");' +
          'if(el){el.style.transition="opacity ' + dur + 's ease-in";' +
          'el.style.opacity="0"}})()'
        );
        return;
      }

      if (title === 'launch' && !resolved) {
        resolved = true;
        writeLog('[启动动画] 动画即将结束，提前启动MC');
        resolve({ success: true, duration: ANIM_DURATION });
        return;
      }

      if (title === 'waiting') {
        writeLog('[启动动画] 进入黑屏等待阶段');
        return;
      }

      if (title === 'ended') {
        writeLog('[启动动画] 动画退场完毕');
        try { animWindow.close(); } catch (e: any) {}
        return;
      }
    });

    animWindow.on('closed', function() {
      if (activeAnimWindow === animWindow) activeAnimWindow = null;
      cleanupAnimTempDir(tempAnimDir);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: '动画窗口已关闭', duration: 0 });
      }
    });

    setTimeout(function() {
      if (!resolved) {
        resolved = true;
        writeLog('[启动动画] 动画加载超时');
        resolve({ success: false, error: '动画加载超时', duration: 0 });
        try { if (!animWindow.isDestroyed()) animWindow.close(); } catch (e: any) {}
      }
    }, 35000);
  });
});

ipcMain.handle('dismiss-startup-animation', function() {
  if (activeAnimWindow && !activeAnimWindow.isDestroyed()) {
    writeLog('[启动动画] MC窗口就绪，执行退场');
    try {
      activeAnimWindow.webContents.executeJavaScript(
        'if(typeof dismissAnimation==="function")dismissAnimation()'
      );
    } catch (e: any) {}
  }
});

ipcMain.handle('read-json-file', async (_, subPath: string, fileName: string) => {
  try {
    const dir: string = path.join(BASE_DIR, 'gpcl', subPath);
    const filePath: string = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content: string = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e: any) {
    writeLog(`读取文件失败: ${e.message}`);
    return null;
  }
});

ipcMain.handle('write-json-file', async (_, subPath: string, fileName: string, data: any) => {
  try {
    const dir: string = path.join(BASE_DIR, 'gpcl', subPath);
    const filePath: string = path.join(dir, fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e: any) {
    writeLog(`写入文件失败: ${e.message}`);
    return false;
  }
});

ipcMain.handle('get-forge-versions', async (_, mcVersion: string) => {
  try {
    writeLog(`[Forge] 获取版本列表: ${mcVersion}`);
    const versions: any[] = await fetchForgeVersions(mcVersion);
    return { success: true, versions };
  } catch (e: any) {
    writeLog(`[Forge] 获取版本列表失败: ${e.message}`);
    return { success: false, error: e.message, versions: [] };
  }
});

ipcMain.handle('get-optifine-versions', async (_, mcVersion: string) => {
  try {
    const versions: any[] = await fetchOptiFineVersions(mcVersion);
    return { success: true, versions };
  } catch (e: any) {
    writeLog(`[OptiFine] 获取版本列表失败: ${e.message}`);
    return { success: false, error: e.message, versions: [] };
  }
});


async function fetchForgeVersions(mcVersion: string): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    const https = require('https');
    const url: string = `https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json`;
    
    https.get(url, { timeout: 10000 }, (res: any) => {
      let data: string = '';
      
      res.on('data', (chunk: any) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const metadata: any = JSON.parse(data);
          const versions: any[] = [];

          const versionArray: any[] = metadata[mcVersion];
          if (versionArray && Array.isArray(versionArray)) {
            versionArray.forEach((fullVersion: string) => {
              const parts: string[] = fullVersion.split('-');
              const forgeVersion: string = parts.slice(1).join('-');
              versions.push({
                id: fullVersion,
                name: `Forge ${forgeVersion}`,
                version: forgeVersion,
                mcVersion: mcVersion
              });
            });
          }

          versions.sort((a: any, b: any) => compareVersions(b.version, a.version));

          const topVersions: any[] = versions.slice(0, 10);

          if (topVersions.length > 0) {
            topVersions[0].name += ' (推荐)';
          }
          
          writeLog(`[Forge] 找到 ${topVersions.length} 个版本`);
          resolve(topVersions);
        } catch (e: any) {
          writeLog(`[Forge] 解析错误: ${e.message}`);
          reject(new Error('解析 Forge 元数据失败'));
        }
      });
    }).on('error', (e: any) => {
      reject(new Error(`请求 Forge 元数据失败: ${e.message}`));
    }).on('timeout', () => {
      reject(new Error('请求 Forge 元数据超时'));
    });
  });
}

function compareVersions(v1: string, v2: string): number {
  const parts1: number[] = v1.split(/[.-]/).map((p: string) => parseInt(p, 10) || 0);
  const parts2: number[] = v2.split(/[.-]/).map((p: string) => parseInt(p, 10) || 0);
  
  for (let i: number = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a: number = parts1[i] || 0;
    const b: number = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function fetchOptiFineVersions(mcVersion: string): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    const https = require('https');
    const url: string = 'https://bmclapi2.bangbang93.com/optifine/versionList';
    
    writeLog(`[OptiFine] 获取版本列表: ${mcVersion}`);
    
    https.get(url, { timeout: 15000 }, (res: any) => {
      let data: string = '';
      res.on('data', (chunk: any) => { data += chunk; });
      res.on('end', () => {
        try {
          const allVersions: any[] = JSON.parse(data);
          const filtered: any[] = allVersions
            .filter((v: any) => v.mcversion === mcVersion)
            .map((v: any) => {
              const isPreview: boolean = v.filename.startsWith('preview_');
              return {
                id: v.filename,
                name: `OptiFine ${v.type}_${v.patch}${isPreview ? ' (预览)' : ''}`,
                version: `${v.type}_${v.patch}`,
                filename: v.filename,
                mcVersion: v.mcversion,
                isPreview
              };
            });
          
          filtered.sort((a: any, b: any) => {
            if (a.isPreview !== b.isPreview) return a.isPreview ? 1 : -1;
            return b.name.localeCompare(a.name);
          });
          
          const firstStable: any = filtered.find((v: any) => !v.isPreview);
          if (firstStable) firstStable.name += ' (推荐)';
          
          writeLog(`[OptiFine] 找到 ${filtered.length} 个版本 for MC ${mcVersion}`);
          resolve(filtered);
        } catch (e: any) {
          writeLog(`[OptiFine] 解析错误: ${e.message}`);
          reject(new Error('解析 OptiFine 版本列表失败'));
        }
      });
    }).on('error', (e: any) => {
      writeLog(`[OptiFine] 请求失败: ${e.message}`);
      reject(new Error(`请求 OptiFine 版本列表失败: ${e.message}`));
    }).on('timeout', () => {
      reject(new Error('请求 OptiFine 版本列表超时'));
    });
  });
}

async function installVersionWithModLoader(versionId: string, loaderType: string, loaderVersion: string, maxConcurrent: number): Promise<any> {
  try {
    writeLog(`[模组加载器] 开始下载: ${loaderType} ${loaderVersion} for MC ${versionId}`);

    writeLog(`[模组加载器] 下载原版 MC ${versionId}`);
    await installVersion(versionId, maxConcurrent);
    
    if (shouldCancelDownload) {
      return { success: false, error: '下载已取消' };
    }

    let finalVersionId: string;
    if (loaderType === 'forge') {
      finalVersionId = await installForge(versionId, loaderVersion);
    } else if (loaderType === 'optifine') {
      finalVersionId = await installOptiFine(versionId, loaderVersion);
    } else {
      return { success: false, error: `不支持的模组加载器: ${loaderType}` };
    }
    
    writeLog(`[模组加载器] 安装完成: ${finalVersionId}`);

    updateVersionLastPlayed(finalVersionId);
    
    return { success: true, finalVersionId };
    
  } catch (e: any) {
    writeLog(`[模组加载器] 安装失败: ${e.message}`);
    return { success: false, error: e.message };
  }
}

function downloadFileHttps(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const https = require('https');
    const http = require('http');
    const dir: string = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dest)) fs.unlinkSync(dest);

    const doRequest = (reqUrl: string): void => {
      const proto: any = reqUrl.startsWith('https') ? https : http;
      const parsed: any = new (require('url').URL)(reqUrl);
      proto.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
      }, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (e: any) => { try { fs.unlinkSync(dest); } catch(_){} reject(e); });
      }).on('error', reject).on('timeout', () => { reject(new Error('下载超时')); });
    };
    doRequest(url);
  });
}

function downloadInstaller(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { execFile } = require('child_process');
    const dir: string = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    
    writeLog(`[Forge] 使用 PowerShell 下载安装器`);
    
    const psScript: string = `
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = 'SilentlyContinue'
      Invoke-WebRequest -Uri '${url}' -OutFile '${dest}' -UseBasicParsing
      if (Test-Path '${dest}') {
        $size = (Get-Item '${dest}').Length
        Write-Output "OK:$size"
      } else {
        Write-Error "Download failed"
        exit 1
      }
    `;
    
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      timeout: 120000,
      encoding: 'utf8'
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        writeLog(`[Forge] PowerShell 下载失败: ${error.message}`);
        if (stderr) writeLog(`[Forge] stderr: ${stderr}`);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error(`下载失败: ${stderr || error.message}`));
        return;
      }
      
      const output: string = (stdout || '').trim();
      if (output.startsWith('OK:')) {
        const size: number = parseInt(output.substring(3), 10);
        writeLog(`[Forge] 安装器下载完成: ${size} bytes`);
        resolve();
      } else {
        writeLog(`[Forge] 下载输出: ${output}`);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error('下载失败'));
      }
    });
  });
}

async function installForge(mcVersion: string, forgeVersion: string): Promise<any> {
  writeLog(`[Forge] 安装: MC ${mcVersion}, Forge ${forgeVersion}`);
  
  const versionDir: string = path.join(GAME_DIR, 'versions', mcVersion);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`原版版本 ${mcVersion} 不存在`);
  }

  const fullForgeVersionId: string = forgeVersion.includes('-') ? forgeVersion : `${mcVersion}-${forgeVersion}`;
  writeLog(`[Forge] 完整版本ID: ${fullForgeVersionId}`);

  const installerUrl: string = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullForgeVersionId}/forge-${fullForgeVersionId}-installer.jar`;
  const installerPath: string = path.join(GAME_DIR, 'temp', `forge-${fullForgeVersionId}-installer.jar`);
  
  if (!fs.existsSync(path.dirname(installerPath))) {
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
  }
  
  writeLog(`[Forge] 下载安装器: ${installerUrl}`);
  await downloadInstaller(installerUrl, installerPath);
  
  if (shouldCancelDownload) {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
    throw new Error('下载已取消');
  }
  
  writeLog(`[Forge] 运行安装器`);
  
  const javaVersion: string = getJavaVersionForMCVersion(mcVersion);
  writeLog(`[Forge] MC ${mcVersion} 需要 Java ${javaVersion}`);
  
  let javaPath: string | null = null;
  
  const runtimeDir: string = getJavaRuntimeDir(javaVersion);
  if (fs.existsSync(runtimeDir)) {
    javaPath = findJavaExecutable(runtimeDir);
  }
  
  if (!javaPath) {
    const ensuredPath: string | null = await ensureJavaRuntime(javaVersion);
    if (ensuredPath) {
      javaPath = ensuredPath;
    }
  }
  
  if (!javaPath) {
    javaPath = findJava();
  }
  
  if (!javaPath) {
    fs.unlinkSync(installerPath);
    throw new Error('未找到 Java 运行时，请安装 Java 8 或更高版本');
  }
  
  writeLog(`[Forge] 使用 Java: ${javaPath}`);
  
  const installerStat = fs.statSync(installerPath);
  writeLog(`[Forge] 安装器文件大小: ${installerStat.size} bytes`);
  
  if (installerStat.size < 100000) {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
    throw new Error(`Forge 安装器文件过小 (${installerStat.size} bytes)，可能下载失败`);
  }
  
  const jarMagic: Buffer = fs.readFileSync(installerPath).slice(0, 4);
  writeLog(`[Forge] 安装器文件头: ${jarMagic.toString('hex')}`);
  if (jarMagic[0] !== 0x50 || jarMagic[1] !== 0x4B) {
    writeLog(`[Forge] 警告: 文件不是有效的 ZIP/JAR 格式`);
    const firstBytes: string = fs.readFileSync(installerPath, { encoding: 'utf8' }).slice(0, 200);
    writeLog(`[Forge] 文件内容开头: ${firstBytes}`);
  }
  
  const { execFile } = require('child_process');
  
  writeLog(`[Forge] 查看安装器帮助信息...`);
  const helpResult: any = await new Promise<any>((resolve) => {
    const child = execFile(javaPath!, [
      '-jar', installerPath,
      '--help'
    ], {
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, (error: any, stdout: string, stderr: string) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error });
    });
  });
  
  if (helpResult.stdout) writeLog(`[Forge] 帮助输出:\n${helpResult.stdout}`);
  if (helpResult.stderr) writeLog(`[Forge] 帮助错误:\n${helpResult.stderr}`);
  
  const argFormats: string[][] = [
    ['--installClient'],
    ['--installServer'],
    ['-installClient'],
    ['-installServer'],
    ['--install', 'client'],
    ['client']
  ];
  
  let success: boolean = false;
  for (const args of argFormats) {
    writeLog(`[Forge] 尝试参数: ${args.join(' ')}`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(javaPath!, [
          '-jar', installerPath,
          ...args
        ], {
          cwd: GAME_DIR,
          timeout: 300000,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }, (error: any, stdout: string, stderr: string) => {
          if (stdout) writeLog(`[Forge] stdout: ${stdout}`);
          if (stderr) writeLog(`[Forge] stderr: ${stderr}`);
          
          if (error) {
            reject(new Error(`Forge 安装器执行失败: ${stderr || stdout || error.message}`));
          } else {
            writeLog(`[Forge] 安装器执行成功`);
            resolve();
          }
        });
        
        child.on('error', (err: any) => {
          reject(new Error(`Java 进程启动失败: ${err.message}`));
        });
      });
      
      success = true;
      break;
    } catch (e: any) {
      writeLog(`[Forge] 参数 ${args.join(' ')} 失败: ${e.message}`);
    }
  }
  
  if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
  
  if (success) {
    writeLog(`[Forge] 安装完成`);
    return;
  }
  
  throw new Error('Forge 安装器执行失败: 所有参数格式都失败');
}

function resolveOptiFineDownloadUrl(adloadxUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const https = require('https');
    const parsed: any = new (require('url').URL)(adloadxUrl);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    }, (res: any) => {
      let data: string = '';
      res.on('data', (chunk: any) => { data += chunk; });
      res.on('end', () => {
        const m: RegExpMatchArray | null = data.match(/href='(downloadx\?f=[^']+)'/);
        if (m) {
          resolve(`https://optifine.net/${m[1]}`);
        } else {
          reject(new Error('无法解析 OptiFine 下载链接'));
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('解析下载链接超时')));
  });
}

async function installOptiFine(mcVersion: string, optifineFilename: string): Promise<string> {
  writeLog(`[OptiFine] 安装: MC ${mcVersion}, 文件 ${optifineFilename}`);
  
  const versionDir: string = path.join(GAME_DIR, 'versions', mcVersion);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`原版版本 ${mcVersion} 不存在`);
  }
  
  const adloadxUrl: string = `https://optifine.net/adloadx?f=${optifineFilename}`;
  const installerPath: string = path.join(GAME_DIR, 'temp', optifineFilename);
  
  if (!fs.existsSync(path.dirname(installerPath))) {
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
  }
  
  writeLog(`[OptiFine] 解析下载链接: ${adloadxUrl}`);
  const realUrl: string = await resolveOptiFineDownloadUrl(adloadxUrl);
  writeLog(`[OptiFine] 下载安装器: ${realUrl}`);
  await downloadFileHttps(realUrl, installerPath);
  
  if (shouldCancelDownload) {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
    throw new Error('下载已取消');
  }
  
  const fileMagic: Buffer = fs.readFileSync(installerPath).slice(0, 4);
  writeLog(`[OptiFine] 文件头: ${fileMagic.toString('hex')}`);
  if (fileMagic[0] !== 0x50 || fileMagic[1] !== 0x4B) {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
    throw new Error('下载的文件不是有效的 JAR 文件，可能镜像源异常');
  }
  
  writeLog(`[OptiFine] 运行安装器（静默模式）`);
  
  const javaVersion: string = getJavaVersionForMCVersion(mcVersion);
  let javaPath: string | null = null;
  const runtimeDir: string = getJavaRuntimeDir(javaVersion);
  if (fs.existsSync(runtimeDir)) javaPath = findJavaExecutable(runtimeDir);
  if (!javaPath) {
    const ensuredPath: string | null = await ensureJavaRuntime(javaVersion);
    if (ensuredPath) javaPath = ensuredPath;
  }
  if (!javaPath) javaPath = findJava();
  if (!javaPath) {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
    throw new Error('未找到 Java 运行时，请先安装 Java');
  }
  writeLog(`[OptiFine] 使用 Java: ${javaPath}`);
  
  const defaultMinecraftDir: string = path.join(app.getPath('appData'), '.minecraft');
  const launcherProfilesPath: string = path.join(defaultMinecraftDir, 'launcher_profiles.json');
  const defaultVersionsDir: string = path.join(defaultMinecraftDir, 'versions');
  const defaultLibsDir: string = path.join(defaultMinecraftDir, 'libraries');
  let backupProfiles: string | null = null;
  let createdProfiles: boolean = false;
  let tempVanillaDir: string | null = null;
  let preExistingVersions: Set<string> = new Set();
  let preExistingLibs: Set<string> = new Set();
  let optifineVersionId: string | null = null;
  
  try {
    if (!fs.existsSync(defaultMinecraftDir)) {
      fs.mkdirSync(defaultMinecraftDir, { recursive: true });
    }
    
    if (fs.existsSync(defaultVersionsDir)) {
      preExistingVersions = new Set(fs.readdirSync(defaultVersionsDir));
    }
    if (fs.existsSync(defaultLibsDir)) {
      const collectLibs = (dir: string): void => {
        for (const item of fs.readdirSync(dir)) {
          const p: string = path.join(dir, item);
          if (fs.statSync(p).isDirectory()) collectLibs(p);
          else preExistingLibs.add(p);
        }
      };
      collectLibs(defaultLibsDir);
    }
    
    if (fs.existsSync(launcherProfilesPath)) {
      backupProfiles = fs.readFileSync(launcherProfilesPath, 'utf8');
    }
    
    const profiles: any = {
      profiles: {
        GPCL: {
          type: 'custom',
          gameDir: GAME_DIR,
          lastVersionId: mcVersion
        }
      }
    };
    fs.writeFileSync(launcherProfilesPath, JSON.stringify(profiles, null, 2), 'utf8');
    createdProfiles = true;
    writeLog(`[OptiFine] 已创建 launcher_profiles.json（临时）`);
    
    const srcVersionDir: string = path.join(GAME_DIR, 'versions', mcVersion);
    tempVanillaDir = path.join(defaultMinecraftDir, 'versions', mcVersion);
    if (!fs.existsSync(tempVanillaDir)) {
      fs.mkdirSync(tempVanillaDir, { recursive: true });
    }
    const srcJar: string = path.join(srcVersionDir, `${mcVersion}.jar`);
    const dstJar: string = path.join(tempVanillaDir, `${mcVersion}.jar`);
    if (fs.existsSync(srcJar) && !fs.existsSync(dstJar)) {
      fs.copyFileSync(srcJar, dstJar);
      writeLog(`[OptiFine] 临时复制: ${mcVersion}.jar`);
    }
    const dstClientJar: string = path.join(tempVanillaDir, 'client.jar');
    if (fs.existsSync(srcJar) && !fs.existsSync(dstClientJar)) {
      fs.copyFileSync(srcJar, dstClientJar);
      writeLog(`[OptiFine] 临时复制: client.jar`);
    }
    const srcJson: string = path.join(srcVersionDir, `${mcVersion}.json`);
    const dstJson: string = path.join(tempVanillaDir, `${mcVersion}.json`);
    if (fs.existsSync(srcJson) && !fs.existsSync(dstJson)) {
      fs.copyFileSync(srcJson, dstJson);
      writeLog(`[OptiFine] 临时复制: ${mcVersion}.json`);
    }
    writeLog(`[OptiFine] 已将原版 ${mcVersion} 文件临时复制到默认目录`);
    
    const { execFile } = require('child_process');
    
    await new Promise<void>((resolve, reject) => {
      const child = execFile(javaPath!, ['-jar', installerPath, '-install'], {
        cwd: defaultMinecraftDir,
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }, (error: any, stdout: string, stderr: string) => {
        if (stdout) writeLog(`[OptiFine] stdout: ${stdout}`);
        if (stderr) writeLog(`[OptiFine] stderr: ${stderr}`);
        if (error) {
          reject(new Error(`OptiFine 安装器执行失败: ${stderr || stdout || error.message}`));
        } else {
          writeLog(`[OptiFine] 安装器执行成功`);
          resolve();
        }
      });
      child.on('error', (err: any) => reject(new Error(`Java 进程启动失败: ${err.message}`)));
    });
  } finally {
    if (createdProfiles) {
      if (backupProfiles !== null) {
        fs.writeFileSync(launcherProfilesPath, backupProfiles, 'utf8');
      } else if (fs.existsSync(launcherProfilesPath)) {
        fs.unlinkSync(launcherProfilesPath);
      }
      writeLog(`[OptiFine] 已清理 launcher_profiles.json`);
    }
    
    try {
      if (fs.existsSync(defaultVersionsDir)) {
        const postVersions: string[] = fs.readdirSync(defaultVersionsDir);
        const newVersions: string[] = postVersions.filter((v: string) => !preExistingVersions.has(v));
        
        if (newVersions.length > 0) {
          const ofVersion: string = newVersions.find((v: string) => v.toLowerCase().includes('optifine')) || newVersions[0];
          optifineVersionId = ofVersion;
          
          const srcDir: string = path.join(defaultVersionsDir, ofVersion);
          const dstDir: string = path.join(GAME_DIR, 'versions', ofVersion);
          
          if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
          
          for (const item of fs.readdirSync(srcDir)) {
            const srcPath: string = path.join(srcDir, item);
            const dstPath: string = path.join(dstDir, item);
            if (fs.statSync(srcPath).isDirectory()) {
              const copySubDir = (s: string, d: string): void => {
                if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                for (const sub of fs.readdirSync(s)) {
                  const sp: string = path.join(s, sub);
                  const dp: string = path.join(d, sub);
                  if (fs.statSync(sp).isDirectory()) copySubDir(sp, dp);
                  else if (!fs.existsSync(dp)) fs.copyFileSync(sp, dp);
                }
              };
              copySubDir(srcPath, dstPath);
            } else if (!fs.existsSync(dstPath)) {
              fs.copyFileSync(srcPath, dstPath);
            }
          }
          writeLog(`[OptiFine] 已将版本 ${ofVersion} 复制到 GPCL 目录`);
          
          const ofJsonPath: string = path.join(dstDir, `${ofVersion}.json`);
          if (fs.existsSync(ofJsonPath)) {
            const ofVd: any = JSON.parse(fs.readFileSync(ofJsonPath, 'utf8'));
            for (const lib of ofVd.libraries || []) {
              if (lib.name && !lib.downloads?.artifact?.path) {
                const parts: string[] = lib.name.split(':');
                if (parts.length >= 3) {
                  const libPath: string = parts[0].replace(/\./g, '/') + '/' + parts[1] + '/' + parts[2] + '/' + parts[1] + '-' + parts[2] + '.jar';
                  const srcLib: string = path.join(defaultLibsDir, libPath);
                  const dstLib: string = path.join(GAME_DIR, 'libraries', libPath);
                  if (fs.existsSync(srcLib) && !fs.existsSync(dstLib)) {
                    fs.mkdirSync(path.dirname(dstLib), { recursive: true });
                    fs.copyFileSync(srcLib, dstLib);
                    writeLog(`[OptiFine] 复制库: ${libPath}`);
                  }
                  if (!lib.downloads) lib.downloads = {};
                  if (!lib.downloads.artifact) {
                    lib.downloads.artifact = { path: libPath, url: '', size: 0 };
                  }
                }
              }
            }
            fs.writeFileSync(ofJsonPath, JSON.stringify(ofVd, null, 2), 'utf8');
          }
        }
      }
      
      if (tempVanillaDir && fs.existsSync(tempVanillaDir)) {
        const rmDir = (dir: string): void => {
          if (!fs.existsSync(dir)) return;
          for (const item of fs.readdirSync(dir)) {
            const p: string = path.join(dir, item);
            if (fs.statSync(p).isDirectory()) rmDir(p);
            else fs.unlinkSync(p);
          }
          fs.rmdirSync(dir);
        };
        rmDir(tempVanillaDir);
      }
      
      if (optifineVersionId) {
        const ofInstalledDir: string = path.join(defaultVersionsDir, optifineVersionId);
        if (fs.existsSync(ofInstalledDir)) {
          const rmDir = (dir: string): void => {
            if (!fs.existsSync(dir)) return;
            for (const item of fs.readdirSync(dir)) {
              const p: string = path.join(dir, item);
              if (fs.statSync(p).isDirectory()) rmDir(p);
              else fs.unlinkSync(p);
            }
            fs.rmdirSync(dir);
          };
          rmDir(ofInstalledDir);
        }
      }
      
      writeLog(`[OptiFine] 已清理临时文件`);
    } catch (e: any) {
      writeLog(`[OptiFine] 后处理出错: ${e.message}`);
    }
  }
  
  if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
  
  if (optifineVersionId) {
    writeLog(`[OptiFine] 安装完成: ${optifineVersionId}`);
    return optifineVersionId;
  }
  
  const optifineFilenameBase: string = optifineFilename.replace('.jar', '');
  const fallbackId: string = `${mcVersion}-${optifineFilenameBase.split('_').slice(1).join('_')}`;
  writeLog(`[OptiFine] 安装完成(fallback): ${fallbackId}`);
  return fallbackId;
}

function findJava(): string | null {
  const paths: (string | null)[] = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : null,
    'C:\\Program Files\\Java\\jdk1.8.0_351\\bin\\java.exe',
    'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
    'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe',
    'C:\\Program Files (x86)\\Java\\jdk1.8.0_351\\bin\\java.exe',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.8.101-hotspot\\bin\\java.exe',
    'C:\\Program Files (x86)\\Eclipse Adoptium\\jdk-17.0.8.101-hotspot\\bin\\java.exe',
    'C:\\Program Files\\Amazon Corretto\\jdk17.0.8_7\\bin\\java.exe',
    'C:\\Program Files\\Microsoft\\jdk-17.0.8.101-hotspot\\bin\\java.exe'
  ];
  
  for (const javaPath of paths) {
    if (javaPath && fs.existsSync(javaPath)) {
      writeLog(`[Forge] 找到 Java: ${javaPath}`);
      return javaPath;
    }
  }
  
  try {
    const { execSync } = require('child_process');
    const whichOutput: string = execSync('where java', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (whichOutput) {
      const javaPaths: string[] = whichOutput.split('\n').map((p: string) => p.trim()).filter((p: string) => p);
      for (const javaPath of javaPaths) {
        if (fs.existsSync(javaPath)) {
          writeLog(`[Forge] 通过 where 找到 Java: ${javaPath}`);
          return javaPath;
        }
      }
    }
  } catch (e: any) {
    writeLog(`[Forge] where java 执行失败: ${e.message}`);
  }
  
  return null;
}

function readVersionConfig(versionId: string): any {
  const versionDir: string = path.join(GAME_DIR, 'versions', versionId);
  const configPath: string = path.join(versionDir, 'gpcl', 'config.ini');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  try {
    const content: string = fs.readFileSync(configPath, 'utf8');
    const config: any = {
      Minecraft: '',
      Forge: ''
    };
    
    const lines: string[] = content.split('\n');
    let inVersionSection: boolean = false;
    
    for (const line of lines) {
      const trimmed: string = line.trim();
      
      if (trimmed === '[Version]') {
        inVersionSection = true;
        continue;
      }
      
      if (!inVersionSection) continue;
      
      const parts: string[] = trimmed.split('=');
      if (parts.length === 2) {
        const key: string = parts[0].trim();
        const value: string = parts[1].trim();
        if (config.hasOwnProperty(key)) {
          config[key] = value;
        }
      }
    }
    
    return config;
  } catch (e: any) {
    writeLog(`[Config] 读取配置失败: ${e.message}`);
    return null;
  }
}

function generateVersionDisplayName(versionId: string): string {
  const config: any = readVersionConfig(versionId);
  
  if (!config) {
    return versionId;
  }
  
  const parts: string[] = [];
  parts.push(config.Minecraft || versionId);
  
  if (config.Forge) {
    parts.push(`Forge${config.Forge}`);
  }
  
  return parts.join(' ');
}

function generateLaunchDisplayName(versionId: string): string {
  const config: any = readVersionConfig(versionId);
  
  if (!config) {
    return versionId;
  }
  
  const parts: string[] = [];
  parts.push(config.Minecraft || versionId);
  
  if (config.Forge) {
    parts.push(`Forge${config.Forge}`);
  }
  
  return parts.join(' ');
}

ipcMain.handle('get-memory-usage', () => {
  return new Promise<number>((resolve) => {
    if (process.platform === 'win32') {
      const { spawn } = require('child_process');
      const wmic = spawn('wmic', ['process', 'where', `processid=${process.pid}`, 'get', 'WorkingSetSize', '/value']);
      
      let output: string = '';
      wmic.stdout.on('data', (data: any) => {
        output += data.toString();
      });
      
      wmic.on('close', (code: number | null) => {
        try {
          const match: RegExpMatchArray | null = output.match(/WorkingSetSize=(\d+)/);
          if (match) {
            const memBytes: number = parseInt(match[1]);
            const memGB: number = memBytes / (1024 * 1024 * 1024);
            writeLog(`[内存获取] WMIC成功: ${memGB.toFixed(2)}GB`);
            resolve(parseFloat(memGB.toFixed(2)));
          } else {
            writeLog(`[内存获取] WMIC匹配失败，输出: "${output.trim()}"`);
            const memUsage = process.memoryUsage();
            const memGB: number = memUsage.heapUsed / (1024 * 1024 * 1024);
            resolve(parseFloat(memGB.toFixed(2)));
          }
        } catch (e: any) {
          writeLog(`[内存获取] WMIC解析失败: ${e.message}`);
          const memUsage = process.memoryUsage();
          const memGB: number = memUsage.heapUsed / (1024 * 1024 * 1024);
          resolve(parseFloat(memGB.toFixed(2)));
        }
      });
      
      wmic.on('error', (e: any) => {
        writeLog(`[内存获取] WMIC调用失败: ${e.message}`);
        const memUsage = process.memoryUsage();
        const memGB: number = memUsage.heapUsed / (1024 * 1024 * 1024);
        resolve(parseFloat(memGB.toFixed(2)));
      });
    } else {
      const memUsage = process.memoryUsage();
      const memGB: number = memUsage.heapUsed / (1024 * 1024 * 1024);
      resolve(parseFloat(memGB.toFixed(2)));
    }
  });
});

ipcMain.handle('optimize-memory', async () => {
  writeLog('[内存优化] 开始执行内存优化...');
  
  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    
    return new Promise<boolean>((resolve) => {
      exec('rundll32.exe advapi32.dll,ProcessIdleTasks', { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          writeLog(`[内存优化] ProcessIdleTasks执行失败: ${error.message}`);
        }
        
        setTimeout(() => {
          if (global.gc) {
            writeLog('[内存优化] 执行V8垃圾回收...');
            global.gc();
          }
          
          if (mainWindow) {
            writeLog('[内存优化] 清理渲染进程缓存...');
            mainWindow.webContents.session.clearCache().catch((e: any) => writeLog(`[内存优化] 清理缓存失败: ${e.message}`));
            mainWindow.webContents.session.clearStorageData().catch((e: any) => writeLog(`[内存优化] 清理存储失败: ${e.message}`));
          }
          
          setTimeout(() => {
            writeLog('[内存优化] 内存优化完成');
            resolve(true);
          }, 2000);
        }, 3000);
      });
    });
  } else {
    if (global.gc) {
      writeLog('[内存优化] 执行V8垃圾回收...');
      global.gc();
    }
    
    if (mainWindow) {
      writeLog('[内存优化] 清理渲染进程缓存...');
      await mainWindow.webContents.session.clearCache();
      await mainWindow.webContents.session.clearStorageData();
    }
    
    writeLog('[内存优化] 内存优化完成');
    return true;
  }
});


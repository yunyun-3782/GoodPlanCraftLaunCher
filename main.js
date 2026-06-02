/* 
 * CaelLab BY-SA Code License 
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS 

 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher 
 */



const { app, BrowserWindow, ipcMain, net, dialog, Menu, shell } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const { tmpdir } = require('os');
const { pipeline } = require('stream/promises');

process.env.TZ = 'Asia/Shanghai';

app.commandLine.appendSwitch('js-flags', '--compile-hints-always');
app.commandLine.appendSwitch('disk-cache-size', '134217728');

function formatTimestamp() {
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

function checkDebuggerAttached() {
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


let isDeveloperMode = false;

let BASE_DIR;
let GAME_DIR;
let CACHE_DIR;
let LOG_DIR;
let LOG_FILE;
let APP_VERSION;
let CONFIG_DIR;

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
    scale: '110'
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

function parseIni(text) {
  const result = {};
  let currentSection = null;
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
      let value = keyValueMatch[2].trim();
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

function stringifyIni(obj) {
  let result = '';
  for (const [section, sectionData] of Object.entries(obj)) {
    result += `[${section}]\n`;
    for (const [key, value] of Object.entries(sectionData)) {
      result += `${key}=${value}\n`;
    }
    result += '\n';
  }
  return result.trim();
}

function mergeWithDefaults(settings) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const [section, sectionData] of Object.entries(settings)) {
    if (merged[section]) {
      for (const [key, value] of Object.entries(sectionData)) {
        if (key in merged[section]) {
          merged[section][key] = value;
        }
      }
    }
  }
  return merged;
}

function loadSettings() {
  try {
    const configPath = path.join(BASE_DIR, 'gpcl', 'config', 'setting.ini');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseIni(content);
      const merged = mergeWithDefaults(parsed);
      writeLog('配置已加载');
      return merged;
    }
  } catch (e) {
    writeLog(`加载配置失败: ${e.message}`);
  }
  writeLog('使用默认配置');
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettings(settings) {
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
  } catch (e) {
    writeLog(`保存配置失败: ${e.message}`);
    return false;
  }
}

function initPaths() {
  BASE_DIR = app.getPath('userData');
  GAME_DIR = path.join(BASE_DIR, '.minecraft');
  CACHE_DIR = path.join(BASE_DIR, 'gpcl', 'cache');
  LOG_DIR = path.join(BASE_DIR, 'gpcl', 'log');
  CONFIG_DIR = path.join(BASE_DIR, 'gpcl', 'config');
  const startupTime = new Date().toISOString().replace(/:/g, '-').replace('.', '_');
  LOG_FILE = path.join(LOG_DIR, `${startupTime}.log`);

  const requiredDirs = [
    path.join(BASE_DIR, 'gpcl', 'config'),
    path.join(BASE_DIR, 'gpcl', 'users'),
    LOG_DIR,
    CACHE_DIR
  ];

  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function cleanupExpiredLogs() {
  try {
    const settings = loadSettings();
    const autoClearLogs = settings.advanced?.autoClearLogs;
    
    if (!autoClearLogs) {
      writeLog('[日志清理] 自动清理日志已禁用');
      return;
    }

    const retentionValue = settings.advanced?.logRetentionValue || 7;
    const retentionUnit = settings.advanced?.logRetentionUnit || 'day';

    // 计算过期时间
    const now = Date.now();
    let expireTime;
    
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
      } catch (e) {
        writeLog(`[日志清理] 清理文件失败: ${file} - ${e.message}`);
      }
    }

    if (cleanedCount > 0) {
      writeLog(`[日志清理] 已清理 ${cleanedCount} 个过期日志文件`);
    } else {
      writeLog('[日志清理] 没有需要清理的过期日志');
    }
  } catch (e) {
    writeLog(`[日志清理] 清理过程出错: ${e.message}`);
  }
}

let mainWindow;
APP_VERSION = require('./package.json').version;

function writeLog(message) {
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

let isDownloading = false;
let currentDownloadVersion = null;
let shouldCancelDownload = false;
let currentDownloadType = null; // 'game' or 'java'
let currentDownloadPath = null; // 下载的文件或文件夹路径
let javaDownloadResolve = null; // Java下载对话框的Promise resolve
let javaDownloadReject = null; // Java下载对话框的Promise reject
let isJavaDownloading = false; // Java下载中标志

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    maxWidth: 1920,
    maxHeight: 1080,
    frame: false,
    title: 'GoodPlanCraftLauncher',
    icon: path.join(__dirname, 'gpcl', 'logo.ico'),
    backgroundColor: '#0d0d15',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  try { Menu.setApplicationMenu(null); } catch (e) {}
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));

  // 关闭窗口前拦截
  mainWindow.on('close', (event) => {
    if (isDownloading || isJavaDownloading) {
      event.preventDefault();
      // 发送询问到渲染进程
      mainWindow.webContents.send('confirm-close-while-downloading');
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isDeveloperMode) return;
    const key = input.key && input.key.toLowerCase();
    const ctrlOrCmd = input.control || input.meta;
    if ((ctrlOrCmd && key === 'r') || input.key === 'F5') event.preventDefault();
    if ((input.control && input.shift && key === 'i') || input.key === 'F12' || (input.meta && input.alt && key === 'i')) event.preventDefault();
  });

  mainWindow.webContents.on('context-menu', (e) => {
    if (!isDeveloperMode) e.preventDefault();
  });
}

app.on('web-contents-created', (event, contents) => {
  try {
    contents.on('context-menu', (e) => {
      if (!isDeveloperMode) e.preventDefault();
    });
    contents.on('before-input-event', (event, input) => {
      if (isDeveloperMode) return;
      const key = input.key && input.key.toLowerCase();
      const ctrlOrCmd = input.control || input.meta;
      if ((ctrlOrCmd && key === 'r') || input.key === 'F5') event.preventDefault();
      if ((input.control && input.shift && key === 'i') || input.key === 'F12' || (input.meta && input.alt && key === 'i')) event.preventDefault();
    });
  } catch (e) {}
});

// 单实例锁：当检测到第二个实例时，凸显已有窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createGPCLShortcut() {
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
  } catch (e) {
    writeLog(`[快捷方式] 创建 GPCL 快捷方式失败: ${e.message}`);
  }
}

app.whenReady().then(() => {
  // 检测是否是 electron-builder 的测试运行
  const isTesting = process.argv.includes('--squirrel-install') || 
                    process.argv.includes('--squirrel-obsolete') ||
                    process.argv.includes('--squirrel-updated') ||
                    process.argv.includes('--testing');
  
  if (isTesting) {
    console.log('[启动] 检测到构建测试模式，跳过窗口创建');
    app.quit();
    return;
  }

  // 提前初始化 BASE_DIR 以读取配置文件
  BASE_DIR = app.getPath('userData');

  // 检查是否启用防止多次启动
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
  createWindow();
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('show-message-dialog', async (_, options) => {
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

// Java版本 → 官方runtime目录名映射
const JAVA_RUNTIME_MAP = {
  "8": "jre-legacy",
  "16": "java-runtime-beta",
  "17": "java-runtime-gamma",
  "21": "java-runtime-delta",
  "25": "java-runtime-epsilon"
};

// Java版本 → 下载URL的key映射
const JAVA_DOWNLOAD_KEYS = {
  "8": "jre-legacy",
  "17": "java-runtime-gamma",
  "21": "java-runtime-delta",
  "25": "java-runtime-epsilon"
};

// 可选择的Java版本列表
const JAVA_VERSIONS_AVAILABLE = ["8", "17", "21", "25"];

// 获取Java运行时目录（官方目录结构，使用绝对路径）
function getJavaRuntimeDir(javaVersion) {
  const runtimeName = JAVA_RUNTIME_MAP[javaVersion] || `jre${javaVersion}`;
  // 使用官方Minecraft运行时目录：C:\Users\用户名\AppData\Roaming\.minecraft\runtime
  return path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft', 'runtime', runtimeName);
}

// 在目录中查找java.exe（自动拼接\bin\，使用java.exe以便捕获错误输出）
function findJavaExecutable(runtimeDir) {
  // 优先使用 bin\java.exe（可以捕获控制台输出用于调试）
  const javaPath = path.join(runtimeDir, 'bin', 'java.exe');
  if (fs.existsSync(javaPath)) {
    try {
      fs.accessSync(javaPath, fs.constants.R_OK);
      return javaPath;
    } catch (e) {
      return null;
    }
  }
  // 兜底：递归查找
  return findJavaExecutableInDir(runtimeDir);
}

// 检查指定版本的Java是否已安装
async function checkJavaInstalled(javaVersion) {
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  if (fs.existsSync(runtimeDir)) {
    const exe = findJavaExecutable(runtimeDir);
    if (exe) {
      return { installed: true, javaPath: exe };
    }
  }
  return { installed: false, javaPath: null };
}

// 获取指定Minecraft版本所需的Java版本
function getJavaVersionForMCVersion(versionId) {
  // Minecraft 1.16及以下: Java 8
  // Minecraft 1.17: Java 16
  // Minecraft 1.18-1.20: Java 17
  // Minecraft 1.21+: Java 21
  const parts = versionId.split('.');
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  // 如果版本号是 "26" 这种没有点的格式
  if (isNaN(major)) major = 1;
  // 处理像 "26" 这种格式（没有 minor）
  if (isNaN(minor)) {
    // 26 及以上使用 Java 25
    if (major >= 26) return '25';
    // 21-25 使用 Java 21
    if (major >= 21) return '21';
    // 否则默认 Java 17
    return '17';
  }
  // 处理 1.x.x 的旧版本
  if (major === 1) {
    if (minor < 17) return '8';
    if (minor === 17) return '16';
    if (minor <= 20) return '17';
    return '21';
  }
  // 处理 2.x.x 和更大的版本（21, 24, 26, ...）
  // 26 及以上使用 Java 25
  if (major >= 26) return '25';
  // 21-25 使用 Java 21
  if (major >= 21) return '21';
  return '17';
}

// 获取版本数据中指定的Java版本
function getJavaVersionFromVersionData(versionData) {
  if (versionData?.javaVersion?.majorVersion) {
    return String(versionData.javaVersion.majorVersion);
  }
  if (versionData?.javaVersion?.component) {
    const m = versionData.javaVersion.component.match(/\d+/);
    if (m) return m[0];
  }
  return getJavaVersionForMCVersion(versionData.id);
}

// 查找本地Java运行时（只查找，不下载）
async function ensureJavaRuntime(version) {
  const javaVersion = typeof version === 'string' ? version : String(version);
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  
  writeLog(`[Java] 查找 Java ${javaVersion} 运行时: ${runtimeDir}`);
  
  if (fs.existsSync(runtimeDir)) {
    const exe = findJavaExecutable(runtimeDir);
    if (exe) {
      writeLog(`[Java] 找到 Java ${javaVersion}: ${exe}`);
      return exe;
    }
  }
  
  writeLog(`[Java] 未找到 Java ${javaVersion} 运行时`);
  return null;
}

// 完整的Java运行时保证（包括下载和安装）
async function ensureJavaRuntimeWithInstall(version, mainWindow) {
  const javaVersion = typeof version === 'string' ? version : String(version);
  
  // 先检查是否已安装
  const installed = await checkJavaInstalled(javaVersion);
  if (installed.installed && installed.javaPath) {
    writeLog(`[Java] Java ${javaVersion} 已安装: ${installed.javaPath}`);
    return { success: true, javaPath: installed.javaPath };
  }
  
  // 如果未安装，触发下载流程
  writeLog(`[Java] Java ${javaVersion} 未安装，开始下载流程`);
  return null;
}

// 用户确认关闭并清理
ipcMain.handle('confirm-close-download', async () => {
  if (isDownloading && currentDownloadVersion) {
    shouldCancelDownload = true;
    
    try {
      // 清理游戏版本下载
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
    } catch (e) {
      console.error('清理下载失败:', e);
      writeLog(`清理下载失败: ${e.message}`);
    }
    
    isDownloading = false;
    currentDownloadVersion = null;
    currentDownloadType = null;
    currentDownloadPath = null;
  }
  if (mainWindow) {
    mainWindow.destroy();
  }
  return { success: true };
});

// 取消关闭
ipcMain.handle('cancel-close', () => {
  return { success: true };
});

// 取消启动游戏
let launchCancelFlag = false;
let currentGameProcess = null;
let currentGamePid = null;

function killGameProcessTree(pid) {
  try {
    const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    if (result.status === 0) {
      writeLog(`[启动] 已终止进程树 PID: ${pid}`);
      return true;
    }
    writeLog(`[启动] taskkill PID ${pid} 返回: ${result.status}, ${result.stderr?.toString().trim()}`);
  } catch (e) {
    writeLog(`[启动] taskkill 失败: ${e.message}`);
  }
  return false;
}

function findAndKillMinecraftJavaProcesses() {
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
    const output = (result.stdout || '').trim();
    if (output) {
      const pids = output.split('\n').filter(l => l.startsWith('KILLED:')).map(l => l.replace('KILLED:', ''));
      writeLog(`[启动] 通过命令行匹配杀死了 ${pids.length} 个Minecraft Java进程: ${pids.join(', ')}`);
      return pids.length > 0;
    }
  } catch (e) {
    writeLog(`[启动] 查找Minecraft进程失败: ${e.message}`);
  }
  return false;
}

ipcMain.handle('cancel-launch', async () => {
  launchCancelFlag = true;
  writeLog('[启动] 用户取消启动');

  let killed = false;

  if (currentGameProcess) {
    try {
      const pid = currentGameProcess.pid;
      if (pid) {
        writeLog(`[启动] 尝试终止游戏进程 PID: ${pid}`);
        killed = killGameProcessTree(pid);
        try { currentGameProcess.kill(); } catch {}
      }
    } catch (e) {
      writeLog(`[启动] 终止游戏进程异常: ${e.message}`);
    }
    currentGameProcess = null;
    currentGamePid = null;
  }

  if (!killed) {
    writeLog('[启动] 未找到已保存的游戏进程，尝试通过命令行匹配查找Minecraft Java进程');
    findAndKillMinecraftJavaProcesses();
  }

  if (mainWindow) {
    mainWindow.webContents.send('game-closed', -1);
  }

  return { success: true };
});

// 检查更新（使用Node.js网络请求避免CORS问题）
const https = require('https');
ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const url = 'https://gamets.caellab.com/gpcl/data.json';
    writeLog('[更新] 开始检查更新...');
    
    https.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          writeLog('[更新] 获取到数据: ' + data);
          resolve({ success: true, data: json });
        } catch (e) {
          writeLog('[更新] JSON解析失败: ' + e.message);
          resolve({ success: false, error: 'JSON解析失败: ' + e.message });
        }
      });
    }).on('error', (e) => {
      writeLog('[更新] 请求失败: ' + e.message);
      resolve({ success: false, error: e.message });
    });
  });
});

// 获取当前版本号（从package.json读取）
ipcMain.handle('get-app-version', () => {
  return APP_VERSION || app.getVersion() || '1.0.0';
});

// 打开外部链接
ipcMain.handle('open-external', (_, url) => {
  try {
    shell.openExternal(url);
    return { success: true };
  } catch (e) {
    writeLog('[外部链接] 打开失败: ' + e.message);
    return { success: false, error: e.message };
  }
});

// IPC: 卸载Java运行时
ipcMain.handle('uninstall-java', async (_, javaVersion) => {
  try {
    const runtimeDir = getJavaRuntimeDir(javaVersion);
    writeLog(`[Java] 开始卸载 Java ${javaVersion}，目录: ${runtimeDir}`);

    if (!fs.existsSync(runtimeDir)) {
      return { success: false, error: `Java ${javaVersion} 未安装` };
    }

    fs.rmSync(runtimeDir, { recursive: true, force: true });
    writeLog(`[Java] Java ${javaVersion} 已卸载，目录已删除: ${runtimeDir}`);

    if (mainWindow) {
      mainWindow.webContents.send('java-uninstalled', { javaVersion });
    }

    return { success: true };
  } catch (e) {
    writeLog(`[Java] 卸载 Java ${javaVersion} 失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

// 获取Java镜像源设置
ipcMain.handle('get-java-mirror-settings', () => {
  try {
    const settingsPath = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return {
      mirror: 'tsinghua',
      customUrl: ''
    };
  } catch (e) {
    return {
      mirror: 'tsinghua',
      customUrl: ''
    };
  }
});

// 获取Java版本对应的下载URL
ipcMain.handle('get-java-download-url', async (_, javaVersion) => {
  try {
    const settingsPath = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    let settings = {
      mirror: 'tsinghua',
      customUrl: ''
    };
    
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    
    // 根据镜像源生成URL
    const url = getJavaDownloadUrl(javaVersion, settings.mirror, settings.customUrl);
    writeLog(`[Java] 获取下载URL: Java ${javaVersion} - ${url}`);
    return { success: true, url };
  } catch (e) {
    writeLog(`[Java] 获取下载URL失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

// 根据镜像源生成下载URL
function getJavaDownloadUrl(javaVersion, mirror, customUrl) {
  // 清华大学镜像
  const tsinghuaMirrors = {
    "8": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jre/x64/windows/OpenJDK8U-jre_x64_windows_hotspot_8u492b09.zip",
    "17": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/x64/windows/OpenJDK17U-jre_x64_windows_hotspot_17.0.19_10.zip",
    "21": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jre/x64/windows/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip",
    "25": "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/25/jre/x64/windows/OpenJDK25U-jre_x64_windows_hotspot_25.0.3_9.zip"
  };
  
  // 如果使用清华大学镜像
  if (mirror === 'tsinghua') {
    return tsinghuaMirrors[javaVersion] || tsinghuaMirrors["17"];
  }
  
  // 如果使用自定义镜像
  if (mirror === 'custom' && customUrl) {
    // 替换{v}变量
    let url = customUrl;
    
    // Java版本号（8, 17, 21等）
    url = url.replace(/\{v\}/gi, javaVersion);
    
    // 完整版本号的映射
    const versionMap = {
      "8": "8u492b09",
      "17": "17.0.19_10",
      "21": "21.0.11_10",
      "25": "25.0.3_9"
    };
    url = url.replace(/\{version\}/gi, versionMap[javaVersion] || javaVersion);
    
    return url;
  }
  
  // 默认使用清华大学镜像
  return tsinghuaMirrors[javaVersion] || tsinghuaMirrors["17"];
}

// 保存Java镜像源设置
function saveJavaMirrorSettings(mirror, customUrl) {
  try {
    const settingsDir = path.join(GAME_DIR, 'settings');
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    const settingsPath = path.join(settingsDir, 'java_mirror.json');
    fs.writeFileSync(settingsPath, JSON.stringify({
      mirror,
      customUrl
    }, null, 2));
    writeLog(`[Java] 镜像源设置已保存: ${mirror}`);
    return true;
  } catch (e) {
    writeLog(`[Java] 保存镜像源设置失败: ${e.message}`);
    return false;
  }
}

// 取消下载（只清理文件，不关闭窗口）
ipcMain.handle('cancel-download-only', async () => {
  writeLog('[取消下载] 开始取消下载流程');
  
  // 设置取消标志
  shouldCancelDownload = true;
  
  // 清空下载队列
  const pendingCount = downloadQueue.length;
  downloadQueue = [];
  writeLog(`[取消下载] 已清空 ${pendingCount} 个待处理下载任务`);
  
  // 等待当前活跃的下载完成（最多等待2秒）
  const waitStart = Date.now();
  while (activeDownloads > 0 && (Date.now() - waitStart) < 2000) {
    await new Promise(r => setTimeout(r, 100));
  }
  writeLog(`[取消下载] 活跃下载数: ${activeDownloads}`);
  
  if ((isDownloading && currentDownloadVersion) || isJavaDownloading) {
    try {
      if (currentDownloadType === 'game' && currentDownloadPath) {
        // 清理游戏版本下载
        const versionDir = currentDownloadPath;
        if (fs.existsSync(versionDir)) {
          const files = fs.readdirSync(versionDir);
          for (const file of files) {
            const filePath = path.join(versionDir, file);
            try {
              if (fs.statSync(filePath).isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch (e) {
              writeLog(`清理文件失败: ${filePath} - ${e.message}`);
            }
          }
        }
        writeLog(`[取消下载] 已清理游戏版本下载目录: ${versionDir}`);
      } else if (currentDownloadType === 'java' && currentDownloadPath) {
        // 清理Java下载
        const javaFile = currentDownloadPath;
        if (fs.existsSync(javaFile)) {
          try {
            fs.unlinkSync(javaFile);
            writeLog(`[取消下载] 已清理Java下载文件: ${javaFile}`);
          } catch (e) {
            writeLog(`清理Java文件失败: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error('清理下载失败:', e);
      writeLog(`清理下载失败: ${e.message}`);
    }
    
    // 重置所有下载状态
    isDownloading = false;
    isJavaDownloading = false;
    currentDownloadVersion = null;
    currentDownloadType = null;
    currentDownloadPath = null;
    activeDownloads = 0;
    totalDownloadFiles = 0;
    completedDownloadFiles = 0;
  }
  
  // 通知渲染进程下载已取消
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('download-cancelled');
  }
  
  writeLog('[取消下载] 取消下载流程完成');
  return { success: true };
});

// 显示Java版本选择对话框
ipcMain.handle('show-java-install-dialog', async (_, options) => {
  try {
    const { mcVersion, recommendedJava } = options;
    
    // 构建版本选择列表，按推荐程度排序
    const versionPriority = {
      [recommendedJava]: 0,
      "17": 1,
      "21": 2,
      "25": 3,
      "8": 4
    };
    
    const sortedVersions = [...JAVA_VERSIONS_AVAILABLE].sort((a, b) => {
      return (versionPriority[a] || 99) - (versionPriority[b] || 99);
    });
    
    const result = await new Promise((resolve, reject) => {
      javaDownloadResolve = resolve;
      javaDownloadReject = reject;
      
      // 发送消息给渲染进程显示对话框
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
  } catch (e) {
    writeLog(`Java安装对话框错误: ${e.message}`);
    return { success: false, cancelled: true };
  }
});

// 用户在对话框中选择Java版本
ipcMain.handle('select-java-version', async (_, data) => {
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

// 下载并安装Java运行时
async function downloadAndInstallJava(javaVersion) {
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  
  writeLog(`[Java] 开始安装 Java ${javaVersion} 运行时`);
  
  try {
    // 检查是否已存在
    if (fs.existsSync(runtimeDir)) {
      const exe = findJavaExecutable(runtimeDir);
      if (exe) {
        writeLog(`[Java] Java ${javaVersion} 已存在，无需下载`);
        return { success: true, javaPath: exe };
      }
    }
    
    // 获取Java运行时的下载URL（支持自定义镜像源）
    const settingsPath = path.join(GAME_DIR, 'settings', 'java_mirror.json');
    let settings = { mirror: 'tsinghua', customUrl: '' };
    
    try {
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e) {}
    
    const downloadUrl = getJavaDownloadUrl(javaVersion, settings.mirror, settings.customUrl);
    writeLog(`[Java] 使用镜像源: ${settings.mirror}, URL: ${downloadUrl}`);
    
    // 使用Electron webContents下载（更可靠）
    const result = await downloadJavaWithWebContents(javaVersion, downloadUrl);
    return result;
    
  } catch (e) {
    writeLog(`[Java] Java ${javaVersion} 安装失败: ${e.message}`);
    
    // 清理失败的安装
    if (fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (e2) {}
    }
    
    return { success: false, error: e.message };
  }
}

// 使用Electron webContents下载Java（推荐方法）
async function downloadJavaWithWebContents(javaVersion, downloadUrl) {
  const runtimeName = JAVA_RUNTIME_MAP[javaVersion];
  const runtimeDir = getJavaRuntimeDir(javaVersion);
  const tempDir = path.join(CACHE_DIR, 'java_temp');
  const tempFile = path.join(tempDir, `java-${javaVersion}.zip`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  writeLog(`[Java] 使用Electron下载 Java ${javaVersion}: ${downloadUrl}`);

  // 设置下载路径，以便取消时能正确删除
  currentDownloadVersion = `java-${javaVersion}`;
  currentDownloadType = 'java';
  currentDownloadPath = tempFile;
  shouldCancelDownload = false;
  isJavaDownloading = true;

  return new Promise((resolve, reject) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) {
      isJavaDownloading = false;
      currentDownloadVersion = null;
      currentDownloadType = null;
      currentDownloadPath = null;
      reject(new Error('没有可用的窗口'));
      return;
    }

    // 使用webContents.downloadURL
    win.webContents.downloadURL(downloadUrl, true);

    // 监听下载开始
    win.webContents.session.once('will-download', (event, item) => {
      // 设置下载路径
      item.setSavePath(tempFile);
      
      const totalBytes = item.getTotalBytes();
      writeLog(`[Java] 开始下载，总大小: ${totalBytes} bytes`);

      // 监听进度
      item.on('updated', (event, state) => {
        if (state === 'progressing') {
          const received = item.getReceivedBytes();
          const percent = totalBytes > 0 ? Math.floor((received / totalBytes) * 100) : 0;
          
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

      // 监听完成
      item.on('done', (event, state) => {
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
          reject(new Error('下载中断'));
          return;
        }

        if (state === 'completed') {
          writeLog(`[Java] 下载完成，开始解压...`);
          
          // 验证文件
          const fileStats = fs.statSync(tempFile);
          const fileSize = fileStats.size;
          
          if (fileSize < 1024) {
            reject(new Error(`下载失败：文件太小 (${fileSize} bytes)`));
            return;
          }
          
          // 检查ZIP头
          const header = Buffer.alloc(4);
          const fd = fs.openSync(tempFile, 'r');
          fs.readSync(fd, header, 0, 4, 0);
          fs.closeSync(fd);
          
          if (header.toString('hex') !== '504b0304') {
            reject(new Error('下载失败：文件不是有效的ZIP格式'));
            return;
          }
          
          writeLog(`[Java] 文件验证通过，大小: ${fileSize} bytes`);
          
          // 解压
          const parentDir = path.dirname(runtimeDir);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          
          if (fs.existsSync(runtimeDir)) {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
          }
          
          try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tempFile);
            zip.extractAllTo(parentDir, false);
            writeLog(`[Java] 解压完成`);
          } catch (zipError) {
            reject(new Error(`解压失败: ${zipError.message}`));
            return;
          }
          
          // 重命名目录
          const entries = fs.readdirSync(parentDir);
          let extractedDir = null;
          for (const entry of entries) {
            const entryPath = path.join(parentDir, entry);
            if (fs.statSync(entryPath).isDirectory()) {
              if (entry.includes('jdk') || entry.includes('jre')) {
                const binPath = path.join(entryPath, 'bin', 'java.exe');
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
          
          // 清理临时文件
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {}
          
          // 验证安装
          const javaPath = findJavaExecutable(runtimeDir);
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

    // 超时处理（10分钟）
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
  }).catch((e) => {
    writeLog(`[Java] Java ${javaVersion} 安装失败: ${e.message}`);
    if (fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (e2) {}
    }
    return { success: false, error: e.message };
  });
}

// 从Minecraft元数据获取Java运行时的下载信息
async function getJavaRuntimeDownloadInfo(javaVersion) {
  try {
    const runtimeKey = JAVA_DOWNLOAD_KEYS[javaVersion];
    if (!runtimeKey) {
      writeLog(`[Java] 不支持的Java版本: ${javaVersion}`);
      return null;
    }
    
    writeLog(`[Java] 正在查找 Java ${javaVersion} (${runtimeKey}) 的下载信息...`);
    
    // 使用清华大学开源软件镜像站（TUNA）的Adoptium镜像
    const runtimeInfo = {
      "8": {
        id: "jre-legacy",
        version: "8",
        url: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jre/x64/windows/OpenJDK8U-jre_x64_windows_hotspot_8u492b09.zip"
      },
      "17": {
        id: "java-runtime-gamma",
        version: "17",
        url: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/x64/windows/OpenJDK17U-jre_x64_windows_hotspot_17.0.19_10.zip"
      },
      "21": {
        id: "java-runtime-delta",
        version: "21",
        url: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jre/x64/windows/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip"
      },
      "25": {
        id: "java-runtime-epsilon",
        version: "25",
        url: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/25/jre/x64/windows/OpenJDK25U-jre_x64_windows_hotspot_25.0.3_9.zip"
      }
    };
    
    const javaInfo = runtimeInfo[javaVersion];
    if (javaInfo) {
      writeLog(`[Java] ✓ 找到 Java ${javaVersion} 下载信息`);
      writeLog(`[Java] URL: ${javaInfo.url}`);
      return {
        url: javaInfo.url,
        name: javaInfo.id,
        sha1: null,
        size: null
      };
    }
    
    writeLog(`[Java] ✗ 无法找到 Java ${javaVersion} 的下载信息`);
    return null;
    
  } catch (e) {
    writeLog(`[Java] 获取Java运行时下载信息失败: ${e.message}`);
    return null;
  }
}

// 获取MC版本推荐的Java版本
function getRecommendedJavaVersion(mcVersion) {
  // Minecraft 1.16.5及以下: Java 8
  // Minecraft 1.17: Java 16/17
  // Minecraft 1.18-1.20.4: Java 17
  // Minecraft 1.20.5+: Java 21
  // Minecraft 1.21+: Java 21/25
  // Minecraft 26+: Java 21

  const parts = mcVersion.split('.');
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  let patch = parts.length > 2 ? parseInt(parts[2], 10) : 0;

  // 如果版本号是 "26" 这种没有点的格式
  if (isNaN(major)) major = 1;

  // 处理像 "26" 这种格式（只有 major 没有 minor）
  if (isNaN(minor)) {
    // 26 及以上使用 Java 25
    if (major >= 26) return '25';
    // 21-25 使用 Java 21
    if (major >= 21) return '21';
    return '17';
  }

  // 处理 1.x.x 的旧版本
  if (major === 1) {
    if (minor < 17) return '8';
    if (minor === 17) return '17';
    if (minor <= 20) return '17';
    if (minor === 21 && patch <= 4) return '21';
    if (minor === 21 && patch > 4) return '21';
    if (minor >= 22) return '21';
    return '17';
  }

  // 处理 2.x.x 和更大的版本（21, 24, 26, ...）
  // 26 及以上使用 Java 25
  if (major >= 26) return '25';
  // 21-25 使用 Java 21
  if (major >= 21) return '21';
  return '17';
}

function findJavaExecutableInDir(rootDir) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const javaw = path.join(current, 'bin', 'javaw.exe');
    const java = path.join(current, 'bin', 'java.exe');
    if (fs.existsSync(javaw)) return javaw;
    if (fs.existsSync(java)) return java;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) stack.push(path.join(current, e.name));
      }
    } catch (e) {}
  }
  return null;
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const fallbackToHttps = (reason) => {
      if (finished) return;
      try {
        const https = require('https');
        const req2 = https.get(url, { timeout: 20000 }, res2 => {
          let body = '';
          res2.on('data', d => body += d);
          res2.on('end', () => { finished = true; resolve(body); });
          res2.on('error', err2 => { if (!finished) { finished = true; reject(err2); } });
        });
        req2.on('timeout', () => { req2.destroy(); if (!finished) { finished = true; reject('超时'); } });
        req2.on('error', err2 => { if (!finished) { finished = true; reject(err2); } });
      } catch (e2) {
        if (!finished) { finished = true; reject(e2); }
      }
    };

    try {
      const req = net.request(url);
      const to = setTimeout(() => { try { req.abort(); } catch {} ; fallbackToHttps('timeout'); }, 20000);

      req.on('response', res => {
        clearTimeout(to);
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => { if (!finished) { finished = true; resolve(body); } });
        res.on('error', err => { if (!finished) fallbackToHttps(err); });
      });

      req.on('error', err => { if (!finished) fallbackToHttps(err); });
      req.end();
    } catch (e) {
      fallbackToHttps(e);
    }
  });
}

let MAX_CONCURRENT = 128;
let downloadQueue = [];
let activeDownloads = 0;
let totalDownloadFiles = 0;
let completedDownloadFiles = 0;
let currentDownloadSpeed = 0;

async function downloadWithPool(url, dest, label) {
  return new Promise((resolve, reject) => {
    downloadQueue.push({ url, dest, label, resolve, reject });
    processDownloadQueue();
  });
}

async function processDownloadQueue() {
  while (downloadQueue.length > 0 && activeDownloads < MAX_CONCURRENT && !shouldCancelDownload) {
    const task = downloadQueue.shift();
    activeDownloads++;
    downloadFileInternal(task.url, task.dest, task.label)
      .then(() => {
        task.resolve();
      })
      .catch(err => {
        task.reject(err);
      })
      .finally(() => {
        activeDownloads--;
        completedDownloadFiles++;
        processDownloadQueue();
      });
  }
  
  // 如果取消下载，拒绝队列中所有剩余任务
  if (shouldCancelDownload) {
    while (downloadQueue.length > 0) {
      const task = downloadQueue.shift();
      task.reject(new Error('下载已取消'));
    }
    // 通知渲染进程下载已取消
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('download-cancelled');
    }
  }
}

async function downloadFile(url, dest, label) {
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

async function downloadFileInternal(url, dest, label) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 确保使用二进制模式写入
    const file = fs.createWriteStream(dest, { encoding: null });
    let loaded = 0;
    let total = 0;

    const fallbackToHttps = (reason) => {
      writeLog(`[下载] ${label} HTTP请求失败: ${reason}，尝试HTTPS`);
      try {
        const https = require('https');
        
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
        
        const req2 = https.get(url, options, res2 => {
          // 处理重定向
          if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
            writeLog(`[下载] ${label} 重定向到: ${res2.headers.location}`);
            file.close();
            // 递归处理重定向
            downloadFileInternal(res2.headers.location, dest, label).then(resolve).catch(reject);
            return;
          }
          
          total = parseInt(res2.headers['content-length'] || '0', 10);
          
          // 检查内容类型
          const contentType = res2.headers['content-type'] || '';
          if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
            writeLog(`[下载] ${label} 警告: 内容类型是 ${contentType}，可能不是ZIP文件`);
          }
          
          writeLog(`[下载] ${label} 开始下载，大小: ${total} bytes`);
          
          res2.on('data', d => {
            if (shouldCancelDownload) {
              req2.destroy();
              file.destroy();
              reject(new Error('下载已取消'));
              return;
            }
            loaded += d.length;
            file.write(d);
            const p = total > 0 ? Math.floor((loaded / total) * 100) : 0;
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
          res2.on('error', err2 => {
            file.destroy();
            reject(err2);
          });
        });
        req2.on('timeout', () => { req2.destroy(); reject('超时'); });
        req2.on('error', err2 => {
          file.destroy();
          reject(err2);
        });
      } catch (e2) {
        file.destroy();
        reject(e2);
      }
    };

    try {
      const req = net.request(url);
      const to = setTimeout(() => { try { req.abort(); } catch {} ; fallbackToHttps('timeout'); }, 60000);
      
      // 设置User-Agent头
      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      req.on('response', res => {
        clearTimeout(to);
        
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          writeLog(`[下载] ${label} 重定向到: ${res.headers.location}`);
          file.close();
          // 递归处理重定向
          downloadFileInternal(res.headers.location, dest, label).then(resolve).catch(reject);
          return;
        }
        
        total = parseInt(res.headers['content-length'] || '0', 10);
        
        // 检查内容类型
        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
          writeLog(`[下载] ${label} 警告: 内容类型是 ${contentType}，可能不是ZIP文件`);
        }
        
        writeLog(`[下载] ${label} 开始下载，大小: ${total} bytes`);
        
        res.on('data', d => {
          if (shouldCancelDownload) {
            try { req.abort(); } catch {}
            file.destroy();
            reject(new Error('下载已取消'));
            return;
          }
          loaded += d.length;
          file.write(d);
          const p = total > 0 ? Math.floor((loaded / total) * 100) : 0;
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
        res.on('error', err => {
          file.destroy();
          fallbackToHttps(err);
        });
      });

      req.on('error', err => {
        file.destroy();
        fallbackToHttps(err);
      });

      req.end();
    } catch (e) {
      file.destroy();
      fallbackToHttps(e);
    }
  });
}

// 带超时的下载包装器，超时后会抛出错误让调用方尝试下一个源
async function downloadFileInternalWithTimeout(url, dest, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`连接超时 (${timeoutMs / 1000}秒)`));
      }
    }, timeoutMs);

    downloadFileInternal(url, dest, label)
      .then(result => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

async function installVersion(versionId, maxConcurrent = 20, downloadPath = null) {
  const targetDir = downloadPath || path.join(GAME_DIR, 'versions', versionId);
  const versionDir = targetDir;
  const cancelFilePath = path.join(versionDir, 'CancelDownload.txt');
  if (fs.existsSync(cancelFilePath)) {
    try { fs.unlinkSync(cancelFilePath); } catch (e) {}
  }

  // 重置取消标志
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

    const versionDir = path.join(GAME_DIR, 'versions', versionId);
    if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

    const versionJsonPath = path.join(versionDir, versionId + '.json');
    const versionJarPath = path.join(versionDir, versionId + '.jar');

    // 获取版本清单
    const manifest = JSON.parse(await fetchText('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
    const vInfo = manifest.versions.find(v => v.id === versionId);
    if (!vInfo) throw new Error('版本不存在: ' + versionId);

    // 下载版本JSON
    if (!fs.existsSync(versionJsonPath)) {
      const vData = await fetchText(vInfo.url);
      fs.writeFileSync(versionJsonPath, vData);
    }

    const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

    // 下载客户端JAR
    if (!fs.existsSync(versionJarPath)) {
      await downloadFile(versionData.downloads.client.url, versionJarPath, '客户端');
    }
    
    // 检查是否取消
    if (shouldCancelDownload) {
      writeLog(`下载取消：${versionId}`);
      throw new Error('下载已取消');
    }

    // 下载资源索引
    const assetIndexPath = path.join(GAME_DIR, 'assets', 'indexes', versionData.assetIndex.id + '.json');
    if (!fs.existsSync(assetIndexPath)) {
      await downloadFile(versionData.assetIndex.url, assetIndexPath, '资源索引');
    }
    
    // 检查是否取消
    if (shouldCancelDownload) {
      writeLog(`下载取消：${versionId}`);
      throw new Error('下载已取消');
    }

    // 等待资源索引下载完成并读取
    let assetIndexData;
    for (let i = 0; i < 10; i++) {
      try {
        assetIndexData = JSON.parse(fs.readFileSync(assetIndexPath, 'utf8'));
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (!assetIndexData) throw new Error('无法读取资源索引');

    // 收集所有需要下载的文件
    const toDownload = [];

    // 资源文件
    for (const [name, obj] of Object.entries(assetIndexData.objects)) {
      const hash = obj.hash;
      const prefix = hash.substring(0, 2);
      const assetPath = path.join(GAME_DIR, 'assets', 'objects', prefix, hash);
      if (!fs.existsSync(assetPath)) {
        toDownload.push({
          url: `https://resources.download.minecraft.net/${prefix}/${hash}`,
          dest: assetPath,
          label: `资源: ${name}`
        });
      }
    }

    // 库文件
    for (const lib of versionData.libraries) {
      if (lib.downloads?.artifact) {
        const libPath = path.join(GAME_DIR, 'libraries', lib.downloads.artifact.path);
        if (!fs.existsSync(libPath)) {
          toDownload.push({
            url: lib.downloads.artifact.url,
            dest: libPath,
            label: `库: ${lib.name}`
          });
        }
      }
      if (lib.downloads?.classifiers) {
        for (const [cls, info] of Object.entries(lib.downloads.classifiers)) {
          if (cls.includes('natives-windows')) {
            const libPath = path.join(GAME_DIR, 'libraries', info.path);
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

    // 并发下载所有文件
    const downloadPromises = toDownload.map(item => downloadFile(item.url, item.dest, item.label));
    await Promise.all(downloadPromises);

    // 解压原生库
    const nativesDir = path.join(GAME_DIR, 'versions', versionId, 'natives');
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

    for (const lib of versionData.libraries) {
      if (lib.downloads?.classifiers) {
        for (const [cls, info] of Object.entries(lib.downloads.classifiers)) {
          if (cls.includes('natives-windows')) {
            const libPath = path.join(GAME_DIR, 'libraries', info.path);
            if (fs.existsSync(libPath)) {
              const AdmZip = require('adm-zip');
              const zip = new AdmZip(libPath);
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
    
    // 更新版本最后启动时间
    updateVersionLastPlayed(versionId, targetDir);
    
    return { success: true };
  } catch (e) {
    writeLog(`下载失败：${versionId} - ${e.message}`);
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

// 更新版本的最后启动时间
function updateVersionLastPlayed(versionId, targetDir) {
  try {
    const versionDir = targetDir || path.join(GAME_DIR, 'versions', versionId);
    const gpclDir = path.join(versionDir, 'gpcl');
    const configPath = path.join(gpclDir, 'config.json');
    
    let settings = {};
    
    // 读取现有配置
    if (fs.existsSync(configPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        settings = {};
      }
    }
    
    // 更新最后启动时间
    settings.lastPlayed = new Date().toISOString();
    
    // 确保目录存在
    if (!fs.existsSync(gpclDir)) {
      fs.mkdirSync(gpclDir, { recursive: true });
    }
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    writeLog(`[版本] ${versionId} 最后启动时间已更新: ${settings.lastPlayed}`);
    
  } catch (e) {
    writeLog(`[版本] 更新 ${versionId} 最后启动时间失败: ${e.message}`);
  }
}

ipcMain.handle('scan-versions', async (_, gameDir, silent = false) => {
  const targetDir = gameDir ? path.resolve(gameDir) : GAME_DIR;
  const versionsDir = path.join(targetDir, 'versions');
  if (!fs.existsSync(versionsDir)) {
    if (!silent) writeLog('扫描本地版本：未找到versions目录');
    return [];
  }
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versions = [];
  const skippedVersions = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const versionDir = path.join(versionsDir, entry.name);
      try {
        const files = fs.readdirSync(versionDir);
        
        // 检查是否只有一个 CancelDownload.txt 文件
        if (files.length === 1 && files[0] === 'CancelDownload.txt') {
          skippedVersions.push(entry.name);
          if (!silent) writeLog(`扫描本地版本：跳过空目录 "${entry.name}"（仅包含 CancelDownload.txt）`);
          continue;
        }
        
        // 查找所有 .json 文件
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        // 如果没有 .json 文件，跳过
        if (jsonFiles.length === 0) {
          skippedVersions.push(entry.name);
          if (!silent) writeLog(`扫描本地版本：跳过 "${entry.name}"（无 .json 文件）`);
          continue;
        }
        
        // 收集所有版本（包括原版和带模组加载器的版本）
        // 原版: 1.21.1 -> versionId = "1.21.1"
        // Forge: 1.21.1-forge -> versionId = "1.21.1-forge"
        // Fabric: 1.21.1-fabric -> versionId = "1.21.1-fabric"
        
        const baseVersionId = entry.name; // 文件夹名
        const mcVersion = baseVersionId; // MC 版本号
        
        // 总是添加原版
        if (jsonFiles.includes(`${baseVersionId}.json`)) {
          versions.push(baseVersionId);
        }
        
        // 检查是否有模组加载器版本
        for (const jsonFile of jsonFiles) {
          const jsonVersionId = jsonFile.replace('.json', '');
          // 如果不是原版，且不在列表中，添加它
          if (jsonVersionId !== baseVersionId && !versions.includes(jsonVersionId)) {
            versions.push(jsonVersionId);
          }
        }
        
      } catch (e) {
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
    const cacheFile = path.join(CACHE_DIR, 'version_manifest.json');

    let data;
    let fromCache = false;
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const age = Date.now() - stat.mtimeMs;
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
      } catch (e) {
        writeLog(`远程拉取版本列表：失败 - ${e.message}`);
        return [];
      }
    } else {
      writeLog(`读取本地缓存版本列表：成功`);
    }

    const parsed = JSON.parse(data);
    // 返回所有类型的版本，包括正式版、快照版、旧测试版
    writeLog(`版本列表：共 ${parsed.versions.length} 个版本`);
    return parsed.versions;
  } catch (e) {
    writeLog(`版本列表解析失败：${e.message}`);
    return [];
  }
});

ipcMain.handle('download-version', (event, versionId, maxConcurrent, downloadPath) => installVersion(versionId, maxConcurrent, downloadPath));

ipcMain.handle('download-with-modloader', (event, versionId, loaderType, loaderVersion, maxConcurrent) => 
  installVersionWithModLoader(versionId, loaderType, loaderVersion, maxConcurrent));

ipcMain.handle('get-version-config', (event, versionId) => readVersionConfig(versionId));
ipcMain.handle('get-version-display-name', (event, versionId) => generateVersionDisplayName(versionId));
ipcMain.handle('get-launch-display-name', (event, versionId) => generateLaunchDisplayName(versionId));

ipcMain.handle('delete-version', async (_, versionId) => {
  try {
    const versionDir = path.join(GAME_DIR, 'versions', versionId);
    
    if (!fs.existsSync(versionDir)) {
      return { success: false, error: '版本不存在' };
    }
    
    writeLog(`[删除版本] 开始删除版本: ${versionId}`);
    
    fs.rmSync(versionDir, { recursive: true, force: true });
    
    writeLog(`[删除版本] 版本 ${versionId} 删除成功`);
    
    return { success: true };
  } catch (e) {
    writeLog(`[删除版本] 删除版本失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-version-settings', async (_, versionId) => {
  try {
    const versionDir = path.join(GAME_DIR, 'versions', versionId);
    const gpclDir = path.join(versionDir, 'gpcl');
    const configPath = path.join(gpclDir, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      return { success: true, settings: null };
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    const settings = JSON.parse(content);
    
    return { success: true, settings };
  } catch (e) {
    writeLog(`[版本设置] 读取版本 ${versionId} 设置失败: ${e.message}`);
    return { success: false, error: e.message, settings: null };
  }
});

ipcMain.handle('save-version-settings', async (_, versionId, settings) => {
  try {
    const versionDir = path.join(GAME_DIR, 'versions', versionId);
    const gpclDir = path.join(versionDir, 'gpcl');
    
    if (!fs.existsSync(gpclDir)) {
      fs.mkdirSync(gpclDir, { recursive: true });
    }
    
    const configPath = path.join(gpclDir, 'config.json');
    
    // 保存设置
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    
    writeLog(`[版本设置] 版本 ${versionId} 设置已保存`);
    
    return { success: true };
  } catch (e) {
    writeLog(`[版本设置] 保存版本 ${versionId} 设置失败: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-game-dir', () => {
  return GAME_DIR;
});

ipcMain.handle('get-player-name', () => {
  try {
    const playerFile = path.join(app.getPath('userData'), 'gpcl', 'player.json');
    if (fs.existsSync(playerFile)) {
      const data = JSON.parse(fs.readFileSync(playerFile, 'utf8'));
      return data.name || 'GPCL_Player';
    }
  } catch (e) {
    console.error('读取玩家名失败:', e);
  }
  return 'GPCL_Player';
});

ipcMain.handle('save-player-name', (_, name) => {
  try {
    const gpclDir = path.join(app.getPath('userData'), 'gpcl');
    if (!fs.existsSync(gpclDir)) fs.mkdirSync(gpclDir, { recursive: true });
    const playerFile = path.join(gpclDir, 'player.json');
    fs.writeFileSync(playerFile, JSON.stringify({ name: name || 'GPCL_Player' }));
    return { success: true };
  } catch (e) {
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
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// 检查指定Minecraft版本所需的Java是否已安装
ipcMain.handle('check-java', async (_, versionOrJavaVersion) => {
  try {
    // 判断是Minecraft版本号还是Java版本号
    const isMcVersion = versionOrJavaVersion && versionOrJavaVersion.match(/^\d+\.\d+/);
    
    if (isMcVersion) {
      // Minecraft版本，检查该版本需要的Java
      const versionId = versionOrJavaVersion;
      const jsonPath = path.join(GAME_DIR, 'versions', versionId, versionId + '.json');
      if (!fs.existsSync(jsonPath)) {
        return { success: false, error: '版本未下载' };
      }
      
      const versionData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const javaVersion = getJavaVersionFromVersionData(versionData);
      const result = await checkJavaInstalled(javaVersion);
      
      return {
        success: true,
        installed: result.installed,
        javaVersion: javaVersion,
        javaPath: result.javaPath
      };
    } else {
      // Java版本，直接检查该版本是否安装
      const javaVersion = versionOrJavaVersion;
      const result = await checkJavaInstalled(javaVersion);
      
      return {
        success: true,
        installed: result.installed,
        javaVersion: javaVersion,
        javaPath: result.javaPath
      };
    }
  } catch (e) {
    writeLog(`检查Java失败：${e.message}`);
    return { success: false, error: e.message };
  }
});

// 解析 Minecraft 启动参数模板
function parseMCArguments(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// 智能分割参数（处理引号内的空格）
function splitArgs(str) {
  const args = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
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

// 检查库规则是否允许当前平台
function checkLibraryRules(rules) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      const platform = os.platform();
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

// 构建 Minecraft 启动参数
function buildLaunchArgs(vd, gameDir, versionId, username, windowMode, memoryMB, serverIp) {
  const cp = [];
  // 优先使用 downloads.client 的 jar 路径
  const clientJar = path.join(gameDir, 'versions', versionId, `${versionId}.jar`);
  if (fs.existsSync(clientJar)) {
    cp.push(clientJar);
  }
  // 添加库（带平台规则过滤）
  let missingLibs = 0;
  for (const lib of vd.libraries || []) {
    if (!checkLibraryRules(lib.rules)) continue;
    // 普通 artifact
    if (lib.downloads?.artifact?.path) {
      const libPath = path.join(gameDir, 'libraries', lib.downloads.artifact.path);
      if (fs.existsSync(libPath)) {
        cp.push(libPath);
      } else {
        missingLibs++;
        writeLog(`[启动] 库文件缺失: ${lib.downloads.artifact.path}`);
      }
    }
    // Natives（Windows 平台）
    if (lib.downloads?.classifiers?.['natives-windows']?.path) {
      const nativePath = path.join(gameDir, 'libraries', lib.downloads.classifiers['natives-windows'].path);
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

  const nativesDir = path.join(gameDir, 'versions', versionId, 'natives');
  const assetsDir = path.join(gameDir, 'assets');

  const jvmArgs = [
    `-Djava.library.path=${nativesDir}`,
    '-cp', cp.join(';'),
  ];

  // 添加内存参数
  if (memoryMB) {
    jvmArgs.unshift(`-Xmx${memoryMB}M`);
    writeLog(`[启动] 已设置最大内存: ${memoryMB}M`);
  } else {
    writeLog(`[启动] 未设置内存限制`);
  }

  const vars = {
    auth_player_name: username,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: assetsDir,
    assets_index_name: vd.assetIndex?.id || vd.assets || versionId,
    auth_uuid: '00000000000000000000000000000000',
    auth_access_token: 'offline',
    auth_session: 'offline',
    user_type: 'legacy',
    user_properties: '{}',
    version_type: 'GPCL'
  };

  let gameArgs = [];

  // 新版格式 (1.13+)
  if (vd.arguments?.game) {
    for (const arg of vd.arguments.game) {
      if (typeof arg === 'string') {
        gameArgs.push(parseMCArguments(arg, vars));
      }
      // 忽略条件参数（简化处理）
    }
  }
  // 旧版格式 (1.12.2 及以下)
  else if (vd.minecraftArguments) {
    const parsed = parseMCArguments(vd.minecraftArguments, vars);
    gameArgs = splitArgs(parsed);
  }
  // 兜底
  else {
    gameArgs = [
      '--username', username,
      '--version', versionId,
      '--gameDir', gameDir,
      '--assetsDir', assetsDir,
      '--assetIndex', vd.assetIndex?.id || vd.assets || versionId,
      '--accessToken', 'offline',
      '--userType', 'legacy'
    ];
  }

  // 根据窗口模式添加参数
  if (windowMode === 'fullscreen') {
    gameArgs.push('--fullscreen');
    writeLog(`[启动] 已添加全屏参数: --fullscreen`);
  } else if (windowMode === 'borderless') {
    // 无边框窗口模式：使用全屏但无边框的分辨率
    gameArgs.push('--fullscreen');
    gameArgs.push('--width');
    gameArgs.push('1920');
    gameArgs.push('--height');
    gameArgs.push('1080');
    writeLog(`[启动] 已添加无边框窗口参数: --fullscreen --width 1920 --height 1080`);
  } else if (windowMode === 'minimized') {
    // 最小化模式，不添加特殊参数，但会在游戏启动后自动最小化
    writeLog(`[启动] 已设置最小化模式`);
  }

  // 如果有服务器IP，添加服务器连接参数
  if (serverIp && serverIp.trim()) {
    const ipParts = serverIp.trim().split(':');
    const serverAddress = ipParts[0];
    const serverPort = ipParts[1] || '25565';
    
    gameArgs.push('--server');
    gameArgs.push(serverAddress);
    gameArgs.push('--port');
    gameArgs.push(serverPort);
    
    writeLog(`[启动] 已添加服务器连接参数: --server ${serverAddress} --port ${serverPort}`);
  }

  return { jvmArgs, gameArgs, mainClass: vd.mainClass };
}

ipcMain.handle('launch-minecraft', async (_, opt) => {
  try {
    // 重置取消标志
    launchCancelFlag = false;
    
    const { versionId, username, gameDir: rawGameDir, windowMode } = opt;
    // 使用传入的路径或默认的 GAME_DIR
    const gameDir = rawGameDir ? path.resolve(rawGameDir) : GAME_DIR;
    // 窗口模式：fullscreen, windowed, borderless
    const mode = windowMode || 'windowed';
    writeLog(`启动游戏：玩家 ${username}，版本 ${versionId}，目录: ${gameDir}，窗口模式: ${mode}`);
    
    // 检查是否已取消
    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }
    
    const jsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    if (!fs.existsSync(jsonPath)) {
      writeLog(`启动游戏失败：版本 ${versionId} 未下载`);
      return { success: false, error: '请先下载游戏' };
    }

    const vd = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const javaVersion = getJavaVersionFromVersionData(vd);
    
    // 检查是否已取消
    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }
    
    // 加载设置
    const settings = loadSettings();
    let memoryMB = null;
    let actualWindowMode = mode;
    let serverIp = null;
    
    // 首先检查是否有版本特定设置
    try {
      const versionConfigPath = path.join(gameDir, 'versions', versionId, 'gpcl', 'config.json');
      if (fs.existsSync(versionConfigPath)) {
        const versionSettings = JSON.parse(fs.readFileSync(versionConfigPath, 'utf8'));
        
        // 处理内存设置
        if (versionSettings.memory && versionSettings.memory !== 'global') {
          const memoryVal = parseFloat(versionSettings.memory);
          if (!isNaN(memoryVal)) {
            if (versionSettings.memory === '0.5') {
              memoryMB = 512; // 0.5GB = 512MB
            } else {
              memoryMB = Math.floor(memoryVal * 1024);
            }
            writeLog(`[启动] 使用版本内存设置: ${memoryMB}M`);
          }
        }
        
        // 处理窗口模式设置
        if (versionSettings.windowMode && versionSettings.windowMode !== 'global') {
          actualWindowMode = versionSettings.windowMode;
          writeLog(`[启动] 使用版本窗口模式: ${actualWindowMode}`);
        }
        
        // 处理启动模式和服务器IP
        if (versionSettings.startupMode === 'join' && versionSettings.serverIp) {
          serverIp = versionSettings.serverIp;
          writeLog(`[启动] 使用版本启动模式: 加入服务器 ${serverIp}`);
        }
      }
    } catch (e) {
      writeLog(`[启动] 读取版本设置失败: ${e.message}`);
    }
    
    // 如果没有版本特定设置，使用全局设置
    if (memoryMB === null && settings.game?.memory) {
      const globalMemory = parseFloat(settings.game.memory);
      if (!isNaN(globalMemory)) {
        memoryMB = Math.floor(globalMemory * 1024);
        writeLog(`[启动] 使用全局内存设置: ${memoryMB}M`);
      }
    }
    
    // 检查是否已取消
    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }
    
    // 检查Java是否已安装
    let java = await ensureJavaRuntime(javaVersion);
    
    // 检查是否已取消（在Java检查后）
    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动');
      return { success: false, error: '启动已取消', cancelled: true };
    }
    
    // 如果Java未安装，自动下载
    if (!java) {
      writeLog(`[Java] Java ${javaVersion} 未安装，自动开始下载`);
      
      // 发送通知给渲染进程
      if (mainWindow) {
        mainWindow.webContents.send('java-auto-download-start', {
          javaVersion: javaVersion,
          mcVersion: versionId
        });
      }
      
      // 自动下载并安装Java（期间检查取消标志）
      const installResult = await downloadAndInstallJava(javaVersion);
      
      // 检查是否已取消（在Java下载后）
      if (launchCancelFlag) {
        writeLog('[启动] 用户已取消启动（Java下载完成后）');
        return { success: false, error: '启动已取消', cancelled: true };
      }
      
      if (installResult.success) {
        java = installResult.javaPath;
        writeLog(`[Java] Java ${javaVersion} 安装成功: ${java}`);
        
        // 发送安装完成通知
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

    // 最终检查是否已取消（在启动游戏前）
    if (launchCancelFlag) {
      writeLog('[启动] 用户已取消启动（即将启动游戏前）');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    const { jvmArgs, gameArgs, mainClass } = buildLaunchArgs(vd, gameDir, versionId, username, actualWindowMode, memoryMB, serverIp);
    const args = [...jvmArgs, mainClass, ...gameArgs];

    writeLog(`[启动] Java: ${java}`);
    writeLog(`[启动] 主类: ${mainClass}`);
    writeLog(`[启动] 窗口模式: ${actualWindowMode}`);
    writeLog(`[启动] 参数数: ${args.length}`);
    writeLog(`[启动] JVM参数: ${JSON.stringify(jvmArgs)}`);
    writeLog(`[启动] 游戏参数: ${JSON.stringify(gameArgs.slice(0, 10))}...`);
    writeLog(`[启动] Classpath条目数: ${jvmArgs[2].split(';').length}`);
    writeLog(`[启动] Classpath总长度: ${jvmArgs[2].length} 字符`);

    let proc;
    for (let i = 0; i < 3; i++) {
      try {
        proc = spawn(java, args, { cwd: gameDir, detached: false, windowsHide: false });
        writeLog(`启动游戏成功：PID ${proc.pid}`);
        break;
      } catch (e) {
        if (e.code === 'EBUSY' && i < 2) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        writeLog(`启动游戏失败：${e.message}`);
        return { success: false, error: e.message };
      }
    }

    currentGameProcess = proc;
    currentGamePid = proc.pid;

    // 如果已经被取消，立即杀死
    if (launchCancelFlag) {
      writeLog('[启动] 进程已启动但取消标志已设置，立即终止');
      killGameProcessTree(proc.pid);
      try { proc.kill(); } catch {}
      currentGameProcess = null;
      currentGamePid = null;
      return { success: false, error: '启动已取消', cancelled: true };
    }

    // 检测游戏窗口创建成功
    await detectGameWindow(proc.pid);

    // 检测结束后再次检查取消标志（可能在窗口检测期间被取消）
    if (launchCancelFlag) {
      writeLog('[启动] 窗口检测结束后检测到取消标志');
      return { success: false, error: '启动已取消', cancelled: true };
    }

    // 捕获输出用于调试
    let stdoutData = '';
    let stderrData = '';
    proc.stdout?.on('data', d => {
      const text = d.toString();
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
    proc.stderr?.on('data', d => {
      const text = d.toString();
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
    proc.on('error', (err) => {
      writeLog(`[启动] 进程错误: ${err.message}`);
    });
    proc.on('exit', (code) => {
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
  } catch (e) {
    writeLog(`启动游戏异常：${e.message}`);
    return { success: false, error: e.message };
  }
});

// 检测游戏窗口创建成功
async function detectGameWindow(pid) {
  writeLog(`[启动] 开始检测游戏窗口，PID: ${pid}`);

  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const cancelCheck = setInterval(() => {
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

    const timeout = setTimeout(() => {
      writeLog(`[启动] 游戏窗口检测超时（8秒），继续启动流程`);
      clearInterval(cancelCheck);
      try { detector.kill(); } catch {}
      if (mainWindow && !launchCancelFlag) {
        mainWindow.webContents.send('game-window-created', { pid, timeout: true });
      }
      done();
    }, 8000);

    const script = `
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
    let output = '';

    detector.stdout.on('data', d => { output += d.toString(); });
    detector.stderr.on('data', d => { output += d.toString(); });

    detector.on('close', (code) => {
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

    detector.on('error', (err) => {
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

// IPC: 下载并安装Java运行时
ipcMain.handle('install-java', async (_, javaVersion) => {
  try {
    writeLog(`[Java] 开始安装 Java ${javaVersion}`);
    
    // 发送下载开始消息
    if (mainWindow) {
      mainWindow.webContents.send('java-download-started', { javaVersion });
    }
    
    const result = await downloadAndInstallJava(javaVersion);
    
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
  } catch (e) {
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

let currentSettings = null;

ipcMain.handle('get-settings', () => {
  if (!currentSettings) {
    currentSettings = loadSettings();
  }
  return currentSettings;
});

ipcMain.handle('save-settings', (_, settings) => {
  currentSettings = mergeWithDefaults(settings);
  const success = saveSettings(currentSettings);
  return { success, settings: currentSettings };
});

ipcMain.handle('reset-settings', () => {
  currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const success = saveSettings(currentSettings);
  return { success, settings: currentSettings };
});

ipcMain.handle('restart-app', () => {
  writeLog('[重启] 正在重启应用...');
  app.relaunch();
  app.exit();
});

ipcMain.handle('set-developer-mode', (_, enabled) => {
  isDeveloperMode = !!enabled;
  writeLog('[开发者模式] ' + (isDeveloperMode ? '已启用' : '已禁用'));
  return { success: true };
});

let activeAnimWindow = null;

function cleanupAnimTempDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {}
}

ipcMain.handle('play-startup-animation', async () => {
  if (activeAnimWindow && !activeAnimWindow.isDestroyed()) {
    try { activeAnimWindow.close(); } catch (e) {}
    activeAnimWindow = null;
  }

  writeLog('[启动动画] 开始播放启动动画');

  const iconDir = path.join(__dirname, 'static', 'icon');
  const tempAnimDir = path.join(app.getPath('temp'), 'gpcl-anim-' + Date.now());
  try { fs.mkdirSync(tempAnimDir, { recursive: true }); } catch (e) {}

  var imageNames = ['caellab.png', 'gamets.png', 'gamets.ico', 'GPCL.png'];
  for (var _i = 0; _i < imageNames.length; _i++) {
    var src = path.join(iconDir, imageNames[_i]);
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, path.join(tempAnimDir, imageNames[_i])); } catch (e) {}
    }
  }

  var hasCaelab = fs.existsSync(path.join(tempAnimDir, 'caellab.png'));
  var hasGamets = fs.existsSync(path.join(tempAnimDir, 'gamets.png')) || fs.existsSync(path.join(tempAnimDir, 'gamets.ico'));
  var hasGpcl = fs.existsSync(path.join(tempAnimDir, 'GPCL.png'));
  var gametsFile = fs.existsSync(path.join(tempAnimDir, 'gamets.png')) ? 'gamets.png' : 'gamets.ico';

  writeLog('[启动动画] 资源: caellab=' + hasCaelab + ' gamets=' + hasGamets + ' gpcl=' + hasGpcl);

  var ANIM_DURATION = 30;

  var htmlContent = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>\n' +
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
'<div class="scene" id="logo-both"><div class="logo-row"><img class="caellab-img" src="caellab.png" alt="CaelLab"><img class="gamets-img" src="' + gametsFile + '" alt="GameTS"></div><div class="logo-text logo-text-bottom"><div class="copyright">Copyright \u00A9 2026 Yunyun(\u4E91\u4E91) By \u865A\u821F\u5B9E\u9A8C\u5BA4(CaelLab) / CaelLabGameTS</div><p class="license-text">Licensed under <a href="https://www.caellab.com/license/bysa-code" target="_blank" class="footer-link">CaelLab BY-SA Code License</a>. Open Source on <a href="https://github.com/yunyun-3782/GoodPlanCraftLaunCher" target="_blank" class="footer-link">GitHub</a>.</p></div></div>\n' +
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

  var tempHtmlPath = path.join(tempAnimDir, 'index.html');
  try { fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8'); } catch (e) {
    writeLog('[启动动画] 写入临时文件失败: ' + e.message);
    cleanupAnimTempDir(tempAnimDir);
    return { success: false, error: '写入临时文件失败', duration: 0 };
  }

  return new Promise(function(resolve) {
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
    animWindow.webContents.setWindowOpenHandler(function(details) {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });
    animWindow.loadFile(tempHtmlPath);

    var resolved = false;

    animWindow.on('page-title-updated', function(e, title) {
      e.preventDefault();

      if (title.startsWith('show:')) {
        var parts = title.split(':');
        var sceneId = parts[1];
        var opacity = parts[2];
        var dur = parts[3];
        animWindow.webContents.executeJavaScript(
          '(function(){var el=document.getElementById("' + sceneId + '");' +
          'if(el){el.style.transition="opacity ' + dur + 's ease-out";' +
          'el.style.opacity="' + opacity + '"}})()'
        );
        return;
      }

      if (title.startsWith('hide:')) {
        var parts = title.split(':');
        var sceneId = parts[1];
        var dur = parts[2];
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
        try { animWindow.close(); } catch (e) {}
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
        try { if (!animWindow.isDestroyed()) animWindow.close(); } catch (e) {}
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
    } catch (e) {}
  }
});

ipcMain.handle('read-json-file', async (_, subPath, fileName) => {
  try {
    const dir = path.join(BASE_DIR, 'gpcl', subPath);
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    writeLog(`读取文件失败: ${e.message}`);
    return null;
  }
});

ipcMain.handle('write-json-file', async (_, subPath, fileName, data) => {
  try {
    const dir = path.join(BASE_DIR, 'gpcl', subPath);
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    writeLog(`写入文件失败: ${e.message}`);
    return false;
  }
});

// 获取 Forge 版本列表
ipcMain.handle('get-forge-versions', async (_, mcVersion) => {
  try {
    writeLog(`[Forge] 获取版本列表: ${mcVersion}`);
    const versions = await fetchForgeVersions(mcVersion);
    return { success: true, versions };
  } catch (e) {
    writeLog(`[Forge] 获取版本列表失败: ${e.message}`);
    return { success: false, error: e.message, versions: [] };
  }
});

// 从 Forge Maven 获取版本列表
async function fetchForgeVersions(mcVersion) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const url = `https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json`;
    
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const metadata = JSON.parse(data);
          const versions = [];
          
          // 查找对应 MC 版本的 Forge 版本
          const versionArray = metadata[mcVersion];
          if (versionArray && Array.isArray(versionArray)) {
            versionArray.forEach((fullVersion) => {
              const parts = fullVersion.split('-');
              const forgeVersion = parts.slice(1).join('-');
              versions.push({
                id: fullVersion,
                name: `Forge ${forgeVersion}`,
                version: forgeVersion,
                mcVersion: mcVersion
              });
            });
          }
          
          // 按版本号排序（最新的在前）
          versions.sort((a, b) => compareVersions(b.version, a.version));
          
          // 只返回前 10 个版本
          const topVersions = versions.slice(0, 10);
          
          // 标记推荐版本（第一个）
          if (topVersions.length > 0) {
            topVersions[0].name += ' (推荐)';
          }
          
          writeLog(`[Forge] 找到 ${topVersions.length} 个版本`);
          resolve(topVersions);
        } catch (e) {
          writeLog(`[Forge] 解析错误: ${e.message}`);
          reject(new Error('解析 Forge 元数据失败'));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`请求 Forge 元数据失败: ${e.message}`));
    }).on('timeout', () => {
      reject(new Error('请求 Forge 元数据超时'));
    });
  });
}

// 版本号比较函数
function compareVersions(v1, v2) {
  const parts1 = v1.split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const parts2 = v2.split(/[.-]/).map(p => parseInt(p, 10) || 0);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function installVersionWithModLoader(versionId, loaderType, loaderVersion, maxConcurrent) {
  try {
    writeLog(`[模组加载器] 开始下载: ${loaderType} ${loaderVersion} for MC ${versionId}`);
    
    // 1. 先下载原版游戏
    writeLog(`[模组加载器] 下载原版 MC ${versionId}`);
    await installVersion(versionId, maxConcurrent);
    
    if (shouldCancelDownload) {
      return { success: false, error: '下载已取消' };
    }
    
    // 2. 根据模组加载器类型进行安装
    let finalVersionId;
    if (loaderType === 'forge') {
      finalVersionId = await installForge(versionId, loaderVersion);
    } else {
      return { success: false, error: `不支持的模组加载器: ${loaderType}` };
    }
    
    writeLog(`[模组加载器] 安装完成: ${finalVersionId}`);
    
    // 更新版本最后启动时间
    updateVersionLastPlayed(finalVersionId);
    
    return { success: true, finalVersionId };
    
  } catch (e) {
    writeLog(`[模组加载器] 安装失败: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// 安装 Forge：直接从 Forge Maven 下载完整的版本 JSON
async function installForge(mcVersion, forgeVersion) {
  writeLog(`[Forge] 安装: MC ${mcVersion}, Forge ${forgeVersion}`);
  
  const versionDir = path.join(GAME_DIR, 'versions', mcVersion);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`原版版本 ${mcVersion} 不存在`);
  }
  
  // 构造完整的 Forge 版本 ID（如 1.20.1-47.2.0）
  const fullForgeVersionId = `${mcVersion}-${forgeVersion}`;
  
  // Forge 在 Maven 上提供了完整的版本 JSON（含 mainClass、libraries、inheritsFrom 等）
  const forgeJsonUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullForgeVersionId}/forge-${fullForgeVersionId}.json`;
  
  writeLog(`[Forge] 下载版本 JSON: ${forgeJsonUrl}`);
  let forgeJsonData;
  try {
    forgeJsonData = await fetchText(forgeJsonUrl);
  } catch (e) {
    throw new Error(`无法下载 Forge 版本 JSON: ${e.message}`);
  }
  
  let forgeVersionData;
  try {
    forgeVersionData = JSON.parse(forgeJsonData);
  } catch (e) {
    const snippet = forgeJsonData.substring(0, 100);
    writeLog(`[Forge] JSON 解析失败，响应内容: ${snippet}`);
    throw new Error(`Forge 版本 JSON 解析失败，服务器可能返回了错误页面`);
  }
  
  const forgeJsonId = `${mcVersion}-forge`;
  forgeVersionData.id = forgeJsonId;
  
  const forgeJsonPath = path.join(versionDir, `${forgeJsonId}.json`);
  fs.writeFileSync(forgeJsonPath, JSON.stringify(forgeVersionData, null, 2));
  
  const gpclDir = path.join(versionDir, 'gpcl');
  if (!fs.existsSync(gpclDir)) fs.mkdirSync(gpclDir, { recursive: true });
  
  const configPath = path.join(gpclDir, 'config.ini');
  const configContent = `[Version]
Minecraft=${mcVersion}
Forge=${forgeVersion}
`;
  fs.writeFileSync(configPath, configContent, 'utf8');
  
  writeLog(`[Forge] 安装完成: ${forgeJsonId}`);
  return forgeJsonId;
}

// 读取 config.ini 配置文件
function readVersionConfig(versionId) {
  const versionDir = path.join(GAME_DIR, 'versions', versionId);
  const configPath = path.join(versionDir, 'gpcl', 'config.ini');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = {
      Minecraft: '',
      Forge: ''
    };
    
    const lines = content.split('\n');
    let inVersionSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[Version]') {
        inVersionSection = true;
        continue;
      }
      
      if (!inVersionSection) continue;
      
      const parts = trimmed.split('=');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        if (config.hasOwnProperty(key)) {
          config[key] = value;
        }
      }
    }
    
    return config;
  } catch (e) {
    writeLog(`[Config] 读取配置失败: ${e.message}`);
    return null;
  }
}

// 生成版本显示名称
function generateVersionDisplayName(versionId) {
  const config = readVersionConfig(versionId);
  
  if (!config) {
    return versionId;
  }
  
  const parts = [];
  parts.push(config.Minecraft || versionId);
  
  if (config.Forge) {
    parts.push(`Forge${config.Forge}`);
  }
  
  return parts.join(' ');
}

// 生成启动页显示名称
function generateLaunchDisplayName(versionId) {
  const config = readVersionConfig(versionId);
  
  if (!config) {
    return versionId;
  }
  
  const parts = [];
  parts.push(config.Minecraft || versionId);
  
  if (config.Forge) {
    parts.push(`Forge${config.Forge}`);
  }
  
  return parts.join(' ');
}



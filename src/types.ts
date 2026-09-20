/**
 * GPCL TypeScript 类型定义
 * 定义 IPC 通道、设置结构、游戏数据等核心类型
 */

// ========== IPC 通道类型 ==========

export interface GPCLApi {
  getGameDir(): Promise<string>;
  scanVersions(gameDir: string, silent?: boolean): Promise<any>;
  launch(options: LaunchOptions): Promise<any>;
  getVersionManifest(): Promise<any>;
  downloadVersion(versionId: string, maxConcurrent: number): Promise<any>;
  onGameLog(callback: (text: string) => void): void;
  onGameClosed(callback: (code: number) => void): void;
  onGameError(callback: (message: string) => void): void;
  onDownloadProgress(callback: (data: DownloadProgress) => void): void;
  onConfirmCloseWhileDownloading(callback: () => void): void;
  getPlayerName(): Promise<string>;
  savePlayerName(name: string): Promise<void>;
  showMessageDialog(options: DialogOptions): Promise<any>;
  confirmCloseDownload(): Promise<void>;
  cancelDownloadOnly(): Promise<void>;
  getJavaMirrorSettings(): Promise<any>;
  getJavaDownloadUrl(javaVersion: string): Promise<string>;
  cancelClose(): Promise<void>;
  checkJava(versionId: string): Promise<JavaCheckResult>;
  showJavaInstallDialog(callback: (data: any) => void): void;
  selectJavaVersion(data: any): Promise<any>;
  installJava(javaVersion: string): Promise<any>;
  uninstallJava(javaVersion: string): Promise<any>;
  onJavaInstallDialog(callback: (data: any) => void): void;
  onJavaDownloadCompleted(callback: (data: any) => void): void;
  onJavaDownloadFailed(callback: (data: any) => void): void;
  onGameWindowCreated(callback: (data: any) => void): void;
  minimizeWindow(): Promise<void>;
  focusWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  deleteVersion(versionId: string): Promise<any>;
  getVersionSettings(versionId: string): Promise<any>;
  saveVersionSettings(versionId: string, settings: any): Promise<void>;
  selectDirectory(): Promise<string | null>;
  cancelLaunch(): Promise<void>;
  checkForUpdates(): Promise<any>;
  getAppVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
  openFolder(folderPath: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  resetSettings(): Promise<void>;
  playStartupAnimation(): Promise<void>;
  dismissStartupAnimation(): Promise<void>;
  setDeveloperMode(enabled: boolean): Promise<void>;
  restartApp(): Promise<void>;
  readJsonFile(subPath: string, fileName: string): Promise<any>;
  writeJsonFile(subPath: string, fileName: string, data: any): Promise<void>;
  getForgeVersions(mcVersion: string): Promise<any>;
  getFabricVersions(mcVersion: string): Promise<any>;
  getOptiFineVersions(mcVersion: string): Promise<any>;
  downloadWithModLoader(versionId: string, loaderType: string, loaderVersion: string, maxConcurrent: number): Promise<any>;
  getVersionConfig(versionId: string): Promise<any>;
  getVersionDisplayName(versionId: string): Promise<string>;
  getLaunchDisplayName(versionId: string): Promise<string>;
  getMemoryUsage(): Promise<number>;
  optimizeMemory(): Promise<void>;
  downloadUpdate(version: string): Promise<any>;
  cancelUpdateDownload(): Promise<void>;
  verifyUpdateSHA1(filePath: string): Promise<boolean>;
  executeUpdateInstaller(installerPath: string): Promise<void>;
  setUpdateShutdownHook(installerPath: string): Promise<void>;
  onUpdateDownloadProgress(callback: (data: any) => void): void;
  removeAllListeners(): void;

  // Microsoft 正版登录
  startMicrosoftAuth(): Promise<void>;
  onMicrosoftAuthResult(callback: (result: MicrosoftAuthResult) => void): void;
}

// ========== 设置类型 ==========

export interface GameSettings {
  memory: string;
  playerName: string;
  javaPath: string;
  jvmArgs: string;
  windowMode: string;
}

export interface AppearanceSettings {
  theme: string;
  scale: string;
  playStartupAnimation: boolean;
  skipSplash: boolean;
}

export interface DownloadSettings {
  maxConcurrent: number;
  javaMirror: string;
  customJavaMirror: string;
}

export interface AdvancedSettings {
  autoCheckUpdate: boolean;
  preventMultipleLaunch: boolean;
  autoClearLogs: boolean;
  logRetentionValue: number;
  logRetentionUnit: string;
  developerMode: boolean;
}

export interface AppSettings {
  game: GameSettings;
  appearance: AppearanceSettings;
  download: DownloadSettings;
  advanced: AdvancedSettings;
}

// ========== 游戏相关类型 ==========

export interface LaunchOptions {
  versionId: string;
  gameDir: string;
  playerName: string;
  memory: string;
  javaPath?: string;
  jvmArgs?: string;
  windowMode?: string;
  serverIp?: string;
  /** Microsoft 正版认证信息 */
  authUuid?: string;
  authAccessToken?: string;
  authUserType?: string;
}

/** Microsoft 登录结果 */
export interface MicrosoftAuthResult {
  status: 'success' | 'error' | 'pending' | 'timeout';
  uuid?: string;
  username?: string;
  accessToken?: string;
  refreshToken?: string;
  skins?: any[];
  capes?: any[];
  message?: string;
}

export interface DownloadProgress {
  percent: number;
  label?: string;
  transferred?: number;
  total?: number;
}

export interface JavaCheckResult {
  installed: boolean;
  path?: string;
  version?: string;
}

export interface DialogOptions {
  type?: string;
  title?: string;
  message?: string;
  buttons?: string[];
  confirmText?: string;
  cancelText?: string;
}

export interface VersionInfo {
  id: string;
  type: string;
  time: string;
}

export interface ModLoaderState {
  forge: { versions: any[]; loading: boolean; error: boolean; expanded: boolean; selected: string | null };
  optifine: { versions: any[]; loading: boolean; error: boolean; expanded: boolean; selected: string | null };
  fabric: { versions: any[]; loading: boolean; error: boolean; expanded: boolean; selected: string | null };
}

// ========== 全局声明 ==========

declare global {
  interface Window {
    gpcl: GPCLApi;
    Chart?: any;
  }
}

export {};

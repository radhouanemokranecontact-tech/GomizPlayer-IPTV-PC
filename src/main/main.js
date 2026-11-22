'use strict';

const { sleep, sanitizeFfmpegHeaderValue, isPathInsideDir, isPrivateIPv4, extractIPv4FromMappedIPv6, isPrivateOrLocalHostname, assertSafeUrl, safeName } = require('./core-utils');
const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, safeStorage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { fileURLToPath, pathToFileURL } = require('url');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) { autoUpdater = null; }

const crypto = require('crypto');
const net = require('net');
const dns = require('dns').promises;
const { Store } = require('./store');
const { parseM3U, xtreamUrl, xtreamAccountUrl, looksLikePlaylist, isHlsPlaylist, keyFor } = require('./m3u');
const classification = require('../shared/classification');
const { parseEpg } = require('./epg');
const { Downloads } = require('./downloads');

const MAX_PLAYLIST_BYTES = 30 * 1024 * 1024;
const MAX_EPG_BYTES = 60 * 1024 * 1024;
const DEFAULT_UA = 'VLC/3.0.21 LibVLC/3.0.21';

const SMOKE = process.argv.includes('--smoke-test');
const STREAM_SMOKE = process.argv.includes('--smoke-stream');
const SCREENSHOTS = process.argv.includes('--screenshots');
const DOWNLOAD_SMOKE = process.argv.includes('--smoke-download');

const INDEX_URL = pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href;
const allowedReadPaths = new Set();

// --- secrets / app-lock helpers ---
const secrets = require('./secrets');
secrets.init({ safeStorage, crypto, getStore: () => store });
const { canEncryptSecrets, encryptSecret, decryptSourcePassword, prepareSourceSecrets, publicSource, sourceForUse, migrateSecrets } = secrets;

const appLockAttempts = { fails: 0, until: 0, delayMs: 1000, nextAllowedAt: 0 };
let appLockQueue = Promise.resolve();


function verifyAppLockPin(pin) {
  const run = async () => {
    const st = store.settings || {};
    const hashB64 = String(st.appLockHash || '');
    const saltB64 = String(st.appLockSalt || '');
    const input = String(pin || '');

    const now0 = Date.now();
    if (appLockAttempts.until && now0 < appLockAttempts.until) {
      const retryAfterMs = appLockAttempts.until - now0;
      // keep serialized; small wait chunk to avoid tight loop callers
      appLockAttempts.nextAllowedAt = Math.max(appLockAttempts.nextAllowedAt || 0, now0 + 1000);
      await sleep(Math.min(retryAfterMs, 1000));
      return { ok: false, locked: true, retryAfterMs: Math.max(0, appLockAttempts.until - Date.now()) };
    }

    // enforce per-attempt pacing (and progressive delay) before computing scrypt
    const waitMs = Math.max(0, (appLockAttempts.nextAllowedAt || 0) - now0);
    if (waitMs > 0) {
      // reserve this slot; next attempt cannot start before we finish this paced wait+check
      appLockAttempts.nextAllowedAt = now0 + waitMs;
    }
    if (waitMs > 0) await sleep(waitMs);

    // compute/verify (scryptSync is synchronous)
    let ok = false;
    try {
      if (hashB64 && saltB64) {
        const expected = Buffer.from(hashB64, 'base64');
        const salt = Buffer.from(saltB64, 'base64');
        const got = crypto.scryptSync(input, salt, expected.length);
        ok = expected.length === got.length && crypto.timingSafeEqual(expected, got);
      } else if (st.appLockPin) {
        const a = Buffer.from(input); const b = Buffer.from(String(st.appLockPin));
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
    } catch (_) { ok = false; }

    const t = Date.now();
    if (ok) {
      appLockAttempts.fails = 0;
      appLockAttempts.until = 0;
      appLockAttempts.delayMs = 1000;
      appLockAttempts.nextAllowedAt = t;
      return { ok: true };
    }

    // update counters/state before any await
    appLockAttempts.fails = (appLockAttempts.fails || 0) + 1;
    const delay = Math.min(appLockAttempts.delayMs || 1000, 30000);
    appLockAttempts.delayMs = Math.min(delay * 2, 30000);
    if (appLockAttempts.fails >= 10) appLockAttempts.until = t + 5 * 60 * 1000;
    appLockAttempts.nextAllowedAt = t + delay;

    return { ok: false, fails: appLockAttempts.fails, delayMs: delay, locked: Date.now() < (appLockAttempts.until || 0) };
  };

  const task = appLockQueue.then(run, run);
  appLockQueue = task.catch(() => {});
  return task;
}


function assertTrustedSender(event) {
  try {
    const url = event && event.senderFrame && event.senderFrame.url ? String(event.senderFrame.url) : '';
    if (url === INDEX_URL || url.startsWith(INDEX_URL + '#') || url.startsWith(INDEX_URL + '?')) return;
    // Packaged (asar) builds load the renderer from a slightly different file:// path.
    // Accept any local file URL that resolves to our own renderer/index.html.
    if (/^file:\/\/\/.*[\\/]renderer[\\/]index\.html($|[?#])/i.test(url)) return;
  } catch (_) {}
  throw new Error('Untrusted sender');
}

async function allowReadPath(filePath) {
  const real = await fsp.realpath(String(filePath || ''));
  allowedReadPaths.add(real);
  return real;
}

async function assertAllowedReadPath(filePath) {
  const real = await fsp.realpath(String(filePath || ''));
  if (!allowedReadPaths.has(real)) throw new Error('File access not allowed');
  return real;
}







if (SMOKE || SCREENSHOTS || STREAM_SMOKE || DOWNLOAD_SMOKE) {
  try {
    const os = require('os');
    const suffix = SMOKE ? 'smoke' : (SCREENSHOTS ? 'screenshots' : (STREAM_SMOKE ? 'smoke-stream' : 'smoke-download'));
    const tempRoot = path.join(os.tmpdir(), 'gomizplayer-' + suffix);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    app.setPath('userData', tempRoot);
  } catch (_) {}
}

const { UpdateGuard } = require('./update-guard');

let store = null;
let downloads = null;
let win = null;
let updateGuard = null;
let updateState = { status: 'idle', version: '', progress: 0, message: '' };
let updatePromptShown = false;

function sendUpdateStatus(patch) {
  const prev = updateState.status;
  updateState = Object.assign({}, updateState, patch || {});
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:status', updateState);
    // Pop up once per newly-detected update (including the check on startup).
    if (updateState.status === 'available' && prev !== 'available' && !updatePromptShown) {
      updatePromptShown = true;
      win.webContents.send('update:available', { version: updateState.version || '' });
    }
    if (updateState.status === 'none' || updateState.status === 'idle') updatePromptShown = false;
  }
}

function setupAutoUpdates() {
  if (!autoUpdater) return;
  try {
    // Safety: never download/install unverified updates automatically (unsigned build).
    // Updates are only fetched when the user explicitly requests them.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking', message: '' }));
    autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', version: info && info.version || '', message: '' }));
    autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'none', message: '' }));
    autoUpdater.on('error', (err) => sendUpdateStatus({ status: 'error', message: String(err && err.message || err || 'update error') }));
    autoUpdater.on('download-progress', (p) => sendUpdateStatus({ status: 'downloading', progress: Math.round(Number(p && p.percent || 0)) }));
    autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ status: 'downloaded', version: info && info.version || '', progress: 100 }));
    if (!SMOKE && !SCREENSHOTS && app.isPackaged) {
      setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);
    }
  } catch (_) {}
}

function setupSecurity() {
  try {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  } catch (_) {}
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, url) => {
      try {
        const u = String(url || '');
        const appUrl = win && !win.isDestroyed() ? win.webContents.getURL() : '';
        if (appUrl && u.startsWith(appUrl.split('#')[0])) return;
      } catch (_) {}
      event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

async function applyProxySettings() {
  if (!store) return;
  const mode = String((store.settings && store.settings.proxyMode) || 'system');
  const url = String((store.settings && store.settings.proxyUrl) || '').trim();
  try {
    if (mode === 'direct') {
      await session.defaultSession.setProxy({ mode: 'direct' });
    } else if (mode === 'fixed' && url) {
      const u = String(url).trim();
      const looksValid = (() => {
        try {
          if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(u)) return true; // host:port
          if (/^[\w.-]+(:\d+)?$/.test(u)) return true; // hostname[:port]
          if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
            const p = new URL(u);
            return p.protocol === 'http:' || p.protocol === 'https:' || p.protocol === 'socks5:';
          }
          return false;
        } catch (_) { return false; }
      })();
      if (looksValid) {
        await session.defaultSession.setProxy({ proxyRules: u });
      } else {
        console.warn('[proxy] invalid fixed proxy URL; falling back to system proxy');
        await session.defaultSession.setProxy({ mode: 'system' });
      }
    } else {
      await session.defaultSession.setProxy({ mode: 'system' });
    }
  } catch (err) {
    console.warn('[proxy] failed', err && err.message ? err.message : err);
  }
}

// VLC-like UA helps with many IPTV providers that whitelist known players.
app.userAgentFallback = DEFAULT_UA;
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function cacheDir() {
  return path.join(app.getPath('userData'), 'cache');
}

function cachePath(name) {
  return path.join(cacheDir(), name + '.json');
}

function readCache(name) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCache(name, payload) {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const tmp = cachePath(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmp, cachePath(name));
  } catch (err) {
    console.warn('[cache] write failed', name, err.message);
  }
}

const SESSION_ID = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
let heartbeatTimer = null;

function logsDir() {
  return path.join(app.getPath('userData'), 'logs');
}

function logEvent(level, event, data) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const file = path.join(logsDir(), 'app.log');
    try {
      const st = fs.statSync(file);
      if (st.size > 2 * 1024 * 1024) {
        const prev = file + '.1';
        try { fs.unlinkSync(prev); } catch (_) {}
        try { fs.renameSync(file, prev); } catch (_) {}
      }
    } catch (_) {}
    const line = JSON.stringify({ ts: Date.now(), level, event, ...(data || {}) }) + '\n';
    fs.appendFileSync(file, line, 'utf8');
  } catch (_) {}
  try {
      } catch (_) {}
}

async function ensureTelemetryId() {
  try {
    const id = String((store.settings && store.settings.telemetryInstallId) || '').trim();
    if (id) return id;
    const next = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    store.patchSettings({ telemetryInstallId: next });
    return next;
  } catch (_) {
    return '';
  }
}

function consentGranted() {
  const st = (store && store.settings) || {};
  return st.consentShown === true;
}

function baseTelemetryPayload(extra = {}) {
  return {
    sessionId: SESSION_ID,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale ? app.getLocale() : '',
    electron: process.versions.electron,
    node: process.versions.node,
    ts: Date.now(),
    ...extra
  };
}

function sanitizeTelemetryText(value, max = 4000) {
  let s = String(value == null ? '' : value);
  // Remove credentials in URLs (user:pass@)
  s = s.replace(/([a-z][a-z0-9+.-]*:\/\/)([^@\s\/]+)@/gi, '$1[redacted]@');
  // Remove query strings/fragments and mask URL-like tokens to avoid leaking endpoints/params
  s = s.replace(/\b(?:https?|rtmp|rtmps|rtsp|rtsps|ftp):\/\/[^\s"'<>)}\]]+/gi, (m) => {
    try { const u = new URL(m); return u.origin + '/[redacted]'; } catch (_) { return '[redacted-url]'; }
  });
  // Mask Windows/UNC-like paths and obvious file paths
  s = s.replace(/[a-z]:\\[^\s"'<>)}\]]+/gi, '[redacted-path]');
  s = s.replace(/\\\\[^\s"'<>)}\]]+/gi, '[redacted-path]');
  if (s.length > max) s = s.slice(0, max);
  return s;
}

async function postTelemetry(endpoint, payload) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const ep = String(endpoint || '').trim();
    const isCounterGet = /[?&/]up(?:$|[?&#])/.test(ep)
      || /\/hit\//i.test(ep)
      || /counterapi\.dev\//i.test(ep)
      || /abacus\.jasoncameron\.dev\//i.test(ep);
    if (isCounterGet) {
      await fetch(ep, { method: 'GET', signal: ctl.signal, headers: { 'User-Agent': DEFAULT_UA } });
    } else {
      await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_UA },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

function analyticsAllowed() {
  if (!store) return false;
  const st = store.settings || {};
  return consentGranted() && st.analyticsEnabled === true;
}

function crashReportingAllowed() {
  if (!store) return false;
  const st = store.settings || {};
  return consentGranted() && st.crashReportingEnabled === true;
}

async function sendTelemetry(event = 'app_start', extra = {}) {
  try {
    if (!store || !analyticsAllowed()) return;
    const st = store.settings || {};
    const endpoint = String(st.telemetryEndpoint || '').trim();
    if (!endpoint) return;
    const installId = await ensureTelemetryId();
    const payload = { event, installId, ...baseTelemetryPayload(extra) };
    await postTelemetry(endpoint, payload);
    store.patchSettings({ telemetryLastPing: Date.now() });
  } catch (_) {
    // telemetry must never break app startup
  }
}

async function sendFirstRunIfNeeded() {
  try {
    if (!store) return;
    const st = store.settings || {};
    if (st.telemetryFirstRunSent) return;
    if (!analyticsAllowed()) return;
    await sendTelemetry('first_run', { firstRun: true });
    store.patchSettings({ telemetryFirstRunSent: true });
  } catch (_) {}
}

function startHeartbeat() {
  try {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => { sendTelemetry('heartbeat', { reason: 'interval' }); }, 6 * 60 * 60 * 1000);
  } catch (_) {}
}

async function reportError(event, err, extra = {}) {
  try {
    const rawMessage = String(err && err.message ? err.message : err || 'unknown');
    const rawStack = String(err && err.stack ? err.stack : '');
    const info = {
      event,
      type: event,
      message: sanitizeTelemetryText(rawMessage, 1000),
      stack: sanitizeTelemetryText(rawStack, 4000),
      ...extra
    };
    logEvent('error', event, info);
    if (!store || !crashReportingAllowed()) return;
    const st = store.settings || {};
    const endpoint = String(st.telemetryEndpoint || '').trim();
    if (!endpoint) return;
    const now = Date.now();
    if (now - Number(st.crashReportLastSent || 0) < 30000) return;
    const installId = await ensureTelemetryId();
    const payload = { event, kind: 'error', installId, ...baseTelemetryPayload(info) };
    await postTelemetry(endpoint, payload);
    store.patchSettings({ crashReportLastSent: now });
  } catch (_) {}
}

function setupCrashHandlers() {
  process.on('uncaughtException', (err) => { reportError('uncaughtException', err); });
  process.on('unhandledRejection', (reason) => { reportError('unhandledRejection', reason); });
  app.on('render-process-gone', (_e, wc, details) => {
    reportError('render-process-gone', details && details.reason ? details.reason : 'gone', { exitCode: details && details.exitCode });
  });
  app.on('child-process-gone', (_e, details) => {
    reportError('child-process-gone', details && details.reason ? details.reason : 'gone', { type: details && details.type });
  });
}

function isLocalAddress(value) {
  const v = String(value || '').trim();
  return /^file:\/\//i.test(v) || /^[a-zA-Z]:[\\/]/.test(v) || /^\\\\/.test(v) || (v.startsWith('/') && !v.includes('://'));
}

function localPath(value) {
  const v = String(value).trim();
  if (/^file:\/\//i.test(v)) return fileURLToPath(v);
  return v;
}

async function fetchText(url, headers, limit, timeoutMs = 45000, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const reqHeaders = { 'User-Agent': networkUA(), Accept: '*/*', ...(headers || {}) };
    const block = !!(opts && opts.blockLocalPrivate);
    let current = String(url || '');
    if (block) {
      // manual redirects with validation
      for (let i = 0; i < 5; i++) {
        await assertSafeUrl(current, { blockLocalPrivate: true });
        const res = await fetch(current, { headers: reqHeaders, signal: ctl.signal, redirect: 'manual' });
        if ([301,302,303,307,308].includes(res.status)) {
          const loc = res.headers.get('location');
          if (!loc) throw new Error('Redirect without location');
          current = new URL(loc, current).toString();
          continue;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > limit) throw new Error('Response too large (' + Math.round(buf.length / 1048576) + ' MB)');
        return { text: buf.toString('utf8'), finalUrl: res.url || current, bytes: buf.length };
      }
      throw new Error('Too many redirects');
    } else {
      const res = await fetch(current, { headers: reqHeaders, signal: ctl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > limit) throw new Error('Response too large (' + Math.round(buf.length / 1048576) + ' MB)');
      return { text: buf.toString('utf8'), finalUrl: res.url || current, bytes: buf.length };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function readSourceText(source) {
  let s2;
  try { s2 = await sourceForUse(source); } catch (err) {
    throw new Error((err && (err.userMessage || err.message)) || 'Could not decrypt source credentials');
  }
  const address = s2.kind === 'xtream'
    ? xtreamUrl(s2.url, s2.username, s2.password)
    : s2.url;

  if (isLocalAddress(address)) {
    const file = localPath(address);
    const stat = await fsp.stat(file);
    if (stat.size > MAX_PLAYLIST_BYTES) throw new Error('Playlist file is too large');
    return {
      text: await fsp.readFile(file, 'utf8'),
      baseUri: pathToFileURL(path.dirname(file) + path.sep).href
    };
  }

  const { text, finalUrl } = await fetchText(address, source.headers, MAX_PLAYLIST_BYTES);
  return { text, baseUri: finalUrl };
}

async function loadSource(source) {
  const { text, baseUri } = await readSourceText(source);
  let items = [];

  if (looksLikePlaylist(text)) {
    items = parseM3U(text, { baseUri });
  } else if (isHlsPlaylist(text)) {
    // A plain media playlist: the source is a single live stream.
    const name = source.name || 'Stream';
    items = [{
      key: keyFor(source.url),
      name,
      group: 'Streams',
      logo: '',
      tvgId: '',
      tvgName: name,
      url: isLocalAddress(source.url)
        ? pathToFileURL(localPath(source.url)).href
        : (source.kind === 'xtream'
          ? xtreamUrl(source.url, source.username, (await sourceForUse(source)).password)
          : source.url),
      kind: 'live',
      headers: source.headers || {},
      hidden: false
    }];
  } else {
    throw new Error('Not a valid M3U playlist');
  }

  const groups = {};
  for (const item of items) {
    if (item.hidden) continue;
    groups[item.group] = (groups[item.group] || 0) + 1;
  }

  const payload = {
    id: source.id,
    fetchedAt: Date.now(),
    count: items.length,
    items,
    groups
  };
  writeCache('source-' + source.id, payload);
  return payload;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    show: !SMOKE,
    backgroundColor: '#0a0c11',
    title: 'GomizPlayer IPTV',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Update guard: renderer becoming ready proves the current version is healthy.
  win.webContents.once('did-finish-load', () => {
    if (updateGuard) {
      try { updateGuard.noteHealthy(app.getVersion()); } catch (_) {}
    }
  });
  // If the renderer throws during startup, count it toward a possible rollback.
  win.webContents.on('render-process-gone', () => {
    if (updateGuard) {
      try {
        if (updateGuard.noteCrash(app.getVersion())) sendUpdateStatus({ status: 'rollback-available', message: '' });
      } catch (_) {}
    }
  });

  if (SMOKE) {
    win.webContents.on('console-message', (event) => {
      const level = (event && event.level != null) ? event.level : 0;
      const message = (event && event.message) || '';
      console.log('[renderer:' + level + ']', message);
    });
    win.webContents.once('did-finish-load', async () => {
      const started = Date.now();
      let ready = false;
      let lastError = '';
      while (Date.now() - started < 25000) {
        try {
          ready = await win.webContents.executeJavaScript('window.__novaReady === true');
          lastError = await win.webContents.executeJavaScript('window.__novaLastError || ""');
        } catch (err) {
          lastError = err.message;
        }
        if (ready) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      let detail = '';
      let smokeEpg = '';
      if (ready) {
        try {
          const now = Date.now();
          const pad = (n) => String(n).padStart(2, '0');
          const fmt = (ms) => {
            const d = new Date(ms);
            return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
              pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + ' +0000';
          };
          const chans = [['aje', 'Al Jazeera English'], ['aja', 'Al Jazeera Arabic'], ['nasa', 'NASA TV'], ['demo.pts', 'Mux Live Test']];
          let xml = '<?xml version="1.0" encoding="UTF-8"?><tv>';
          for (const [id, name] of chans) {
            xml += '<channel id="' + id + '"><display-name>' + name + '</display-name></channel>';
            xml += '<programme start="' + fmt(now - 3600000) + '" stop="' + fmt(now) + '" channel="' + id + '"><title>Earlier programme</title></programme>';
            xml += '<programme start="' + fmt(now) + '" stop="' + fmt(now + 3600000) + '" channel="' + id + '"><title>' + name + ' — live now</title><desc>Smoke test programme</desc></programme>';
            xml += '<programme start="' + fmt(now + 3600000) + '" stop="' + fmt(now + 7200000) + '" channel="' + id + '"><title>Up next on ' + name + '</title></programme>';
          }
          xml += '</tv>';
          smokeEpg = path.join(app.getPath('userData'), 'smoke-epg.xml');
          fs.writeFileSync(smokeEpg, xml);
        } catch (_) {}
      }
      if (ready) {
        try {
          detail = await win.webContents.executeJavaScript(`(async () => {
            const log = [];
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            try {
              const demo = await window.api.demoPath();
              const add = await window.api.sources.add({ name: 'Smoke demo', url: demo, kind: 'playlist', headers: {} });
              log.push('source-add:' + (add.error ? 'ERR(' + add.error + ')' : 'ok'));
              const epgRes = await window.api.epg.add(${JSON.stringify(smokeEpg)}, 'Smoke guide');
              log.push('epg-add:' + (epgRes.error ? 'ERR(' + epgRes.error + ')' : epgRes.count));
              await window.__novaTest.reload();
              log.push('items:' + window.__novaTest.state.items.length);
              // "live" is not a page anymore: it opens the player, tested below.
              const routes = ['home', 'movies', 'series', 'favorites', 'downloads', 'sources', 'settings'];
              for (const route of routes) {
                window.__novaTest.navigate(route);
                log.push(route + ':' + document.getElementById('view').querySelectorAll('*').length);
              }
              // Live EPG labels now live inside the player drawer.
              window.__novaTest.openLive();
              await sleep(1600);
              const labels = Array.from(document.querySelectorAll('.drawer-item .d-now')).filter((n) => n.textContent.trim().length > 0).length;
              log.push('epg-labels:' + labels);
              window.__novaTest.player().close();
              await sleep(250);
              window.__novaTest.navigate('home');

              // Player UI: live-aware chrome (seek/speed hidden, live strip) and drawer polish.
              const liveItem = { key: 'smoke-live', name: 'Smoke Channel', group: 'G1', url: 'http://example.test/live', kind: 'live', logo: '' };
              const livePlaylist = [liveItem, { key: 'smoke-live-2', name: 'Smoke Two', group: 'G2', url: 'http://example.test/live2', kind: 'live', logo: '' }];
              window.__novaTest.play(liveItem, livePlaylist);
              await sleep(450);
              const pRoot = document.getElementById('playerRoot');
              const pSeek = document.getElementById('seekBar');
              const pSpeed = document.getElementById('speedSel');
              const pStrip = document.getElementById('liveStrip');
              const liveOk = pRoot.classList.contains('is-live')
                && pSeek.offsetParent === null
                && pSpeed.offsetParent === null
                && pStrip.offsetParent !== null
                && !!document.getElementById('playerCenter')
                && document.getElementById('playerAvatar').textContent.trim().length > 0;
              log.push('player-live-ui:' + (liveOk ? 'ok' : 'FAIL'));

              // Live programme strip: current name, remaining time, next name.
              const nowTs = Date.now();
              window.__novaTest.player().setEpg({
                current: { title: 'Smoke Now', start: nowTs - 600000, stop: nowTs + 1500000 },
                next: { title: 'Smoke Next', start: nowTs + 1500000 }
              });
              await sleep(180);
              const stripOk = document.getElementById('liveNow').textContent.includes('Smoke Now')
                && document.getElementById('liveNext').textContent.includes('Smoke Next')
                && document.getElementById('liveRemaining').textContent.trim().length > 0
                && document.getElementById('liveBarFill').style.width !== ''
                && document.getElementById('liveNextTime').textContent.trim().length > 0;
              log.push('player-live-epg:' + (stripOk ? 'ok' : 'FAIL'));

              // The drawer is the Live browser: categories + every channel,
              // duplicate filter, search and paging all inside the player.
              const browserList = [];
              for (let i = 0; i < 140; i += 1) {
                browserList.push({
                  key: 'browse-' + i,
                  name: (i < 20 ? 'News ' : 'Chan ') + i,
                  group: i < 70 ? 'News' : 'Sport',
                  url: 'http://example.test/b/' + i,
                  kind: 'live'
                });
              }
              browserList.push({ key: 'browse-dup', name: 'Chan 130', group: 'Sport', url: 'http://example.test/b/dup', kind: 'live' });
              window.__novaTest.play(browserList[5], browserList);
              await sleep(380);
              document.getElementById('drawerBtn').click();
              await sleep(340);
              const dSearch = document.getElementById('drawerSearch');
              const dCount = document.getElementById('drawerCount').textContent.trim();
              const dItems = document.querySelectorAll('#drawerList .drawer-item').length;
              const dMore = document.getElementById('drawerMore');
              const dGroups = document.querySelectorAll('#drawerGroupsList .drawer-group').length;
              const drawerOk = dSearch.placeholder === window.t('search_channels')
                && dCount.length > 0
                && dItems === 100
                && dMore.hidden === false
                && dGroups === 3
                && document.querySelectorAll('#drawerList .drawer-item.on').length === 1;
              log.push('drawer-browser:' + dItems + '/' + dGroups + '/' + (drawerOk ? 'ok' : 'FAIL'));

              // Category filter narrows the merged list to one group.
              const newsBtn = Array.from(document.querySelectorAll('#drawerGroupsList .drawer-group'))
                .find((b) => b.querySelector('.g-name').textContent === 'News');
              if (newsBtn) newsBtn.click();
              await sleep(220);
              const groupItems = document.querySelectorAll('#drawerList .drawer-item').length;
              const groupCount = document.getElementById('drawerCount').textContent.trim();
              log.push('drawer-group:' + groupItems + '/' + (newsBtn && groupItems === 70 && groupCount.length > 0 ? 'ok' : 'FAIL'));

              // Duplicate filter drops the repeated channel name.
              document.querySelectorAll('#drawerGroupsList .drawer-group')[0].click();
              await sleep(220);
              const baseCount = document.getElementById('drawerCount').textContent.trim();
              document.getElementById('drawerDedupe').click();
              await sleep(240);
              const dedupeOn = document.getElementById('drawerDedupe').classList.contains('on');
              const dedupeCount = document.getElementById('drawerCount').textContent.trim();
              log.push('drawer-dedupe:' + (dedupeOn && dedupeCount !== baseCount ? 'ok' : 'FAIL'));
              document.getElementById('drawerDedupe').click();
              await sleep(200);

              // Search works inside the drawer.
              dSearch.value = 'News 1';
              dSearch.dispatchEvent(new Event('input'));
              await sleep(240);
              const searchNames = Array.from(document.querySelectorAll('#drawerList .drawer-item .n')).map((n) => n.textContent);
              const searchOk = searchNames.length > 0 && searchNames.every((n) => n.indexOf('News 1') === 0);
              log.push('drawer-search:' + searchNames.length + '/' + (searchOk ? 'ok' : 'FAIL'));
              dSearch.value = '';
              dSearch.dispatchEvent(new Event('input'));
              await sleep(240);

              // "Load more" appends the next batch instead of re-rendering.
              dMore.click();
              await sleep(280);
              const moreItems = document.querySelectorAll('#drawerList .drawer-item').length;
              log.push('drawer-more:' + dItems + '>' + moreItems + '/' + (moreItems > dItems ? 'ok' : 'FAIL'));
              document.getElementById('drawerClose').click();
              window.__novaTest.player().close();
              await sleep(250);

              // Active channel deep in a long playlist must be pinned at the top.
              const manyLive = Array.from({ length: 250 }, (_, i) => ({
                key: 'pin-' + i, name: 'Pin ' + i, group: 'G', url: 'http://example.test/p/' + i, kind: 'live'
              }));
              window.__novaTest.play(manyLive[180], manyLive);
              await sleep(380);
              document.getElementById('drawerBtn').click();
              await sleep(320);
              const pinEl = document.querySelector('.drawer-current .drawer-item.pinned');
              const pinOk = !!pinEl
                && pinEl.querySelector('.n').textContent === 'Pin 180'
                && document.querySelectorAll('.drawer-current').length === 1;
              log.push('player-drawer-current:' + (pinOk ? 'ok' : 'FAIL'));
              document.getElementById('drawerClose').click();
              window.__novaTest.player().close();
              await sleep(200);

              const vodItem = { key: 'smoke-vod', name: 'Smoke Movie', group: 'Movies', url: 'http://example.test/movie.mp4', kind: 'movie' };
              window.__novaTest.play(vodItem, [vodItem]);
              await sleep(350);
              const vodOk = !pRoot.classList.contains('is-live')
                && pSeek.offsetParent !== null
                && pSpeed.offsetParent !== null
                && pStrip.offsetParent === null;
              log.push('player-vod-ui:' + (vodOk ? 'ok' : 'FAIL'));
              window.__novaTest.player().close();
              await sleep(220);

              // Sidebar "Live TV" opens the player on a live channel with the
              // merged browser (categories + all channels) already open. No
              // route change happens, so closing returns to the previous page.
              window.__novaTest.navigate('home');
              await sleep(150);
              window.__novaTest.openLive();
              await sleep(450);
              const liveOpen = !!window.__novaTest.player()
                && window.__novaTest.player().open === true
                && window.__novaTest.player().item
                && window.__novaTest.player().item.kind === 'live'
                && window.__novaTest.state.route === 'home';
              log.push('live-open-direct:' + (liveOpen ? 'ok' : 'FAIL'));
              // Clicking Live TV again keeps the stream and just reopens the
              // drawer with the complete live playlist.
              const beforeItem = window.__novaTest.player().item;
              const liveTotal = window.__novaTest.state.items.filter((x) => x.kind === 'live' && x.url).length;
              document.querySelector('.nav .nav-item[data-route="live"]').click();
              await sleep(220);
              const reopenOk = window.__novaTest.player().item === beforeItem
                && !document.getElementById('channelDrawer').classList.contains('open')
                && (window.__novaTest.player().context.playlist || []).length === liveTotal;
              log.push('live-reopen:' + (reopenOk ? 'ok' : 'FAIL'));
              const dEl = document.getElementById('channelDrawer');
              document.getElementById('drawerClose').click();
              await sleep(280);
              const dStillOpen = dEl.classList.contains('open');
              const pStillOpen = window.__novaTest.player().open;
              log.push('live-drawer-close:' + (!dStillOpen && pStillOpen ? 'ok' : 'FAIL(' + dStillOpen + '/' + pStillOpen + ')'));
              window.__novaTest.player().close();
              await sleep(320);
              const liveListOk = window.__novaTest.state.route === 'home'
                && !!document.querySelector('#view .row')
                && window.__novaTest.state.items.filter((x) => x.kind === 'live').length > 0;
              log.push('live-close-home:' + (liveListOk ? 'ok' : 'FAIL'));

              // Real sidebar clicks (not the test hook) for every nav button.
              const navRoutes = ['home', 'live', 'movies', 'series', 'favorites', 'downloads', 'sources', 'settings'];
              const navFails = [];
              for (const route of navRoutes) {
                const btn = document.querySelector('.nav .nav-item[data-route="' + route + '"]');
                if (!btn) { navFails.push(route + ':missing'); continue; }
                btn.click();
                await sleep(150);
                if (route === 'live' || route === 'favorites') {
                  // Live TV and My List both open the receiver on top of the current page.
                  const p = window.__novaTest.player();
                  if (!p || !p.open || !p.item || p.item.kind !== 'live'
                    || !btn.classList.contains('active')) navFails.push(route + ':receiver');
                  if (p) p.close();
                  await sleep(260);
                } else {
                  if (window.__novaTest.state.route !== route) navFails.push(route + ':route');
                  if (!btn.classList.contains('active')) navFails.push(route + ':active');
                }
              }
              log.push('nav-clicks:' + (navFails.length ? 'FAIL(' + navFails.join(',') + ')' : 'ok'));
              }

              // Home layout editor: reorder, card size, items per row, hide a section.
              window.__novaTest.navigate('home');
              window.__novaTest.render();
              await sleep(250);
              const rtlRow = document.querySelector('#view .row');
              const rtlWrap = rtlRow ? rtlRow.parentElement : null;
              let rtlLeft = null;
              if (rtlRow && rtlWrap) {
                const origScrollBy = rtlRow.scrollBy;
                rtlRow.scrollBy = function (opts) { rtlLeft = opts.left; };
                const nextBtn = rtlWrap.querySelector('.row-arrow.next');
                if (nextBtn) nextBtn.click();
                rtlRow.scrollBy = origScrollBy;
              }
              const isRtl = document.documentElement.dir === 'rtl';
              log.push('rtl-row:' + document.documentElement.dir + '/' + (rtlWrap ? rtlWrap.querySelectorAll('.row-arrow').length : 0) + '/' + ((isRtl ? (rtlLeft !== null && rtlLeft < 0) : (rtlLeft !== null && rtlLeft >= 0)) ? 'ok' : 'FAIL(' + rtlLeft + ')'));

              window.__novaTest.state.settingsTab = 'home';
              window.__novaTest.navigate('settings');
              window.__novaTest.render();
              await sleep(150);
              log.push('layout-rows:' + document.querySelectorAll('#view .layout-row').length);

              document.querySelector('#view .layout-row').querySelectorAll('.layout-ctrls .icon-btn')[1].click();
              await sleep(320);
              log.push('layout-reorder:' + (window.__novaTest.state.settings.home.order.indexOf('hero') === 1 ? 'ok' : 'FAIL'));
              document.querySelectorAll('#view .layout-row')[1].querySelectorAll('.layout-ctrls .icon-btn')[0].click();
              await sleep(320);

              document.querySelectorAll('#view .seg button')[0].click();
              await sleep(320);
              log.push('layout-density:' + (window.__novaTest.state.settings.home.density === 'compact' ? 'ok' : 'FAIL'));

              // Items per row: switch to 8 via dark select (click dropdown then the option)
              const limitWrap = document.querySelector('#view .dark-select');
              if (limitWrap) {
                const btn = limitWrap.querySelector('.dark-select-btn');
                if (btn) btn.click();
                await sleep(120);
                const opt = Array.from(limitWrap.querySelectorAll('.dark-select-option')).find((o) => (o.textContent || '').trim() === '8');
                if (opt) opt.click();
                await sleep(320);
                log.push('layout-limit:' + (window.__novaTest.state.settings.home.rowLimit === 8 ? 'ok' : 'FAIL'));
              } else {
                log.push('layout-limit:FAIL(no-select)');
              }

              window.__novaTest.navigate('home');
              window.__novaTest.render();
              await sleep(120);
              const liveBefore = document.querySelectorAll('#view .card-badge.live').length;
              const cardW = Math.round((document.querySelector('#view .row .card:not(.card-wide)') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width);
              const liveW = Math.round((document.querySelector('#view .row .card-wide') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width);
              log.push('layout-card-w:' + cardW + '/' + liveW);

              window.__novaTest.state.settingsTab = 'home';
              window.__novaTest.navigate('settings');
              window.__novaTest.render();
              await sleep(150);
              document.querySelector('#view .layout-row[data-section="live"] .switch').click();
              await sleep(360);
              window.__novaTest.navigate('home');
              window.__novaTest.render();
              const liveAfter = document.querySelectorAll('#view .card-badge.live').length;
              log.push('layout-hide:' + (liveBefore > 0 && liveAfter === 0 ? 'ok' : 'FAIL(' + liveBefore + '>' + liveAfter + ')'));

              // Drag-and-drop reorder (synthetic HTML5 DnD).
              window.__novaTest.state.settingsTab = 'home';
              window.__novaTest.navigate('settings');
              window.__novaTest.render();
              await sleep(150);
              const dragFrom = document.querySelector('#view .layout-row[data-section="hero"]');
              const dragTo = document.querySelector('#view .layout-row[data-section="movies"]');
              const dt = new DataTransfer();
              dragFrom.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
              dragTo.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
              dragTo.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
              await sleep(400);
              log.push('layout-drag:' + (window.__novaTest.state.settings.home.order.indexOf('hero') > 0 ? 'ok' : 'FAIL'));

              // Restore defaults so screenshots use the stock layout.
              await window.api.settings.patch({ home: { order: ['hero', 'live', 'movies', 'series'], hidden: [], density: 'comfortable', rowLimit: 16 } });
              window.__novaTest.state.settings = await window.api.settings.get();
              window.__novaTest.render();

              window.__novaTest.state.settingsTab = 'subtitles';
              window.__novaTest.navigate('settings');
              window.__novaTest.render();
              log.push('subtitles-rows:' + document.querySelectorAll('#view .switch-row').length);
              window.__novaTest.navigate('home');

              // UI favorites click-through (synthetic DOM click on first heart)
              try {
                const beforeFav = (window.__novaTest.state.library.favorites || []).length;
                const heart = document.querySelector('#view .card-fav');
                if (heart) heart.click();
                await sleep(500);
                const afterAdd = (window.__novaTest.state.library.favorites || []).length;
                log.push('fav-ui-click:' + beforeFav + '->' + afterAdd + '/' + (heart ? (heart.classList.contains('on') ? 'on' : 'off') : 'none'));
                window.__novaTest.navigate('favorites');
                await sleep(400);
                log.push('fav-view-count:' + document.querySelectorAll('#view .card').length);
                await window.api.library.clear('favorites');
                window.__novaTest.state.library = await window.api.library.get('default');
              } catch (err) {
                log.push('fav-ui-error:' + (err && err.message ? err.message : String(err)));
              }

              const sr = 8000, n = 800;
              const buf = new ArrayBuffer(44 + n);
              const dv = new DataView(buf);
              const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
              wr(0, 'RIFF'); dv.setUint32(4, 36 + n, true); wr(8, 'WAVE'); wr(12, 'fmt ');
              dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
              dv.setUint32(24, sr, true); dv.setUint32(28, sr, true); dv.setUint16(32, 1, true);
              dv.setUint16(34, 8, true); wr(36, 'data'); dv.setUint32(40, n, true);
              for (let i = 0; i < n; i++) dv.setUint8(44 + i, 128);
              let bin = '';
              const bytes = new Uint8Array(buf);
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              const wav = 'data:audio/wav;base64,' + btoa(bin);

              window.__novaTest.play({ key: 'smoke-test', name: 'Smoke test', url: wav, kind: 'vod', group: 'Test' }, []);
              await sleep(1400);
              const player = window.__novaTest.player();
              log.push('player-open:' + (player && player.open ? 'yes' : 'no'));
              log.push('player-error:' + (document.getElementById('video').error ? 'yes' : 'no'));
              log.push('player-controls:' + document.querySelectorAll('.player-bottom .ctrl').length);
              log.push('subtitle-api:' + (typeof window.__novaTest.player().renderer.render === 'function'));
              if (player) player.close();
              log.push('player-closed:' + (!window.__novaTest.player().open ? 'yes' : 'no'));
              log.push('player-live:' + (player && player.isLive ? 'yes' : 'no'));
              log.push('audio-hidden:' + (document.getElementById('audioBtn').offsetParent === null ? 'yes' : 'no'));

              const favLib1 = await window.api.library.favorite({ key: 'smoke-fav', name: 'Fav', url: 'http://x', kind: 'movie' }, true);
              log.push('fav-added:' + favLib1.length);
              const favLib2 = await window.api.library.clear('favorites');
              log.push('fav-cleared:' + favLib2.favorites.length);

              if (${STREAM_SMOKE ? 'true' : 'false'}) {
                const streamItem = window.__novaTest.state.items.find((i) => String(i.url).indexOf('x36xhzz') >= 0);
                if (streamItem) {
                  window.__novaTest.play(streamItem, []);
                  const vid = document.getElementById('video');
                  let waited = 0;
                  for (let i = 0; i < 40; i += 1) {
                    await sleep(1000);
                    waited = i + 1;
                    if (vid.readyState >= 2) break;
                  }
                  log.push('hls-ready:' + vid.readyState + ' t:' + Number(vid.currentTime || 0).toFixed(1) + ' wait:' + waited);
                  log.push('hls-size:' + vid.videoWidth + 'x' + vid.videoHeight);
                  log.push('hls-error:' + (vid.error ? vid.error.code : 'none'));
                  const pl = window.__novaTest.player();
                  log.push('hls-levels:' + (pl.hls ? pl.hls.levels.length : 0));
                  if (pl) pl.close();
                } else {
                  log.push('hls-item:missing');
                }
              }

              if (${DOWNLOAD_SMOKE ? 'true' : 'false'}) {
                const dl = await window.api.downloads.add({
                  title: 'Smoke download',
                  url: 'https://download.samplelib.com/mp4/sample-5s.mp4'
                });
                log.push('dl-add:' + (dl.record ? dl.record.state : dl.error));
                let dlState = '';
                let dlRec = null;
                for (let i = 0; i < 45; i += 1) {
                  await sleep(1000);
                  const list = await window.api.downloads.list();
                  dlRec = list.find((x) => dl.record && x.id === dl.record.id);
                  dlState = dlRec ? dlRec.state : '';
                  if (dlState === 'Complete' || dlState === 'Failed') break;
                }
                log.push('dl-state:' + dlState + ' size:' + (dlRec ? dlRec.received : 0));
                log.push('dl-error:' + (dlRec && dlRec.error ? dlRec.error : 'none'));
                log.push('dl-file:' + (dlRec && dlRec.file ? 'yes' : 'no'));
                if (dlRec) await window.api.downloads.remove(dlRec.id);
              }

              window.__novaTest.state.library.search = await window.api.library.search('demo');
              window.__novaTest.state.searchTerm = 'big';
              window.__novaTest.navigate('search');
              log.push('search-results:' + (document.querySelectorAll('#view .card').length));
              window.__novaTest.state.searchTerm = '';
            } catch (err) {
              log.push('EX:' + (err && err.message ? err.message : String(err)));
            }
            return log.join(' | ');
          })()`);
        } catch (err) {
          detail = 'EXEC ' + err.message;
        }
      }
      console.log('SMOKE_RESULT ' + (ready ? 'PASS' : 'FAIL') + ' ' + (lastError || ''));
      if (detail) console.log('SMOKE_DETAIL ' + detail);

      if (ready && SCREENSHOTS) {
        try {
          win.showInactive();
          const shotDir = path.join(app.getAppPath(), 'screenshots');
          fs.mkdirSync(shotDir, { recursive: true });
          const snap = async (name) => {
            await new Promise((r) => setTimeout(r, 900));
            const img = await win.webContents.capturePage();
            fs.writeFileSync(path.join(shotDir, name + '.png'), img.toPNG());
          };
          const run = (code) => win.webContents.executeJavaScript(code);
          const waitVideo = (ms) => run("(async () => { const v = document.getElementById('video'); const t0 = Date.now(); while (Date.now() - t0 < " + ms + " && v.readyState < 2) await new Promise((r) => setTimeout(r, 150)); })()");

          // Give the Downloads screen real data to show.
          try {
            await run("(async () => { const r = await window.api.downloads.add({ title: 'Sample Clip (MP4)', url: 'https://download.samplelib.com/mp4/sample-5s.mp4', group: 'Demo Movies' }); window.__novaShotDl = r.record && r.record.id; })()");
            for (let i = 0; i < 30; i += 1) {
              await new Promise((r) => setTimeout(r, 1000));
              const state = await run("(async () => { const l = await window.api.downloads.list(); const r = l.find((x) => x.id === window.__novaShotDl); return r ? r.state : ''; })()");
              if (state === 'Complete' || state === 'Failed') break;
            }
            await run("window.__novaTest.reload()");
          } catch (_) {}

          await run("window.__novaTest.navigate('home'); window.__novaTest.render();");
          await snap('01-home-ar');
          // Seed "last watched" with the reliable Mux test channel so the
          // direct Live TV screenshot shows a decoded frame, not a black buffer.
          await run("var muxIt = window.__novaTest.state.items.find(function(i){return i.kind === 'live' && /mux/i.test(i.name)}); if (muxIt) { window.__novaTest.play(muxIt, window.__novaTest.state.items.filter(function(i){return i.kind === 'live'})); window.__novaTest.player().close(); }");
          await new Promise((r) => setTimeout(r, 350));
          await run("window.__novaTest.openLive()");
          await waitVideo(10000);
          await snap('02-live-ar');
          await run("document.getElementById('drawerClose').click(); window.__novaTest.player().close()");
          await run("window.__novaTest.navigate('movies')");
          await snap('03-movies-ar');
          await run("window.__novaTest.navigate('downloads')");
          await snap('03b-downloads-ar');
          await run("window.__novaTest.navigate('sources')");
          await snap('04-sources-ar');
          await run("window.__novaTest.state.settingsTab='general'; window.__novaTest.navigate('settings')");
          await snap('05-settings-ar');
          await run("window.__novaTest.state.settingsTab='subtitles'; window.__novaTest.render()");
          await snap('06-subtitles-ar');
          await run("window.__novaTest.state.settingsTab='home'; window.__novaTest.render()");
          await snap('06b-home-layout-ar');
          await run("window.__novaTest.guide()");
          await snap('07-guide-ar');
          await run("document.querySelector('.modal-close').click(); window.__novaTest.navigate('home'); window.__novaTest.detail(window.__novaTest.state.items.find(function(i){return i.kind !== 'live'}), window.__novaTest.state.items)");
          await snap('08-detail-ar');
          await run("document.querySelector('.modal-close').click(); var it = window.__novaTest.state.items.find(function(i){return String(i.url).indexOf('x36xhzz') >= 0}) || window.__novaTest.state.items.find(function(i){return i.kind !== 'live'}); window.__novaTest.play(it, [])");
          await new Promise((r) => setTimeout(r, 6500));
          await run("window.__novaTest.player().poke()");
          await snap('09-player-ar');
          await run("window.__novaTest.player().close()");
          await run("var liveIt = window.__novaTest.state.items.find(function(i){return i.kind === 'live' && /mux/i.test(i.name)}) || window.__novaTest.state.items.find(function(i){return i.kind === 'live' && i.tvgId === 'aje'}) || window.__novaTest.state.items.find(function(i){return i.kind === 'live'}); window.__novaTest.play(liveIt, window.__novaTest.state.items.filter(function(i){return i.kind === 'live'}))");
          await new Promise((r) => setTimeout(r, 6000));
          await run("window.__novaTest.player().poke()");
          await snap('09b-player-live-ar');
          await run("document.getElementById('drawerBtn').click()");
          await snap('09c-player-live-drawer-ar');
          await run("document.getElementById('drawerClose').click(); window.__novaTest.player().close()");
          await run("window.__novaTest.setLanguage('en')");
          await snap('10-home-en');
          await run("window.__novaTest.openLive()");
          await waitVideo(8000);
          await snap('11-live-en');
          await run("document.getElementById('drawerClose').click(); window.__novaTest.player().close()");
          await run("window.__novaTest.state.settingsTab='general'; window.__novaTest.navigate('settings')");
          await snap('12-settings-en');
          await run("window.__novaTest.state.settingsTab='home'; window.__novaTest.render()");
          await snap('12b-home-layout-en');
          await run("window.__novaTest.setLanguage('ar'); document.documentElement.dataset.theme = 'light'; window.__novaTest.navigate('home')");
          await snap('13-home-light-ar');
          await run("window.__novaTest.openLive()");
          await waitVideo(8000);
          await snap('14-live-light-ar');
          await run("document.getElementById('drawerClose').click(); window.__novaTest.player().close(); document.documentElement.dataset.theme = 'dark'");
          console.log('SCREENSHOTS_DONE ' + shotDir);
        } catch (err) {
          console.log('SCREENSHOTS_FAIL ' + err.message);
        }
      }

      setTimeout(() => app.quit(), 400);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('SMOKE_RESULT FAIL load ' + code + ' ' + desc);
      setTimeout(() => app.quit(), 200);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.log('SMOKE_RESULT FAIL renderer ' + details.reason);
      setTimeout(() => app.quit(), 200);
    });
  }

  win.on('closed', () => { win = null; });
}

function registerIpc() {
  const ipcDeps = { ipcMain, ctx: { store, win, logEvent, assertTrustedSender, fetchText, refreshSource, loadSource, addSource, removeSource, refreshEpg, sendUpdateStatus, verifyUpdateManifest, recordingsDirPath, stopRecordingInternal, logsDir, shutdownForReset, clearCache, safeName, assertSafeUrl, allowReadPath, assertAllowedReadPath, readCache, cachePath, publicSource, prepareSourceSecrets, sourceForUse, encryptSecret, xtreamAccountUrl, xtreamUrl, fetchBuffer, parseEpg, writeCache, updateGuard, autoUpdater, app, secrets, path, fs, app, dialog, shell, clipboard, session, crypto } };
  require('./ipc-updates')(ipcDeps);
  require('./ipc-sources')(ipcDeps);
  require('./ipc-storage')(ipcDeps);
  require('./ipc-window')(ipcDeps);

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    dataDir: app.getPath('userData')
  }));

  ipcMain.handle('app:demoPath', () => path.join(app.getAppPath(), 'sample', 'demo.m3u'));

  ipcMain.handle('applock:verify', async (event, pin) => { assertTrustedSender(event); return verifyAppLockPin(pin); });


  // Verify the signed update manifest before downloading anything.
  async function verifyUpdateManifest() {
    try {
      const { verify } = require('./manifest-verify');
      const url = 'https://raw.githubusercontent.com/radhouanemokranecontact-tech/GomizPlayer-IPTV-PC/main/RELEASE_MANIFEST.yml';
      const res = await fetch(url);
      if (!res.ok) return { ok: false, reason: 'manifest-unreachable' };
      return verify(await res.text());
    } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  }

  // User-initiated download (no automatic download of unsigned updates)

  // ---------- settings ----------
  ipcMain.handle('settings:get', (event) => {
    assertTrustedSender(event);
    const st = JSON.parse(JSON.stringify(store.settings || {}));
    delete st.appLockPin;
    st.appLockSet = !!(store.settings && (store.settings.appLockHash || store.settings.appLockSalt || store.settings.appLockPin));
    delete st.appLockHash;
    delete st.appLockSalt;
    return st;
  });
  ipcMain.handle('settings:patch', async (event, patch) => {
    assertTrustedSender(event);
    const prev = store.settings || {};
    let p = Object.assign({}, patch || {});
    if (Object.prototype.hasOwnProperty.call(p, 'appLockPin')) {
      const pin = String(p.appLockPin || '');
      delete p.appLockPin;
      if (pin) {
        const salt = crypto.randomBytes(16);
        const hash = crypto.scryptSync(pin, salt, 64);
        p.appLockHash = hash.toString('base64');
        p.appLockSalt = salt.toString('base64');
      } else {
        p.appLockHash = '';
        p.appLockSalt = '';
      }
    }
    const res = store.patchSettings(p);
    if (patch && (Object.prototype.hasOwnProperty.call(patch, 'proxyMode') || Object.prototype.hasOwnProperty.call(patch, 'proxyUrl'))) {
      await applyProxySettings();
    }
    const now = store.settings || {};
    if (patch && (Object.prototype.hasOwnProperty.call(patch, 'consentShown') || Object.prototype.hasOwnProperty.call(patch, 'analyticsEnabled') || Object.prototype.hasOwnProperty.call(patch, 'telemetryEnabled') || Object.prototype.hasOwnProperty.call(patch, 'crashReportingEnabled'))) {
      if (consentGranted() && (now.analyticsEnabled !== false && now.telemetryEnabled !== false) && !(prev.consentShown && prev.analyticsEnabled !== false && prev.telemetryEnabled !== false)) {
        sendTelemetry('consent_granted');
        sendFirstRunIfNeeded();
        startHeartbeat();
      }
    }
    return res;
  });

  // ---------- sources ----------

  // Re-enter credentials after a failed decrypt (e.g. restored backup on a new PC).




  // ---------- network / files ----------




  ipcMain.handle('shell:showItem', (event, file) => {
    assertTrustedSender(event);
    try {
      const target = path.resolve(String(file || ''));
      const customDl = String((store && store.settings && store.settings.downloadsDir) || '').trim();
      const downloadsDir = customDl || app.getPath('downloads');
      const recDir = recordingsDirPath();
      const pics = path.join(app.getPath('pictures'), 'GomizPlayer Screenshots');
      const ok = [downloadsDir, recDir, pics, app.getPath('userData')].some((d) => d && isPathInsideDir(target, d));
      if (!ok) return false;
      shell.showItemInFolder(target);
      return true;
    } catch (_) { return false; }
  });
  ipcMain.handle('shell:openExternal', (event, url) => {
    assertTrustedSender(event);
    const u = String(url || '');
    if (/^(https?:|mailto:)/i.test(u)) return shell.openExternal(u);
    return false;
  });
  ipcMain.handle('clipboard:writeText', async (event, text) => {
    assertTrustedSender(event);
    try { await clipboard.writeText(String(text == null ? '' : text)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  // ---------- library ----------
  ipcMain.handle('library:get', (event, profile) => { assertTrustedSender(event); return store.library(profile); });
  ipcMain.handle('library:favorite', (event, { profile, item, on }) => {
    assertTrustedSender(event);
    return on ? store.addFavorite(profile, item) : store.removeFavorite(profile, item.key);
  });
  ipcMain.handle('library:history', (event, { profile, item, kind }) => { assertTrustedSender(event); return store.pushHistory(profile, item, kind); });
  ipcMain.handle('library:progress', (event, { profile, key, position, duration }) => {
    assertTrustedSender(event);
    return store.patchHistory(profile, key, { position, duration });
  });
  ipcMain.handle('library:search', (event, { profile, term }) => { assertTrustedSender(event); return store.addSearch(profile, term); });
  ipcMain.handle('library:clear', (event, { profile, what }) => { assertTrustedSender(event); return store.clearLibrary(profile, what); });
  ipcMain.handle('profiles:list', (event) => { assertTrustedSender(event); return store.profiles(); });
  ipcMain.handle('profiles:create', (event, name) => { assertTrustedSender(event); return { id: store.createProfile(name), profiles: store.profiles() }; });
  ipcMain.handle('profiles:delete', (event, name) => { assertTrustedSender(event); return { profile: store.deleteProfile(name), profiles: store.profiles() }; });

  // ---------- EPG ----------

  // ---------- downloads ----------

  // ---------- backup / storage ----------












}

// ---------- recording (ffmpeg) ----------
let recordingProc = null;
let recordingPath = null;
let recordingTarget = null;
let recordingLastError = null;


function recordingsDirPath() {
  const customRecDir = String((store && store.settings && store.settings.recordingsDir) || '').trim();
  return customRecDir || path.join(app.getPath('downloads'), 'GomizPlayer Recordings');
}

async function stopRecordingInternal() {
  const proc = recordingProc;
  const prevPath = recordingPath;
  if (!proc) {
    const had = !!recordingPath || !!recordingTarget;
    recordingProc = null;
    recordingPath = null;
    recordingTarget = null;
    return { ok: had, path: prevPath };
  }
  recordingProc = null;
  recordingPath = null;
  recordingTarget = null;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    try { proc.once('exit', finish); proc.once('error', finish); } catch (_) {}
    try { proc.kill('SIGINT'); } catch (_) { try { proc.kill(); } catch (__) {} }
    setTimeout(finish, 1500);
  });
  return { ok: true, path: prevPath };
}






function networkUA() {
  const s = (store && store.settings) || {};
  const v = String(s.networkUserAgent || '').trim();
  return v || DEFAULT_UA;
}

async function fetchBuffer(url, limit, timeoutMs = 120000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': networkUA(), Accept: '*/*' },
      signal: ctl.signal,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limit) throw new Error('Response too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshEpg(id, url) {
  const zlib = require('zlib');
  let buf;
  if (isLocalAddress(url)) {
    const file = localPath(url);
    const stat = await fsp.stat(file);
    if (stat.size > MAX_EPG_BYTES) throw new Error('EPG file too large');
    buf = await fsp.readFile(file);
    if (/\.gz$/i.test(file)) buf = zlib.gunzipSync(buf);
  } else {
    buf = await fetchBuffer(url, MAX_EPG_BYTES);
    if (/\.gz$/i.test(String(url).split('?')[0]) || (buf[0] === 0x1f && buf[1] === 0x8b)) {
      buf = zlib.gunzipSync(buf);
    }
  }
  const programmes = parseEpg(buf.toString('utf8'));
  writeCache('epg-' + id, { id, fetchedAt: Date.now(), count: programmes.length, programmes });
  return { id, count: programmes.length };
}

app.whenReady().then(async () => {
  store = new Store();
  updateGuard = new UpdateGuard(app.getPath('userData'), app.getVersion());
  try { updateGuard.noteStartup(app.getVersion()); } catch (_) {}
  if (SMOKE || SCREENSHOTS) {
    try { store.patchSettings({ consentShown: true, analyticsEnabled: false, crashReportingEnabled: false, telemetryEnabled: false }); } catch (_) {}
  }
  if (SMOKE || SCREENSHOTS) {
    try { store.patchSettings({ consentShown: true }); } catch (_) {}
  }

  // Optional startup cleanup (all off by default)
  try {
    const s = store.settings || {};
    if (s.clearSourceCacheOnLaunch) {
      const dir = cacheDir();
      try {
        for (const f of fs.readdirSync(dir)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
      } catch (_) {}
    }
    if (s.clearNetworkCacheOnLaunch) {
      try { await session.defaultSession.clearCache(); } catch (_) {}
    }
    if (s.clearWatchHistoryOnLaunch) {
      try { store.clearWatchHistoryAllProfiles(); } catch (_) {}
    }
  } catch (_) {}

  await applyProxySettings();
  await ensureTelemetryId();
  setupCrashHandlers();
  await migrateSecrets();
  downloads = new Downloads(store, (list) => {
    if (win && !win.isDestroyed()) win.webContents.send('downloads:changed', list);
  });
  setupSecurity();
  registerIpc();

  setupAutoUpdates();
  createWindow();
  sendTelemetry('app_start');
  await sendFirstRunIfNeeded();
  startHeartbeat();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

'use strict';
// ipc-storage — extracted IPC handlers.
module.exports = function register(deps) {
  const { ipcMain, ctx } = deps;
  const { assertTrustedSender, store, win, logEvent } = ctx;

  ipcMain.handle('app:backupNow', (event) => {
    assertTrustedSender(event);
    try { const name = store.backupNow(); return name ? { ok: true, name } : { ok: false }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('app:listBackups', (event) => {
    assertTrustedSender(event);
    try { return { ok: true, backups: store.listBackups() }; }
    catch (e) { return { ok: false, backups: [] }; }
  });

  ipcMain.handle('app:exportBackup', async (event) => {
    assertTrustedSender(event);
    const res = await dialog.showSaveDialog(win, {
      title: 'Export GomizPlayer IPTV backup',
      defaultPath: path.join(app.getPath('documents'), 'gomizplayer-backup.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    // Security: exported backups NEVER contain credentials (plain or encrypted).
    // Credentials stay in the OS-protected store and are re-entered after import.
    const payload = store.exportBackup();
    try {
      if (Array.isArray(payload.sources)) {
        payload.sources = payload.sources.map((src) => {
          const o = Object.assign({}, src);
          delete o.password;
          delete o.passwordEnc;
          delete o.username;
          return o;
        });
      }
    } catch (_) {}
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, file: res.filePath };
  });

  ipcMain.handle('app:importBackup', async (event) => {
    assertTrustedSender(event);
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    try {
      const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
      const hasPlainPasswords = Array.isArray(raw && raw.sources) && raw.sources.some((s) => s && typeof s.password === 'string' && s.password && !s.passwordEnc);
      if (hasPlainPasswords) {
        let canEnc = false;
        try { canEnc = await canEncryptSecrets(); } catch (_) { canEnc = false; }
        if (!canEnc) {
          return { error: 'Secure credential storage is unavailable on this system. Import was canceled to avoid storing passwords without encryption. Existing sources were not changed.' };
        }
      }
      store.importBackup(raw);
      try {
        const sources = store.sources() || [];
        for (const src of sources) {
          if (src && src.password && !src.passwordEnc) {
            try {
              const enc = await encryptSecret(src.password, { requireEncryption: true });
              if (enc) store.updateSource(src.id, { passwordEnc: enc, password: '', passwordEncV: 2 });
            } catch (err) {
              return { error: (err && (err.userMessage || err.message)) || 'Could not securely store imported credentials' };
            }
          }
        }
      } catch (err) {
        return { error: (err && (err.userMessage || err.message)) || 'Import failed while securing credentials' };
      }
      return { ok: true };
    } catch (e) {
      return { error: e.message || 'Invalid backup' };
    }
  });

  ipcMain.handle('app:clearCache', async (event) => {
    assertTrustedSender(event);
    const dir = path.join(app.getPath('userData'), 'cache');
    let count = 0;
    try {
      for (const f of fs.readdirSync(dir)) {
        try { fs.unlinkSync(path.join(dir, f)); count++; } catch (_) {}
      }
    } catch (_) {}
    return { ok: true, count };
  });

  ipcMain.handle('app:storageStats', async (event) => {
    assertTrustedSender(event);
    const root = app.getPath('userData');
    const walk = (p) => {
      let total = 0;
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) {
          for (const f of fs.readdirSync(p)) total += walk(path.join(p, f));
        } else total += st.size;
      } catch (_) {}
      return total;
    };
    const fmt = (b) => {
      if (b > 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      if (b > 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
      if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
      return b + ' B';
    };
    const cacheDir = path.join(root, 'cache');
    const legacyDlDir = path.join(root, 'downloads');
    const customDl = String((store.settings && store.settings.downloadsDir) || '').trim();
    const dlDirs = new Set([legacyDlDir]);
    if (customDl) dlDirs.add(customDl);
    try {
      for (const rec of (store.data && store.data.downloads) || []) {
        if (rec && rec.dir) dlDirs.add(String(rec.dir));
      }
    } catch (_) {}
    const recDir = recordingsDirPath();
    const dataSize = walk(root);
    const cacheSize = walk(cacheDir);
    let dlSize = 0;
    try {
      const dls = downloads ? downloads.list() : ((store.data && store.data.downloads) || []);
      for (const rec of dls) { if (rec && rec.dir) dlDirs.add(String(rec.dir)); }
    } catch (_) {}
    for (const d of dlDirs) dlSize += walk(d);
    const recSize = walk(recDir);
    return { dataSize, cacheSize, dlSize, recSize, fmtData: fmt(dataSize), fmtCache: fmt(cacheSize), fmtDownloads: fmt(dlSize), fmtRecordings: fmt(recSize) };
  });

  ipcMain.handle('app:resetSettings', async (event) => {
    assertTrustedSender(event);
    return store.resetSettings();
  });

  ipcMain.handle('app:factoryReset', async (event, payload) => {
    assertTrustedSender(event);
    const confirm = String(payload && payload.confirm || '');
    if (confirm !== 'RESET') return { ok: false, error: 'invalid_confirmation' };

    const root = path.resolve(app.getPath('userData'));
    const appPathResolved = path.resolve(app.getAppPath());
    const homeDir = path.resolve(app.getPath('home'));
    const docsDir = path.resolve(app.getPath('documents'));
    const picturesDir = path.resolve(app.getPath('pictures'));
    const downloadsSysDir = path.resolve(app.getPath('downloads'));
    const isDangerous = (p) => {
      if (!p) return true;
      const rp = path.resolve(p);
      const parsed = path.parse(rp);
      if (rp === parsed.root) return true;
      if (rp === homeDir || rp === docsDir || rp === picturesDir || rp === downloadsSysDir) return true;
      if (rp === appPathResolved || isPathInsideDir(rp, appPathResolved) || isPathInsideDir(appPathResolved, rp)) return true;
      return false;
    };

    const result = { ok: false, deleted: [], kept: [], errors: [] };
    const safeRm = (target, label) => {
      try {
        if (!target) return;
        const rp = path.resolve(target);
        if (isDangerous(rp)) { result.kept.push(label || rp); return; }
        if (!fs.existsSync(rp)) return;
        fs.rmSync(rp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        result.deleted.push(label || rp);
      } catch (e) {
        result.errors.push(String((label || target) + ': ' + (e && e.message || e)));
      }
    };
    const safeRmContents = (dir, label) => {
      try {
        if (!dir) return;
        const rp = path.resolve(dir);
        if (isDangerous(rp)) { result.kept.push(label || rp); return; }
        if (!fs.existsSync(rp)) return;
        const st = fs.statSync(rp);
        if (!st.isDirectory()) { safeRm(rp, label || rp); return; }
        for (const name of fs.readdirSync(rp)) {
          safeRm(path.join(rp, name), (label || rp) + path.sep + name);
        }
      } catch (e) {
        result.errors.push(String((label || dir) + ': ' + (e && e.message || e)));
      }
    };

    try {
      // Stop playback/UI activity in renderer best-effort
      try { if (win && !win.isDestroyed()) win.webContents.send('app:prepareFactoryReset'); } catch (_) {}

      // Stop recording
      try { if (typeof stopRecordingInternal === 'function') await stopRecordingInternal(); } catch (e) { result.errors.push('stopRecording: ' + String(e && e.message || e)); }

      // Stop downloads and collect tracked external files before wiping records
      let trackedDownloadFiles = [];
      try {
        if (downloads) {
          try {
            const list = typeof downloads.list === 'function' ? downloads.list() : [];
            for (const rec of list || []) {
              try {
                if (typeof downloads.fileFor === 'function') trackedDownloadFiles.push(downloads.fileFor(rec));
                if (typeof downloads.partFor === 'function') trackedDownloadFiles.push(downloads.partFor(rec));
                if (rec && rec.dir) {
                  trackedDownloadFiles.push(path.join(rec.dir, rec.id + '.video'));
                  trackedDownloadFiles.push(path.join(rec.dir, rec.id + '.part'));
                }
              } catch (_) {}
            }
          } catch (_) {}
          if (typeof downloads.shutdownForReset === 'function') await downloads.shutdownForReset();
        }
      } catch (e) { result.errors.push('stopDownloads: ' + String(e && e.message || e)); }

      // Flush store
      try { if (store && store._saveTimer) { clearTimeout(store._saveTimer); store._saveTimer = null; } } catch (_) {}
      try { if (store && typeof store.save === 'function') store.save(); } catch (_) {}

      // Clear Electron session/profile data
      try { await session.defaultSession.clearCache(); } catch (e) { result.errors.push('clearCache: ' + String(e && e.message || e)); }
      try {
        await session.defaultSession.clearStorageData({
          storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
      } catch (e) { result.errors.push('clearStorageData: ' + String(e && e.message || e)); }

      // Determine managed/app-owned dirs
      const legacyDlDir = path.join(root, 'downloads');
      const defaultRecDir = path.join(downloadsSysDir, 'GomizPlayer Recordings');
      const defaultScreensDir = path.join(picturesDir, 'GomizPlayer Screenshots');
      const customDlDir = String((store && store.settings && store.settings.downloadsDir) || '').trim();
      const customRecDir = String((store && store.settings && store.settings.recordingsDir) || '').trim();

      // Delete tracked download files (including in custom dir) - app-owned identifiable files only
      for (const f of Array.from(new Set(trackedDownloadFiles.filter(Boolean)))) {
        try {
          const rp = path.resolve(f);
          if (isDangerous(rp)) continue;
          if (fs.existsSync(rp)) safeRm(rp, 'download-file:' + rp);
        } catch (_) {}
      }

      // App-owned/default managed folders outside userData
      safeRm(defaultRecDir, 'default-recordings-dir');
      safeRm(defaultScreensDir, 'screenshots-dir');

      // Custom external dirs: do not bulk delete arbitrary user folders; keep and report
      if (customDlDir) {
        const cr = path.resolve(customDlDir);
        if (cr === path.resolve(legacyDlDir) || isPathInsideDir(cr, root)) {
          safeRm(cr, 'custom-downloads-dir(app-owned)');
        } else if (cr !== path.resolve(defaultRecDir)) {
          result.kept.push('custom-downloads-dir(external,tracked-files-only): ' + cr);
        }
      }
      if (customRecDir) {
        const cr = path.resolve(customRecDir);
        if (isPathInsideDir(cr, root)) {
          safeRm(cr, 'custom-recordings-dir(app-owned)');
        } else if (cr !== path.resolve(defaultRecDir)) {
          result.kept.push('custom-recordings-dir(external,not-bulk-deleted): ' + cr);
        }
      }

      // Wipe all app userData contents (app-owned profile/storage)
      if (!isDangerous(root) && root.includes('gomizplayer')) {
        safeRmContents(root, 'userData');
        try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
      } else if (!isDangerous(root)) {
        // still app.getPath('userData') but name check failed; be conservative: remove known app files/dirs
        const known = ['gomizplayer.json', 'gomizplayer.json.tmp', 'gomizplayer.json.corrupt', 'downloads.json', 'downloads.json.tmp', 'cache', 'logs', 'downloads'];
        for (const k of known) safeRm(path.join(root, k), 'userData/' + k);
        try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
      } else {
        result.errors.push('unsafe userData path, skipped: ' + root);
      }

      result.ok = result.errors.length === 0;
    } catch (e) {
      result.ok = false;
      result.errors.push(String(e && e.message || e));
    }

    // Relaunch to first-run state
    setTimeout(() => {
      try { app.relaunch(); } catch (_) {}
      try { app.exit(0); } catch (_) { try { app.quit(); } catch (_) {} }
    }, 500);

    return result;
  });

  ipcMain.handle('app:diagnosticsLog', (event, kind, extra) => {
    assertTrustedSender(event);
    // Local-only: append to app.log. Never sent anywhere, even if telemetry is on.
    try { logEvent('error', String(kind || 'renderer-error'), extra || {}); return true; }
    catch (_) { return false; }
  });

  ipcMain.handle('app:diagnosticsTail', (event, count) => {
    assertTrustedSender(event);
    try {
      const file = path.join(logsDir(), 'app.log');
      if (!fs.existsSync(file)) return { ok: true, lines: [] };
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      return { ok: true, lines: lines.slice(-Math.min(200, Math.max(1, Number(count) || 50))) };
    } catch (_) { return { ok: false, lines: [] }; }
  });

  ipcMain.handle('app:exportDiagnostics', async (event) => {
    assertTrustedSender(event);
    const res = await dialog.showSaveDialog(win, {
      title: 'Export diagnostics',
      defaultPath: path.join(app.getPath('documents'), 'gomizplayer-diagnostics.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    const settings = JSON.parse(JSON.stringify(store.settings || {}));
    if (settings.appLockPin) settings.appLockPin = '***';
    const payload = {
      exportedAt: new Date().toISOString(),
      app: { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform },
      settings,
      sourcesCount: (store.data.sources || []).length,
      epgCount: ((store.settings && store.settings.epgUrls) || []).length,
      updateGuard: updateGuard ? updateGuard.getState() : null,
      recentLogs: (() => {
        try {
          const f = path.join(logsDir(), 'app.log');
          return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-100) : [];
        } catch (_) { return []; }
      })()
    };
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, file: res.filePath };
  });

  ipcMain.handle('downloads:list', (event) => {
    assertTrustedSender(event);
    return downloads.list().map((rec) => ({
      ...rec,
      file: rec.state === 'Complete' ? downloads.fileFor(rec) : ''
    }));
  });

  ipcMain.handle('downloads:add', async (event, item) => {
    assertTrustedSender(event);
    try {
      if (item && item.url) await assertSafeUrl(item.url, { allowRecordingProtocols: true });
      return { record: downloads.add(item) };
    } catch (e) {
      return { error: e.message || 'download failed' };
    }
  });

  ipcMain.handle('downloads:pause', (event, id) => {
    assertTrustedSender(event); assertTrustedSender(event); return downloads.pause(id); });

  ipcMain.handle('downloads:resume', (event, id) => {
    assertTrustedSender(event); assertTrustedSender(event); return downloads.resume(id); });

  ipcMain.handle('downloads:remove', (event, id) => {
    assertTrustedSender(event); assertTrustedSender(event); return downloads.remove(id); });

  ipcMain.handle('downloads:open', (event, id) => {
    assertTrustedSender(event);
    try {
      const rec = downloads.list().find((d) => d.id === id);
      if (!rec || rec.state !== 'Complete') return false;
      const file = downloads.fileFor(rec);
      const customDl = String((store && store.settings && store.settings.downloadsDir) || '').trim();
      const downloadsDir = customDl || app.getPath('downloads');
      if (!isPathInsideDir(file, downloadsDir)) return false;
      shell.showItemInFolder(path.resolve(file));
      return true;
    } catch (_) { return false; }
  });

ipcMain.handle('recording:start', async (event, payload) => {
    assertTrustedSender(event);
    const url = payload && payload.url;
    if (!url) return { error: 'no url' };
    try { await assertSafeUrl(url, { allowRecordingProtocols: true }); } catch (e) { return { error: e.message || 'invalid url' }; }
    const headers = (payload && payload.headers) || {};
    const name = (payload && payload.name) || 'channel';
    const key = (payload && payload.key) || '';
    const target = { url: String(url), name: String(name), headers, key: String(key || '') };

    if (recordingProc) {
      await stopRecordingInternal();
    }

    const recDir = recordingsDirPath();
    try { fs.mkdirSync(recDir, { recursive: true }); } catch (_) {}
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(recDir, safeName(name) + '_' + ts + '.ts');
    if (!isPathInsideDir(outPath, recDir)) return { error: 'invalid output path' };
    let ffmpegPath;
    try { ffmpegPath = require('ffmpeg-static'); } catch (_) { ffmpegPath = null; }
    if (ffmpegPath && ffmpegPath.includes('app.asar')) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (ffmpegPath && !fs.existsSync(ffmpegPath)) {
      ffmpegPath = null;
    }
    if (!ffmpegPath || (typeof ffmpegPath === 'string' && !fs.existsSync(ffmpegPath))) {
      return { error: 'ffmpeg unavailable' };
    }
    const args = ['-y', '-protocol_whitelist', 'http,https,tcp,tls,crypto,rtmp,rtmps,rtsp,rtsps,udp', '-i', String(url)];
    if (headers && typeof headers === 'object' && Object.keys(headers).length) {
      const pairs = Object.entries(headers).map(([k, v]) => sanitizeFfmpegHeaderValue(k) + ': ' + sanitizeFfmpegHeaderValue(v)).filter((s) => s && s !== ':');
      if (pairs.length) {
        const hstr = pairs.join('') + '';
        args.unshift('-headers', hstr);
      }
    }
    args.push('-c', 'copy', '-f', 'mpegts', outPath);
  let proc = null;
  try {
    proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch (err) {
    return { error: String(err && err.message || err) };
  }
  recordingProc = proc;
  recordingPath = outPath;
  recordingTarget = target;
  recordingLastError = null;
  let stderr = '';
  if (proc.stderr) {
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
  }
  // Wait briefly to detect immediate failures (bad URL, 404, etc.).
  const earlyExit = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    const onExit = (code) => { clearTimeout(timer); resolve(code); };
    const onErr = (err) => { clearTimeout(timer); resolve('ERR:' + (err && err.message || err)); };
    proc.once('exit', onExit);
    proc.once('error', onErr);
  });
  if (earlyExit !== null) {
    if (recordingProc === proc) { recordingProc = null; recordingPath = null; recordingTarget = null; }
    const msg = stderr.trim().split('\n').pop() || ('ffmpeg exited with code ' + earlyExit);
      recordingLastError = msg;
    try { fs.unlinkSync(outPath); } catch (_) {}
    return { error: msg };
  }
  const onEnd = () => {
    if (recordingProc === proc) { recordingProc = null; recordingPath = null; recordingTarget = null; }
  };
  proc.on('exit', onEnd);
  proc.on('error', onEnd);
  return { ok: true, path: outPath, target };
});

ipcMain.handle('recording:stop', async (event) => {
    assertTrustedSender(event);
  return await stopRecordingInternal();
});

ipcMain.handle('recording:status', async (event) => {
    assertTrustedSender(event);
  return { recording: !!recordingProc, path: recordingPath, target: recordingTarget, error: recordingLastError || '' };
});

ipcMain.handle('recording:list', async (event) => {
    assertTrustedSender(event);
  const recDir = recordingsDirPath();
  try { fs.mkdirSync(recDir, { recursive: true }); } catch (_) {}
  let files = [];
  try {
    files = fs.readdirSync(recDir)
      .filter((f) => /\.(ts|mp4|mkv|webm)$/i.test(f))
      .map((f) => {
        const full = path.join(recDir, f);
        let stat = null;
        try { stat = fs.statSync(full); } catch (_) {}
        return { name: f, path: full, size: stat ? stat.size : 0, mtime: stat ? stat.mtimeMs : 0 };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) {}
  return files;
});

ipcMain.handle('recording:delete', async (event, filePath) => {
    assertTrustedSender(event);
  try {
    if (typeof filePath !== 'string' || !filePath) return { ok: false };
    const recDir = path.resolve(recordingsDirPath());
    const target = path.resolve(filePath);
    if (target !== recDir && !target.startsWith(recDir + path.sep)) return { ok: false, error: 'not allowed' };
    if (!/\.(ts|mp4|mkv|webm)$/i.test(target)) return { ok: false, error: 'invalid file' };
    fs.unlinkSync(target);
    return { ok: true };
  } catch (_) { return { ok: false }; }
});

};

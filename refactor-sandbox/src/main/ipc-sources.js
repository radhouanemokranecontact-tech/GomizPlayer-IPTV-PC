'use strict';
// ipc-sources — extracted IPC handlers.
module.exports = function register(deps) {
  const { ipcMain, ctx } = deps;
  const { assertTrustedSender, store, win, logEvent } = ctx;

  ipcMain.handle('sources:list', (event) => {
    assertTrustedSender(event);
    return store.sources().map((s) => {
      const cache = readCache('source-' + s.id);
      return Object.assign(publicSource(s), { count: cache ? cache.count : 0, fetchedAt: cache ? cache.fetchedAt : 0 });
    });
  });

  ipcMain.handle('sources:setPassword', async (event, id, password) => {
    assertTrustedSender(event);
    try {
      const src = store.sources().find((s) => s.id === id);
      if (!src || src.kind !== 'xtream') return { ok: false };
      const enc = await secrets.encryptSecret(String(password || ''));
      store.updateSource(id, { password: '', passwordEnc: enc, passwordEncV: 2 });
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('sources:account', async (event, id) => {
    assertTrustedSender(event);
    const source = store.sources().find((s) => s.id === id);
    if (!source || source.kind !== 'xtream') return { available: false };
    try {
      const s2 = await sourceForUse(source);
      const url = xtreamAccountUrl(s2.url, s2.username, s2.password);
      const { text } = await fetchText(url, source.headers, 64 * 1024, 20000);
      const json = JSON.parse(text);
      const info = json && json.user_info ? json.user_info : {};
      const exp = Number(info.exp_date || 0);
      return {
        available: true,
        expDate: exp > 0 ? exp : null,
        status: String(info.status || ''),
        maxConnections: info.max_connections != null ? Number(info.max_connections) : null,
        activeConnections: info.active_cons != null ? Number(info.active_cons) : null
      };
    } catch (err) {
      return { available: false, error: String((err && err.message) || err || 'unavailable') };
    }
  });

  ipcMain.handle('sources:add', async (event, input) => {
    assertTrustedSender(event);
    let prepared;
    try {
      prepared = await prepareSourceSecrets(input);
    } catch (err) {
      return { error: (err && (err.userMessage || err.message)) || 'Could not securely store credentials' };
    }
    const source = store.addSource(prepared);
    if (input.refresh !== false) {
      try {
        const data = await loadSource(source);
        store.updateSource(source.id, { count: data.count });
      } catch (err) {
        // Roll back the just-added source so the user isn't left with a dead/unusable entry in the list
        try { store.removeSource(source.id); } catch (_) {}
        return { error: String((err && err.message) || err || 'Could not load source') };
      }
    }
    const saved = store.sources().find((s) => s.id === source.id) || source;
    return { source: publicSource(saved) };
  });

  ipcMain.handle('sources:refresh', async (event, id) => {
    assertTrustedSender(event);
    const source = store.sources().find((s) => s.id === id);
    if (!source) throw new Error('Source not found');
    const data = await loadSource(source);
    store.updateSource(id, { count: data.count });
    return {
      id,
      count: data.count,
      fetchedAt: data.fetchedAt,
      groups: data.groups,
      items: data.items
    };
  });

  ipcMain.handle('sources:items', (event, id) => {
    assertTrustedSender(event);
    const cache = readCache('source-' + id);
    if (!cache) return null;
    return { id, count: cache.count, fetchedAt: cache.fetchedAt, groups: cache.groups, items: cache.items };
  });

  ipcMain.handle('sources:update', async (event, { id, patch }) => {
    assertTrustedSender(event);
    try {
      const prepared = await prepareSourceSecrets(patch || {});
      return publicSource(store.updateSource(id, prepared));
    } catch (err) {
      return { error: (err && (err.userMessage || err.message)) || 'Could not securely store credentials' };
    }
  });

  ipcMain.handle('sources:remove', (event, id) => {
    assertTrustedSender(event);
    try { fs.unlinkSync(cachePath('source-' + id)); } catch (_) {}
    return store.removeSource(id);
  });

  ipcMain.handle('net:fetchText', async (event, payload) => {
    assertTrustedSender(event);
    const url = payload && payload.url;
    const headers = (payload && payload.headers) || {};
    await assertSafeUrl(url, { blockLocalPrivate: true });
    const { text, finalUrl, bytes } = await fetchText(String(url), headers, MAX_PLAYLIST_BYTES, 45000, { blockLocalPrivate: true });
    return { text, finalUrl, bytes };
  });

  ipcMain.handle('dialog:openFile', async (event, kind) => {
    assertTrustedSender(event);
    const filters = kind === 'subtitle'
      ? [{ name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub'] }]
      : kind === 'epg'
        ? [{ name: 'XMLTV', extensions: ['xml', 'gz', 'xmltv'] }]
        : [{ name: 'Playlists', extensions: ['m3u', 'm3u8', 'txt'] }, { name: 'All files', extensions: ['*'] }];
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    await allowReadPath(file);
    return file;
  });

  ipcMain.handle('file:readText', async (event, payload) => {
    assertTrustedSender(event);
    const file = payload && payload.file;
    if (typeof file !== 'string' || !file.trim()) throw new Error('Invalid file');
    const real = await assertAllowedReadPath(file);
    const limit = Number(payload && payload.limit);
    const max = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20 * 1024 * 1024) : 10 * 1024 * 1024;
    const stat = await fsp.stat(real);
    if (!stat.isFile()) throw new Error('Not a file');
    if (stat.size > max) throw new Error('File too large');
    return fsp.readFile(real, 'utf8');
  });

  ipcMain.handle('file:readBuffer', async (event, payload) => {
    assertTrustedSender(event);
    const file = payload && payload.file;
    if (typeof file !== 'string' || !file.trim()) throw new Error('Invalid file');
    const real = await assertAllowedReadPath(file);
    const limit = Number(payload && payload.limit);
    const max = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20 * 1024 * 1024) : 10 * 1024 * 1024;
    const stat = await fsp.stat(real);
    if (!stat.isFile()) throw new Error('Not a file');
    if (stat.size > max) throw new Error('File too large');
    const buf = await fsp.readFile(real);
    return { data: buf.toString('base64'), size: buf.length };
  });

  ipcMain.handle('epg:list', (event) => { assertTrustedSender(event); return store.settings.epgUrls || []; });

  ipcMain.handle('epg:add', async (event, { url, name }) => {
    assertTrustedSender(event);
    const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
    const list = (store.settings.epgUrls || []).slice();
    list.push({ id, url, name: name || url });
    store.patchSettings({ epgUrls: list });
    try {
      const data = await refreshEpg(id, url);
      return { id, count: data.count };
    } catch (err) {
      return { id, error: err.message };
    }
  });

  ipcMain.handle('epg:refresh', async (event, id) => {
    assertTrustedSender(event);
    const entry = (store.settings.epgUrls || []).find((e) => e.id === id);
    if (!entry) throw new Error('EPG not found');
    return refreshEpg(id, entry.url);
  });

  ipcMain.handle('epg:remove', (event, id) => {
    assertTrustedSender(event);
    const list = (store.settings.epgUrls || []).filter((e) => e.id !== id);
    store.patchSettings({ epgUrls: list });
    try { fs.unlinkSync(cachePath('epg-' + id)); } catch (_) {}
    return list;
  });

  ipcMain.handle('epg:channels', (event, ids) => {
    assertTrustedSender(event);
    const wanted = new Set((ids || []).map(String));
    const out = {};
    const now = Date.now();
    for (const entry of store.settings.epgUrls || []) {
      const cache = readCache('epg-' + entry.id);
      if (!cache || !Array.isArray(cache.programmes)) continue;
      for (const p of cache.programmes) {
        const channel = String(p.channel || '');
        if (wanted.size && !wanted.has(channel)) continue;
        if (!out[channel]) out[channel] = [];
        if (p.stop && p.stop < now - 3600000) continue;
        if (p.start && p.start > now + 12 * 3600000) continue;
        out[channel].push(p);
      }
    }
    for (const channel of Object.keys(out)) {
      out[channel].sort((a, b) => (a.start || 0) - (b.start || 0));
      out[channel] = out[channel].slice(0, 24);
    }
    return out;
  });

};

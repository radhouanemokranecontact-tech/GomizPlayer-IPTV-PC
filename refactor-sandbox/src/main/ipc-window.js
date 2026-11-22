'use strict';
// ipc-window — extracted IPC handlers.
module.exports = function register(deps) {
  const { ipcMain, ctx } = deps;
  const { assertTrustedSender, store, win, logEvent } = ctx;

  ipcMain.handle('window:setAlwaysOnTop', async (event, on) => {
    assertTrustedSender(event);
    if (!win || win.isDestroyed()) return false;
    win.setAlwaysOnTop(!!on, 'floating');
    return win.isAlwaysOnTop();
  });

  ipcMain.handle('window:isAlwaysOnTop', async (event) => {
    assertTrustedSender(event);
    if (!win || win.isDestroyed()) return false;
    return win.isAlwaysOnTop();
  });

  ipcMain.handle('window:toggleFullScreen', async (event) => {
    assertTrustedSender(event);
    if (!win || win.isDestroyed()) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle('window:isFullScreen', async (event) => {
    assertTrustedSender(event);
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });

  ipcMain.handle('capture:saveScreenshot', async (event, payload) => {
    assertTrustedSender(event);
    try {
      const dataUrl = String(payload && payload.dataUrl || '');
      const name = safeName((payload && payload.name) || 'screenshot');
      const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!m) return { error: 'invalid data' };
      const buf = Buffer.from(m[1], 'base64');
      const customDl = String((store.settings && store.settings.downloadsDir) || '').trim();
      const dir = path.join(customDl || app.getPath('pictures'), 'GomizPlayer Screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, name + '_' + ts + '.png');
      if (!isPathInsideDir(file, dir)) return { error: 'invalid output path' };
      fs.writeFileSync(file, buf);
      return { ok: true, file };
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  });

};

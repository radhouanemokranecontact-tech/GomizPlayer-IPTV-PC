'use strict';
// ipc-updates — extracted IPC handlers.
module.exports = function register(deps) {
  const { ipcMain, ctx } = deps;
  const { assertTrustedSender, store, win, logEvent } = ctx;

  ipcMain.handle('update:status', (event) => { assertTrustedSender(event); return updateState; });

  ipcMain.handle('update:guard', (event) => {
    assertTrustedSender(event);
    try { return { ok: true, state: updateGuard ? updateGuard.getState() : null }; }
    catch (e) { return { ok: false }; }
  });

  ipcMain.handle('update:dismissRollback', (event) => {
    assertTrustedSender(event);
    try { if (updateGuard) updateGuard.dismissRollback(); return true; } catch (_) { return false; }
  });

  ipcMain.handle('update:snapshot', (event) => {
    assertTrustedSender(event);
    try {
      const backup = store && store.file ? store.file : path.join(app.getPath('userData'), 'gomizplayer.json');
      const saved = updateGuard ? updateGuard.snapshotBeforeUpdate(backup) : null;
      return { ok: !!saved, path: saved };
    } catch (e) { return { ok: false }; }
  });

  ipcMain.handle('update:check', async (event) => {
    assertTrustedSender(event);
    if (!autoUpdater) return { ok: false, reason: 'unavailable' };
    try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r && r.updateInfo && r.updateInfo.version || '' }; }
    catch (e) { sendUpdateStatus({ status: 'error', message: String(e && e.message || e) }); return { ok: false, reason: String(e && e.message || e) }; }
  });

  ipcMain.handle('update:install', (event) => {
    assertTrustedSender(event);
    if (!autoUpdater) return false;
    // Safety: snapshot app data before any update replaces the running version.
    try {
      const backup = store && store.file ? store.file : path.join(app.getPath('userData'), 'gomizplayer.json');
      if (updateGuard) updateGuard.snapshotBeforeUpdate(backup);
    } catch (_) {}
    try { autoUpdater.quitAndInstall(false, true); return true; } catch (_) { return false; }
  });

  ipcMain.handle('update:download', async (event) => {
    assertTrustedSender(event);
    if (!autoUpdater) return { ok: false, error: 'unavailable' };
    const v = await verifyUpdateManifest();
    if (!v.ok) {
      sendUpdateStatus({ status: 'error', message: '' });
      return { ok: false, error: 'manifest-verification-failed: ' + v.reason };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      sendUpdateStatus({ status: 'error', message: String(e && e.message || e) });
      return { ok: false, error: String(e && e.message || e) };
    }
  });

};

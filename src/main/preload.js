'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  info: () => invoke('app:info'),
  demoPath: () => invoke('app:demoPath'),

  settings: {
    get: () => invoke('settings:get'),
    patch: (patch) => invoke('settings:patch', patch)
  },

  sources: {
    list: () => invoke('sources:list'),
  account: (id) => invoke('sources:account', id),
    add: (input) => invoke('sources:add', input),
    update: (id, patch) => invoke('sources:update', { id, patch }),
    remove: (id) => invoke('sources:remove', id),
    refresh: (id) => invoke('sources:refresh', id),
    items: (id) => invoke('sources:items', id)
  },

  net: {
    fetchText: (url, headers) => invoke('net:fetchText', { url, headers })
  },

  dialog: {
    openFile: (kind) => invoke('dialog:openFile', kind)
  },

  backup: {
    export: () => invoke('app:exportBackup'),
    import: () => invoke('app:importBackup')
  },

  storage: {
    stats: () => invoke('app:storageStats'),
    clearCache: () => invoke('app:clearCache'),
    resetSettings: () => invoke('app:resetSettings')
  },

  app: {
    info: () => invoke('app:info'),
    demoPath: () => invoke('app:demoPath'),
    factoryReset: (payload) => invoke('app:factoryReset', payload)
  },

  diagnostics: {
    export: () => invoke('app:exportDiagnostics')
  },

  updates: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.removeListener('update:status', handler);
    }
  },

  files: {
    readText: (file, limit) => invoke('file:readText', { file, limit }),
    readBuffer: (file, limit) => invoke('file:readBuffer', { file, limit })
  },

  library: {
    get: (profile) => invoke('library:get', profile),
    favorite: (item, on, profile) => invoke('library:favorite', { profile, item, on }),
    history: (item, kind, profile) => invoke('library:history', { profile, item, kind }),
    progress: (key, position, duration, profile) => invoke('library:progress', { profile, key, position, duration }),
    search: (term, profile) => invoke('library:search', { profile, term }),
    clear: (what, profile) => invoke('library:clear', { profile, what })
  },

  profiles: {
    list: () => invoke('profiles:list'),
    create: (name) => invoke('profiles:create', name),
    delete: (name) => invoke('profiles:delete', name)
  },

  epg: {
    list: () => invoke('epg:list'),
    add: (url, name) => invoke('epg:add', { url, name }),
    refresh: (id) => invoke('epg:refresh', id),
    remove: (id) => invoke('epg:remove', id),
    channels: (ids) => invoke('epg:channels', ids)
  },

  downloads: {
    list: () => invoke('downloads:list'),
    add: (item) => invoke('downloads:add', item),
    pause: (id) => invoke('downloads:pause', id),
    resume: (id) => invoke('downloads:resume', id),
    remove: (id) => invoke('downloads:remove', id),
    open: (id) => invoke('downloads:open', id),
    onChanged: (cb) => {
      const handler = (_e, list) => cb(list);
      ipcRenderer.on('downloads:changed', handler);
      return () => ipcRenderer.removeListener('downloads:changed', handler);
    }
  },

  shell: {
    showItem: (file) => invoke('shell:showItem', file),
    openExternal: (url) => invoke('shell:openExternal', url)
  },

  clipboard: {
    writeText: (text) => invoke('clipboard:writeText', text)
  },

  appLock: {
    verify: (pin) => invoke('applock:verify', pin)
  },

  window: {
    setAlwaysOnTop: (on) => invoke('window:setAlwaysOnTop', on),
    isAlwaysOnTop: () => invoke('window:isAlwaysOnTop'),
    toggleFullScreen: () => invoke('window:toggleFullScreen'),
    isFullScreen: () => invoke('window:isFullScreen')
  },

  capture: {
    saveScreenshot: (dataUrl, name) => invoke('capture:saveScreenshot', { dataUrl, name })
  },

  recording: {
    start: (url, headers, name, key) => invoke('recording:start', { url, headers, name, key }),
    stop: () => invoke('recording:stop'),
    status: () => invoke('recording:status'),
    list: () => invoke('recording:list'),
    delete: (file) => invoke('recording:delete', file)
  }
});

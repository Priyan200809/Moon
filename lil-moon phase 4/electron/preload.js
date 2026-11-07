// Only fixed, argument-free commands are exposed. The main process validates the sender of each one.
const { contextBridge, ipcRenderer } = require('electron');

const cmd = (channel) => () => ipcRenderer.send(channel);

contextBridge.exposeInMainWorld(
  'lilMoon',
  Object.freeze({
    moon: Object.freeze({
      dragStart: cmd('moon:drag-start'),
      dragMove: cmd('moon:drag-move'),
      dragEnd: cmd('moon:drag-end'),
      openDashboard: cmd('dashboard:open'),
      showMenu: cmd('moon:menu'),
    }),
    dashboard: Object.freeze({
      minimize: cmd('dashboard:minimize'),
      close: cmd('dashboard:close'),
      toggleMaximize: cmd('dashboard:toggle-maximize'),
      exitApp: cmd('app:exit'),
      getSettings: () => ipcRenderer.invoke('settings:get'),
      saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
      // Phase 4: usage tracking. Fixed commands only; the main process validates every payload.
      getUsageSummary: () => ipcRenderer.invoke('usage:summary'),
      getTrackingSettings: () => ipcRenderer.invoke('tracking:get'),
      saveTrackingSettings: (settings) => ipcRenderer.invoke('tracking:save', settings),
      setAppExcluded: (exeName, excluded) => ipcRenderer.invoke('usage:exclude', { exeName, excluded }),
      deleteUsageHistory: () => ipcRenderer.invoke('usage:delete-history', { confirm: true }),
    }),
    getVersion: () => ipcRenderer.invoke('app:version'),
  })
);

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  priceStatus: () => ipcRenderer.invoke('prices:status'),
  refreshPrices: () => ipcRenderer.invoke('prices:refresh'),
  lookup: (username, profileId) => ipcRenderer.invoke('lookup', { username, profileId }),
  onPriceProgress: listen('prices:progress'),
  onPriceStatus: listen('prices:status'),
  onLookupProgress: listen('lookup:progress'),
});

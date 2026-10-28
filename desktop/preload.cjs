const { contextBridge, ipcRenderer } = require('electron');
const invoke = (action, data) => ipcRenderer.invoke('human-cli:command', { action, data });
contextBridge.exposeInMainWorld('humanCli', {
  bootstrap: () => invoke('bootstrap'),
  draft: (data) => invoke('draft', data), complete: (data) => invoke('complete', data),
  discardReply: (version) => invoke('discardReply', { version }),
  removeReplyNote: (id) => invoke('removeReplyNote', { id }),
  addImage: (data) => invoke('addImage', data), removeImage: (id) => invoke('removeImage', { id }),
  runTool: (id) => invoke('runTool', { id }), configureTool: (id, config) => invoke('configureTool', { id, config }),
  attachImage: (id) => invoke('attachImage', { id }), attachError: (id) => invoke('attachError', { id }), removeError: (id) => invoke('removeError', { id }),
  saveResult: (id) => invoke('saveResult', { id }), copyText: (text) => invoke('copyText', { text }),
  preferences: (data) => invoke('preferences', data), hide: () => invoke('hide'),
  resize: (data) => invoke('resize', data), showRequest: (id) => invoke('showRequest', { id }),
  openPlugins: () => invoke('openPlugins'),
  onState: (callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on('human-cli:state', listener); return () => ipcRenderer.removeListener('human-cli:state', listener); },
});

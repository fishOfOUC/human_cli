const { contextBridge, ipcRenderer } = require('electron');
const invoke = (action, data) => ipcRenderer.invoke('human-cli:command', { action, data });
contextBridge.exposeInMainWorld('humanCli', {
  bootstrap: () => invoke('bootstrap'),
  draft: (data) => invoke('draft', data), complete: (data) => invoke('complete', data),
  addImage: (data) => invoke('addImage', data), removeImage: (id) => invoke('removeImage', { id }),
  uploadAttachment: (data) => invoke('uploadAttachment', data),
  runTool: (id) => invoke('runTool', { id }), configureTool: (id, config) => invoke('configureTool', { id, config }),
  openConfigUi: (id, bounds) => invoke('openConfigUi', { id, bounds }), closeConfigUi: () => invoke('closeConfigUi'), configUiBounds: (id, bounds) => invoke('configUiBounds', { id, bounds }),
  attachImage: (id) => invoke('attachImage', { id }), attachError: (id) => invoke('attachError', { id }), removeError: (id) => invoke('removeError', { id }),
  saveResult: (id) => invoke('saveResult', { id }), copyText: (text) => invoke('copyText', { text }),
  preferences: (data) => invoke('preferences', data), hide: () => invoke('hide'), close: () => invoke('close'),
  beginResize: (edge, replyHeight) => invoke('beginResize', { edge, replyHeight }), resize: () => invoke('resize'), endResize: () => invoke('endResize'),
  onState: (callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on('human-cli:state', listener); return () => ipcRenderer.removeListener('human-cli:state', listener); },
  onCloseRequest: (callback) => { const listener = () => callback(); ipcRenderer.on('human-cli:close-request', listener); return () => ipcRenderer.removeListener('human-cli:close-request', listener); },
});

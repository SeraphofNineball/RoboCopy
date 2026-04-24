const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Custom file browser
  listDrives:  ()    => ipcRenderer.invoke('fs:listDrives'),
  readDir:     (p)   => ipcRenderer.invoke('fs:readDir', p),
  resolvePath: (p)   => ipcRenderer.invoke('fs:resolvePath', p),
  expandPath:  (p)   => ipcRenderer.invoke('fs:expandPath', p),  // expands %VAR% + resolves
  previewFile: (p)   => ipcRenderer.invoke('fs:previewFile', p), // returns preview data

  // Fallback native picker
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  // Robocopy
  runRobocopy:    (args) => ipcRenderer.invoke('robocopy:run', args),
  cancelRobocopy: ()     => ipcRenderer.invoke('robocopy:cancel'),

  // Stream output
  onOutput: (callback) => {
    const handler = (_event, line) => callback(line);
    ipcRenderer.on('robocopy:output', handler);
    return () => ipcRenderer.removeListener('robocopy:output', handler);
  },
});

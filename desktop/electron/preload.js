const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // 플랫폼 정보
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,

  // PDF 저장 경로 다이얼로그
  savePdfDialog: (defaultName) => ipcRenderer.invoke('save-pdf-dialog', defaultName),

  // 저장된 파일 열기
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  // 인쇄 실행
  printPage: (options) => ipcRenderer.invoke('print-page', options),
})

const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'
const WEB_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../../frontend/dist/index.html')}`

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../assets/icon.png'),
    title: '경안시장 집배송 관리시스템',
  })

  win.loadURL(WEB_URL)

  const menu = Menu.buildFromTemplate([
    {
      label: '파일',
      submenu: [
        { label: '새로고침', accelerator: 'F5', click: () => win.reload() },
        { type: 'separator' },
        { label: '종료', role: 'quit' },
      ],
    },
    {
      label: '인쇄',
      submenu: [
        { label: '현재 페이지 인쇄', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.print() },
      ],
    },
    {
      label: '도움말',
      submenu: [
        { label: '개발자 도구', accelerator: 'F12', click: () => win.webContents.openDevTools() },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.endsWith('.pdf')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

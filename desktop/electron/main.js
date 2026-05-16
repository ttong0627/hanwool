const { app, BrowserWindow, Menu, shell, Tray, dialog, ipcMain, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development'
const SERVER_URL = isDev ? 'http://localhost:5173' : 'http://34.64.146.168'

// 창 상태 저장 경로
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch (_) {}
  return { width: 1400, height: 900, x: undefined, y: undefined, maximized: false }
}

function saveWindowState(win) {
  try {
    const bounds = win.getBounds()
    const state = { ...bounds, maximized: win.isMaximized() }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state))
  } catch (_) {}
}

let mainWindow = null
let tray = null

function createWindow() {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1100,
    minHeight: 680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // 개발 편의 (배포 시 제거 불필요 — 사내망 전용)
    },
    icon: getIconPath(),
    title: '경안시장 집배송 관리시스템',
    show: false, // 로드 완료 후 표시
  })

  if (state.maximized) mainWindow.maximize()

  // 서버 연결 시도
  mainWindow.loadURL(SERVER_URL).catch(() => {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'))
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 창 상태 저장
  mainWindow.on('close', () => saveWindowState(mainWindow))
  mainWindow.on('resize', () => saveWindowState(mainWindow))
  mainWindow.on('move', () => saveWindowState(mainWindow))

  // PDF 링크는 별도 창 대신 시스템 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('.pdf') || url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 네비게이션 도중 외부 링크 차단
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL) && !url.startsWith('http://localhost')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  buildMenu()
}

function getIconPath() {
  const ico = path.join(__dirname, '../assets/icon.ico')
  const png = path.join(__dirname, '../assets/icon.png')
  if (fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return undefined
}

function buildMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        {
          label: '새로고침',
          accelerator: 'F5',
          click: () => mainWindow?.reload(),
        },
        {
          label: '서버 재연결',
          click: () => mainWindow?.loadURL(SERVER_URL),
        },
        { type: 'separator' },
        { label: '종료', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: '인쇄',
      submenu: [
        {
          label: '현재 페이지 인쇄',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.print({ silent: false, printBackground: true }),
        },
        {
          label: '라벨 인쇄 (배경색 포함)',
          click: () =>
            mainWindow?.webContents.print({
              silent: false,
              printBackground: true,
              pageSize: 'A4',
              margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
            }),
        },
        { type: 'separator' },
        {
          label: '페이지를 PDF로 저장',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: async () => {
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
              defaultPath: `export_${new Date().toISOString().slice(0, 10)}.pdf`,
              filters: [{ name: 'PDF', extensions: ['pdf'] }],
            })
            if (!filePath) return
            const data = await mainWindow.webContents.printToPDF({
              printBackground: true,
              pageSize: 'A4',
            })
            fs.writeFileSync(filePath, data)
            shell.showItemInFolder(filePath)
          },
        },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '확대', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '기본 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '전체 화면', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        { label: '개발자 도구', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        {
          label: '앱 정보',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '경안시장 집배송',
              message: '경안시장 집배송 관리시스템',
              detail: `버전: ${app.getVersion()}\n서버: ${SERVER_URL}\nElectron: ${process.versions.electron}`,
            }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createTray() {
  const iconPath = getIconPath()
  if (!iconPath) return

  try {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
    tray.setToolTip('경안시장 집배송 관리시스템')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '창 열기', click: () => mainWindow?.show() },
        { label: '새로고침', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: '종료', role: 'quit' },
      ])
    )
    tray.on('double-click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } catch (_) {}
}

// IPC: 렌더러에서 PDF 저장 경로 요청
ipcMain.handle('save-pdf-dialog', async (_, defaultName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  return filePath || null
})

// IPC: 파일 열기 (저장된 PDF)
ipcMain.handle('open-path', (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.openPath(filePath)
})

// IPC: 인쇄 실행
ipcMain.handle('print-page', (_, options = {}) => {
  mainWindow?.webContents.print({ printBackground: true, ...options })
})

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow?.show()
})

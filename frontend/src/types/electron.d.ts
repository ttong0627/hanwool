interface ElectronAPI {
  platform: string
  version: string
  isDesktop: boolean
  savePdfDialog: (defaultName?: string) => Promise<string | null>
  openPath: (filePath: string) => Promise<void>
  printPage: (options?: Record<string, unknown>) => Promise<void>
}

interface Window {
  electron?: ElectronAPI
}

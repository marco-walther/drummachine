declare global {
  interface Window {
    api: {
      platform: string
      setPopoutOnTop(frameName: string, onTop: boolean): void
    }
  }
}

export {}

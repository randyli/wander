const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    id: 'test-extension-id',
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    create: vi.fn(),
    captureVisibleTab: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  sidePanel: { open: vi.fn() },
}

vi.stubGlobal('chrome', chromeMock)

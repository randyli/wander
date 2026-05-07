export interface BaseStorage<D> {
  get: () => Promise<D>
  set: (value: D | ((prev: D) => D)) => Promise<void>
  subscribe: (listener: (value: D) => void) => () => void
  getSnapshot: () => D | null
}

export interface CreateStorageConfig<D> {
  liveUpdate?: boolean
}

function updateCache<D>(valueOrUpdate: D | ((prev: D) => D), cache: D | null): D {
  if (typeof valueOrUpdate === 'function') {
    return (valueOrUpdate as (prev: D) => D)(cache as D)
  }
  return valueOrUpdate
}

export function createStorage<D>(key: string, fallback: D, config?: CreateStorageConfig<D>): BaseStorage<D> {
  let cache: D | null = null
  let inited = false
  let listeners: Array<() => void> = []
  const liveUpdate = config?.liveUpdate ?? false

  const get = async (): Promise<D> => {
    const result = await chrome.storage.local.get(key)
    return (result[key] as D) ?? fallback
  }

  const emitChange = () => {
    listeners.forEach(fn => fn())
  }

  const set = async (valueOrUpdate: D | ((prev: D) => D)) => {
    if (!inited) {
      cache = await get()
      inited = true
    }
    cache = updateCache(valueOrUpdate, cache)
    await chrome.storage.local.set({ [key]: cache })
    emitChange()
  }

  const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener]
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }

  const getSnapshot = () => cache

  // Initialize cache
  get().then(data => {
    cache = data
    inited = true
    emitChange()
  })

  // Listen for live updates
  if (liveUpdate) {
    chrome.storage.local.onChanged.addListener(changes => {
      if (changes[key] === undefined) return
      const newValue = changes[key].newValue as D
      if (cache === newValue) return
      cache = newValue
      emitChange()
    })
  }

  return { get, set, subscribe, getSnapshot }
}

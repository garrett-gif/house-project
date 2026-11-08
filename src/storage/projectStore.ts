import type { SavedProject } from '../model/history'

/**
 * Where the project is kept between visits. One user, no login yet.
 * Async on purpose, so a Supabase-backed store can replace the browser one without changing callers.
 */
export interface ProjectStore {
  load(): Promise<unknown | null>
  save(project: SavedProject): Promise<void>
  clear(): Promise<void>
}

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Keeps the project in this browser's localStorage. Data stays on this device only. */
export function browserProjectStore(key = 'house-project:project:v1', storage: KeyValue | undefined = globalThis.localStorage): ProjectStore {
  return {
    async load() {
      const text = storage?.getItem(key)
      if (!text) return null
      try { return JSON.parse(text) as unknown } catch { return null }
    },
    async save(project) {
      if (!storage) throw new Error('Browser storage is not available.')
      storage.setItem(key, JSON.stringify(project))
    },
    async clear() { storage?.removeItem(key) },
  }
}

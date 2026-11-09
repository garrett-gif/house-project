import type { SavedProject } from '../model/history'

/**
 * Where the project is kept between visits. One user, no login yet.
 * Async on purpose, so a Supabase-backed store can replace the browser one without changing callers.
 */
export interface ProjectStore {
  load(): Promise<unknown | null>
  save(project: SavedProject): Promise<void>
  /** The chat transcript, kept separately so a project file stays just the design and its revisions. */
  loadChat(): Promise<unknown | null>
  saveChat(turns: unknown[]): Promise<void>
  clear(): Promise<void>
}

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Keeps the project in this browser's localStorage. Data stays on this device only. */
export function browserProjectStore(key = 'house-project:project:v1', storage: KeyValue | undefined = globalThis.localStorage): ProjectStore {
  const chatKey = `${key}:chat`
  const read = (k: string) => {
    const text = storage?.getItem(k)
    if (!text) return null
    try { return JSON.parse(text) as unknown } catch { return null }
  }
  const write = (k: string, value: unknown) => {
    if (!storage) throw new Error('Browser storage is not available.')
    storage.setItem(k, JSON.stringify(value))
  }
  return {
    async load() { return read(key) },
    async save(project) { write(key, project) },
    async loadChat() { return read(chatKey) },
    async saveChat(turns) { write(chatKey, turns.slice(-200)) },
    async clear() { storage?.removeItem(key); storage?.removeItem(chatKey) },
  }
}

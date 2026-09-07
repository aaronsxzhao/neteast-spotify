import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS } from './config.js'

const DATA_DIR = path.resolve('.data')
const STATE_PATH = path.join(DATA_DIR, 'state.json')
const TEMP_PATH = path.join(DATA_DIR, 'state.tmp.json')

const EMPTY_STATE = {
  settings: DEFAULT_SETTINGS,
  spotify: {},
  sync: { history: [] },
}

export class Store {
  #state = structuredClone(EMPTY_STATE)

  async load() {
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
    try {
      const saved = JSON.parse(await readFile(STATE_PATH, 'utf8'))
      this.#state = {
        ...structuredClone(EMPTY_STATE),
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        spotify: { ...(saved.spotify || {}) },
        sync: { history: [], ...(saved.sync || {}) },
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await this.save()
    }
    return this.#state
  }

  get state() {
    return this.#state
  }

  async update(mutator) {
    await mutator(this.#state)
    await this.save()
    return this.#state
  }

  async save() {
    const body = `${JSON.stringify(this.#state, null, 2)}\n`
    await writeFile(TEMP_PATH, body, { mode: 0o600 })
    await rename(TEMP_PATH, STATE_PATH)
    await chmod(STATE_PATH, 0o600)
  }
}

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS } from './config.js'

const EMPTY_STATE = {
  settings: DEFAULT_SETTINGS,
  spotify: {},
  sync: { history: [] },
}

export class Store {
  #state = structuredClone(EMPTY_STATE)

  constructor({ directory = process.env.DAILY_RELAY_DATA_DIR || path.resolve('.data') } = {}) {
    this.directory = path.resolve(directory)
    this.statePath = path.join(this.directory, 'state.json')
    this.tempPath = path.join(this.directory, 'state.tmp.json')
  }

  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    try {
      const saved = JSON.parse(await readFile(this.statePath, 'utf8'))
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
    await writeFile(this.tempPath, body, { mode: 0o600 })
    await rename(this.tempPath, this.statePath)
    await chmod(this.statePath, 0o600)
  }
}

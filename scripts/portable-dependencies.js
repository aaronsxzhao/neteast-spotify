import { cp, readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'

export async function copyPortableDependencies(source, destination) {
  // pnpm resolves transitive dependencies from the real .pnpm package path.
  // Dereferencing the top-level links loses that resolution context.
  await cp(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true,
    filter: file => path.basename(file) !== '.bin' })
  const root = await realpath(destination)
  async function audit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        if (path.isAbsolute(await readlink(file))) throw new Error(`Absolute dependency symlink: ${file}`)
        const target = await realpath(file)
        if (!target.startsWith(root + path.sep)) throw new Error(`Dependency escapes bundle: ${file}`)
      } else if (entry.isDirectory()) await audit(file)
    }
  }
  await audit(root)
}

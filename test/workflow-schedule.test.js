import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('whole-hour morning checks and quarter-hour recovery use the same schedule discriminator', async () => {
  const text = await readFile(new URL('../.github/workflows/daily-sync.yml', import.meta.url), 'utf8')
  assert.match(text, /cron: '0 0,1,2 \* \* \*'/)
  assert.match(text, /cron: '5,20,35,50 \* \* \* \*'/)
  assert.match(text, /RECOVERY_ONLY:.*github.event.schedule == '5,20,35,50 \* \* \* \*'/)
  assert.match(text, /cancel-in-progress: false/)
})

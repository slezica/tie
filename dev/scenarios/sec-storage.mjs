// Content storage never reaches disk: the shell (and every content frame) runs on an in-memory
// session. An html page writes localStorage, IndexedDB and Cache Storage; the instance's Electron
// profile never holds the marker (scanned after the writes had time to flush and after the tile
// closed); a reopened file starts empty.
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { userDataPath } from '../lib.mjs'

// Every file under `dir` containing `marker` (ASCII / Latin-1 or UTF-16LE).
function holders(dir, marker) {
  const needles = [Buffer.from(marker, 'latin1'), Buffer.from(marker, 'utf16le')]
  const out = []
  const walk = (d) => {
    let names = []
    try {
      names = readdirSync(d)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(d, n)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p)
      else if (st.isFile() && st.size < 64 * 1024 * 1024) {
        let buf
        try {
          buf = readFileSync(p)
        } catch {
          continue
        }
        if (needles.some((x) => buf.includes(x))) out.push(p.slice(dir.length + 1))
      }
    }
  }
  walk(dir)
  return out
}

export const settings = { htmlScripts: true } // the page's script writes the storage

export default async (ctx, h) => {
  const dir = join(process.cwd(), 'tmp', `sec-storage-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const marker = `tie-storage-marker-${process.pid}-${Date.now()}`
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>store</title><body><script>
window.before = localStorage.getItem('k')
window.stored = (async () => {
  localStorage.setItem('k', ${JSON.stringify(marker)})
  await new Promise((ok, ko) => {
    const r = indexedDB.open('db', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('s')
    r.onerror = ko
    r.onsuccess = () => {
      const tx = r.result.transaction('s', 'readwrite')
      tx.objectStore('s').put(${JSON.stringify(marker)}, 'k')
      tx.oncomplete = ok
      tx.onerror = ko
    }
  })
  try {
    const c = await caches.open('c')
    await c.put('/x', new Response(${JSON.stringify(marker)}))
  } catch (e) {}
  return true
})()
</script>`,
  )
  try {
    const profile = userDataPath(ctx.instance)
    const [t0] = (await h.list(ctx)).tiles.map((t) => t.id)
    const id = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const f = await h.htmlFrame(ctx, id)
    h.assert(await f.evaluate(() => window.stored), 'page stored the marker')
    h.assert((await f.evaluate(() => localStorage.getItem('k'))) === marker, 'storage works in the page')
    // Chromium commits localStorage in batches (seconds); IndexedDB on transaction commit.
    let found = []
    for (let i = 0; i < 8 && !found.length; i++) {
      await ctx.sleep(1000)
      found = holders(profile, marker)
    }
    h.assert(!found.length, `content storage on disk (open): ${found.join(', ')}`)
    await ctx.tie('close', id)
    await ctx.sleep(2000)
    found = holders(profile, marker)
    h.assert(!found.length, `content storage on disk (closed): ${found.join(', ')}`)

    // Reopened: a new token, empty storage.
    const id2 = (await ctx.tie('open', join(dir, 'index.html'), '--at', t0, '--side', 'r')).id
    const f2 = await h.htmlFrame(ctx, id2)
    const fresh = await f2.evaluate(() => window.before === null)
    h.assert(fresh, 'reopened file starts with empty storage')
    return { profile, scanned: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

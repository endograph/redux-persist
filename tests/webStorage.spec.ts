/* eslint-disable @typescript-eslint/no-explicit-any */
// redux-persist/lib/storage on the server, in the browser, and in browsers
// where storage is blocked. Serial: these swap globalThis.window.
import test from 'ava'

import createWebStorage from '../src/storage/createWebStorage'

const g = globalThis as any

const createLocalStorage = () => {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value },
    removeItem: (key: string) => { delete data[key] },
  }
}

const withWindow = async (win: any, fn: () => Promise<void>) => {
  const had = 'window' in g
  const previous = g.window
  if (win === undefined) delete g.window
  else g.window = win
  try { await fn() } finally {
    if (had) g.window = previous
    else delete g.window
  }
}

const captureConsole = () => {
  const calls: string[] = []
  const { warn, error } = console
  console.warn = (...args: any[]) => { calls.push(`warn: ${args[0]}`) }
  console.error = (...args: any[]) => { calls.push(`error: ${args[0]}`) }
  return { calls, restore: () => { console.warn = warn; console.error = error } }
}

test.serial('on the server it silently stores nothing', async t => {
  const { calls, restore } = captureConsole()
  try {
    await withWindow(undefined, async () => {
      const storage = createWebStorage('local')
      await storage.setItem('persist:root', '{}')
      t.is(await storage.getItem('persist:root'), undefined)
      await storage.removeItem('persist:root')
    })
  } finally {
    restore()
  }
  t.deepEqual(calls, [])
})

test.serial('on the server it ignores a global localStorage (Node 25+)', async t => {
  const serverWide = createLocalStorage()
  g.localStorage = serverWide
  try {
    await withWindow(undefined, async () => {
      await createWebStorage('local').setItem('persist:root', '{"user":"a"}')
    })
  } finally {
    delete g.localStorage
  }
  t.deepEqual(serverWide.data, {})
})

test.serial('in the browser it uses window.localStorage and window.sessionStorage', async t => {
  const localStorage = createLocalStorage()
  const sessionStorage = createLocalStorage()
  await withWindow({ localStorage, sessionStorage }, async () => {
    await createWebStorage('local').setItem('persist:root', 'L')
    await createWebStorage('session').setItem('persist:root', 'S')
    t.is(await createWebStorage('local').getItem('persist:root'), 'L')
  })
  t.deepEqual(localStorage.data, { 'persist:root': 'L' })
  t.deepEqual(sessionStorage.data, { 'persist:root': 'S' })
})

test.serial('it does not touch storage until first used', async t => {
  let accessed = 0
  const win = { get localStorage() { accessed++; return createLocalStorage() } }
  await withWindow(win, async () => {
    const storage = createWebStorage('local')
    t.is(accessed, 0)
    await storage.getItem('persist:root')
    await storage.getItem('persist:root')
    t.is(accessed, 1)
  })
})

test.serial('when the browser blocks storage it warns once and stores nothing', async t => {
  const blocked = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('SecurityError') },
    removeItem: () => { throw new Error('SecurityError') },
  }
  const { calls, restore } = captureConsole()
  try {
    await withWindow({ localStorage: blocked }, async () => {
      const storage = createWebStorage('local')
      await storage.setItem('persist:root', '{}')
      t.is(await storage.getItem('persist:root'), undefined)
    })
  } finally {
    restore()
  }
  t.is(calls.length, 1)
  t.regex(calls[0], /^warn: redux-persist: localStorage is not available/)
})

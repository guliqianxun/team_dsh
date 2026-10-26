/** Check the packaged browser factory and task RPC through DSH's actual Gateway. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { installConnection } from '@deepseek-ai/dsh-client-connection/client'
import Typert from '@deepseek-ai/dsh-typert-registry'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as host from '../lib/index.js'

const require = createRequire(import.meta.url)
const registrations = []
runInNewContext(await readFile('lib/client.js', 'utf8'), {
  window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
})
assert.equal(registrations.length, 1)
assert.equal(registrations[0].id, 'team-dsh')
const shared = new Set(['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'])
const client = registrations[0].factory(specifier => {
  assert(shared.has(specifier), `Unexpected browser dependency: ${specifier}`)
  return specifier === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(specifier)
})
assert.equal(client.name, 'team-dsh')
assert.equal(typeof client.apply, 'function')
const root = await mkdtemp(join(tmpdir(), 'team-dsh-build-'))
const ctx = new Context(), browser = new Context()
try {
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(Typert)
  await ctx.plugin(RemoteAccess)
  await ctx.plugin(Gateway)
  await ctx.plugin(scope => { new HostConnectionService(scope, [], {}) })
  const plugin = await ctx.plugin(host)
  const handler = ctx.connection.createSharedFetchHandler('/api')
  installConnection(browser, { transport: { fetch: (path, init) => handler.fetch(
    new Request(new URL(path, 'http://127.0.0.1'), init), ctx.connection.browserPeer) } })
  const call = async request => {
    const response = await browser.connection.rpc.call('/api', 'teamDshTaskApi/request', { args: { request } })
    assert.equal(response.ok, true)
    return response.value
  }
  const empty = await call({ kind: 'list' })
  assert.equal(empty.ok, true)
  assert.deepEqual(empty.value, { kind: 'list', tasks: [] })
  const { storageId } = empty
  const input = { kind: 'create', storageId, requestId: 'build-task', text: 'Check the task list' }
  const created = await call(input)
  assert.equal(created.ok, true)
  const task = created.value.task
  assert.equal(task.title, input.text)
  assert.equal(task.done, false)
  assert.equal(task.sessionId, null)
  assert.deepEqual(await call(input), created)
  const finished = await call({ kind: 'set-done', storageId, taskId: task.taskId, done: true })
  assert.equal(finished.value.task.done, true)
  assert.equal((await call({ kind: 'open', storageId, taskId: task.taskId })).ok, false)
  await plugin.dispose()
  assert.equal(ctx.get('teamDshTaskApi'), undefined)
  await ctx.plugin(host)
  assert.deepEqual((await call({ kind: 'list' })).value.tasks, [finished.value.task])
} finally {
  try { await browser.fiber.dispose() } finally {
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
}
console.log('Built browser module and task Gateway: passed')

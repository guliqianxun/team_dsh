var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/tasks/store.ts
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { brandString as brandString2 } from "@deepseek-ai/dsh-brand";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z as z2 } from "zod";

// src/shared/task.ts
import { brandString } from "@deepseek-ai/dsh-brand";
import { z } from "zod";
var taskIdSchema = z.string().min(1).transform(brandString);
var taskStorageIdSchema = z.string().min(1).transform(brandString);
var sessionIdSchema = z.string().min(1).transform(brandString);
var taskSchema = z.strictObject({
  taskId: taskIdSchema,
  title: z.string().min(1),
  done: z.boolean(),
  sessionId: sessionIdSchema.nullable()
});
var taskApiRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("list") }),
  z.strictObject({
    kind: z.literal("create"),
    storageId: taskStorageIdSchema,
    requestId: z.string().min(1),
    text: z.string().trim().min(1)
  }),
  z.strictObject({
    kind: z.literal("set-done"),
    storageId: taskStorageIdSchema,
    taskId: taskIdSchema,
    done: z.boolean()
  }),
  z.strictObject({ kind: z.literal("open"), storageId: taskStorageIdSchema, taskId: taskIdSchema })
]);
var taskErrorCodeSchema = z.enum([
  "forbidden",
  "closed",
  "cancelled",
  "invalid-request",
  "wrong-storage",
  "task-not-found",
  "request-conflict",
  "storage-unavailable",
  "session-unavailable",
  "session-missing",
  "legacy-pending"
]);
var taskApiResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    storageId: taskStorageIdSchema,
    value: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("list"), tasks: z.array(taskSchema) }),
      z.strictObject({ kind: z.literal("task"), task: taskSchema })
    ])
  }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: taskErrorCodeSchema }) })
]);

// src/tasks/store.ts
var bindingSchema = z2.looseObject({
  sessionId: sessionIdSchema,
  cwd: z2.string().min(1),
  state: z2.enum(["reserved", "created", "ready"]),
  mode: z2.literal("native").optional()
});
var storedTaskSchema = z2.looseObject({
  taskId: taskIdSchema,
  title: z2.string().min(1),
  status: z2.enum(["todo", "in_progress", "done"]),
  creationRequestId: z2.string().min(1),
  creationText: z2.string().optional(),
  goal: z2.string().optional(),
  statusRevision: z2.number().int().nonnegative().optional(),
  mainSession: bindingSchema.nullable().optional()
});
var taskDomainSpec = defineDomain({
  name: "team_dsh_tasks",
  version: 1,
  layout: "single",
  global: { schema: z2.looseObject({ storageId: taskStorageIdSchema.nullable() }), initial: { storageId: null } },
  tables: {
    tasks: domainTable(storedTaskSchema),
    executions: domainTable(z2.json()),
    reviews: domainTable(z2.json())
  }
});
var TaskStoreError = class extends Error {
  /** @param code - Public failure category. @param cause - Host-only diagnostic cause. */
  constructor(code, cause) {
    super(`Task operation: ${code}`, cause === void 0 ? void 0 : { cause });
    this.code = code;
    this.name = "TaskStoreError";
  }
};
var TaskStore = class _TaskStore {
  constructor(domain, storageId, requests) {
    this.domain = domain;
    this.storageId = storageId;
    this.requests = requests;
  }
  chain = Promise.resolve();
  closing = false;
  failure;
  disposal;
  /** @param ctx - Host with storageDomain. @returns Open store; its owner must close it after consumers drain. */
  static async open(ctx) {
    const domain = await ctx.storageDomain.open(taskDomainSpec);
    try {
      const requests = /* @__PURE__ */ new Map();
      const sessions = /* @__PURE__ */ new Set();
      for (const [key, task] of domain.table("tasks").entries()) {
        const binding = task.mainSession;
        if (key !== task.taskId || requests.has(task.creationRequestId) || binding != null && (!isAbsolute(binding.cwd) || sessions.has(binding.sessionId))) {
          throw new TaskStoreError("storage-unavailable");
        }
        requests.set(task.creationRequestId, key);
        if (binding != null) sessions.add(binding.sessionId);
      }
      let storageId = domain.global.get().storageId;
      if (storageId === null) {
        storageId = brandString2(randomUUID());
        await domain.global.set({ ...domain.global.get(), storageId });
      }
      return new _TaskStore(domain, storageId, requests);
    } catch (error) {
      try {
        await domain.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], "Task storage could not open or close.");
      }
      throw error;
    }
  }
  /** @returns Saved tasks without execution state or inferred completion. */
  list() {
    this.assertReadable();
    return [...this.domain.table("tasks").entries()].map(([, task]) => this.present(task));
  }
  /** @param taskId - Saved task identity. @returns Detached retained fields for Session binding. */
  get(taskId) {
    this.assertReadable();
    return structuredClone(this.require(taskId));
  }
  /** @param requestId - Stable creation intent. @param text - Normalized task name. @returns Original or newly saved task. */
  create(requestId, text) {
    return this.enqueue(async () => {
      const existingId = this.requests.get(requestId);
      if (existingId !== void 0) {
        const existing = this.require(existingId);
        if ((existing.creationText ?? existing.goal ?? existing.title) !== text) throw new TaskStoreError("request-conflict");
        return this.present(existing);
      }
      const task = {
        taskId: brandString2(randomUUID()),
        title: text,
        status: "todo",
        statusRevision: 0,
        mainSession: null,
        creationRequestId: requestId,
        creationText: text,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.persist(task);
      this.requests.set(requestId, task.taskId);
      return this.present(task);
    });
  }
  /** @param taskId - Task selected by the user. @param done - Explicit completion choice. @returns Acknowledged task state. */
  setDone(taskId, done) {
    return this.enqueue(async () => {
      const task = this.require(taskId);
      if (task.status === "done" === done) return this.present(task);
      const revision = task.statusRevision ?? 0;
      if (revision >= Number.MAX_SAFE_INTEGER) throw new TaskStoreError("storage-unavailable");
      const updated = { ...task, status: done ? "done" : "todo", statusRevision: revision + 1 };
      await this.persist(updated);
      return this.present(updated);
    });
  }
  /** @param taskId - Task to open. @param cwd - Directory for an empty new Session. @returns Fixed saved binding, before Session creation. */
  reserve(taskId, cwd) {
    return this.enqueue(async () => {
      const task = this.require(taskId);
      if (task.mainSession != null) return structuredClone(task.mainSession);
      if (!isAbsolute(cwd)) throw new TaskStoreError("session-unavailable");
      const binding = { mode: "native", sessionId: brandString2(randomUUID()), cwd, state: "reserved" };
      await this.persist({ ...task, mainSession: binding });
      return structuredClone(binding);
    });
  }
  /** @param taskId - Owner of the reserved Session. @param sessionId - Identity whose persistence was confirmed. @returns Task with its ready binding. */
  ready(taskId, sessionId) {
    return this.enqueue(async () => {
      const task = this.require(taskId);
      const binding = task.mainSession;
      if (binding == null || binding.sessionId !== sessionId) throw new TaskStoreError("session-unavailable");
      if (binding.state === "ready") return this.present(task);
      if (binding.mode !== "native") throw new TaskStoreError("legacy-pending");
      const updated = { ...task, mainSession: { ...binding, state: "ready" } };
      await this.persist(updated);
      return this.present(updated);
    });
  }
  /** Stop admission, drain writes, then release the domain. @returns Shared close completion. */
  close() {
    this.closing = true;
    return this.disposal ??= this.chain.then(() => this.domain.close());
  }
  /** @param task - Saved record. @returns Only fields used by the task panel. */
  present(task) {
    return { taskId: task.taskId, title: task.title, done: task.status === "done", sessionId: task.mainSession?.sessionId ?? null };
  }
  require(taskId) {
    const task = this.domain.table("tasks").get(taskId);
    if (task === void 0) throw new TaskStoreError("task-not-found");
    return task;
  }
  assertReadable() {
    if (this.closing) throw new TaskStoreError("closed");
    if (this.failure !== void 0) throw this.failure;
  }
  enqueue(run) {
    try {
      this.assertReadable();
    } catch (error) {
      return Promise.reject(error);
    }
    const result = this.chain.then(() => {
      if (this.failure !== void 0) throw this.failure;
      return run();
    });
    this.chain = result.then(() => {
    }, () => {
    });
    return result;
  }
  async persist(task) {
    try {
      await this.domain.table("tasks").put(task.taskId, task);
    } catch (error) {
      this.failure = new TaskStoreError("storage-unavailable", error);
      throw this.failure;
    }
  }
};

// src/tasks/api.ts
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote, Remote } from "@deepseek-ai/dsh-typert-protocol";
var _request_dec, _a, _init;
_a = Service.tracker, _request_dec = [Remote];
var TaskApi = class {
  /** @param ctx - Host invocation context. @param store - Retained task storage. */
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
    __runInitializers(_init, 5, this);
    __publicField(this, _a, { associate: "teamDshTaskApi", property: "ctx" });
    __publicField(this, "typertRemote", bindTypertRemote(this, "teamDshTaskApi"));
    __publicField(this, "active", /* @__PURE__ */ new Set());
    __publicField(this, "closing", false);
    __publicField(this, "disposal");
  }
  request(request, signal) {
    if (this.ctx.invocation?.peer.principal.kind !== "owner") return Promise.resolve({ ok: false, error: { code: "forbidden" } });
    if (this.closing) return Promise.resolve({ ok: false, error: { code: "closed" } });
    if (signal.aborted) return Promise.resolve({ ok: false, error: { code: "cancelled" } });
    const parsed = taskApiRequestSchema.safeParse(request);
    if (!parsed.success) return Promise.resolve({ ok: false, error: { code: "invalid-request" } });
    if (parsed.data.kind !== "list" && parsed.data.storageId !== this.store.storageId) return Promise.resolve({ ok: false, error: { code: "wrong-storage" } });
    const result = this.perform(parsed.data);
    this.active.add(result);
    void result.then(() => this.active.delete(result), () => this.active.delete(result));
    return result;
  }
  /** Refuse new requests and drain admitted work. @returns Shared drain completion. */
  close() {
    this.closing = true;
    return this.disposal ??= Promise.allSettled([...this.active]).then(() => {
    });
  }
  async perform(request) {
    try {
      const storageId = this.store.storageId;
      switch (request.kind) {
        case "list":
          return { ok: true, storageId, value: { kind: "list", tasks: this.store.list() } };
        case "create":
          return { ok: true, storageId, value: { kind: "task", task: await this.store.create(request.requestId, request.text) } };
        case "set-done":
          return { ok: true, storageId, value: { kind: "task", task: await this.store.setDone(request.taskId, request.done) } };
        case "open": {
          const conversations = this.ctx.get("teamDshTaskConversations");
          if (conversations === void 0) throw new TaskStoreError("session-unavailable");
          return { ok: true, storageId, value: { kind: "task", task: await conversations.open(request.taskId) } };
        }
      }
    } catch (error) {
      if (error instanceof TaskStoreError) return { ok: false, error: { code: error.code } };
      this.ctx.logger.error("Task operation failed.", error);
      return { ok: false, error: { code: "storage-unavailable" } };
    }
  }
};
_init = __decoratorStart(null);
__decorateElement(_init, 1, "request", _request_dec, TaskApi);
__decoratorMetadata(_init, TaskApi);
__publicField(TaskApi, "remote", {
  package: "team-dsh/task-api",
  face: "host",
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [{
    id: "team-dsh/task-api#request",
    service: "teamDshTaskApi",
    namespace: "teamDshTaskApi",
    method: "request",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: { mode: "src-json" } }],
    cancellation: { parameter: "signal" },
    result: { mode: "src-json" }
  }]
});

// src/tasks/conversation.ts
import { Service as Service2 } from "@deepseek-ai/cordis";
var TaskConversations = class {
  /** @param ctx - Retained DSH Session services. @param store - Task storage retained until setup drains. */
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
    this.controller = ctx.get("sessionController");
    this.sessions = ctx.sessions;
    this.persistence = ctx.sessionPersistence;
    this.directory = ctx.workingDirectory.defaultDirectory;
  }
  [Service2.tracker] = { associate: "teamDshTaskConversations", property: "ctx" };
  closing = false;
  disposal;
  pending = /* @__PURE__ */ new Map();
  controller;
  sessions;
  persistence;
  directory;
  /** @param taskId - Task to open. @returns Task with the same ready Session, without calling prompt. */
  open(taskId) {
    if (this.closing) return Promise.reject(new TaskStoreError("closed"));
    const previous = this.pending.get(taskId);
    const result = (previous?.then(() => {
    }, () => {
    }) ?? Promise.resolve()).then(() => this.ensure(taskId));
    this.pending.set(taskId, result);
    const finished = () => {
      if (this.pending.get(taskId) === result) this.pending.delete(taskId);
    };
    void result.then(finished, finished);
    return result;
  }
  /** Stop new opens and retain dependencies until setup finishes. @returns Shared close completion. */
  close() {
    this.closing = true;
    return this.disposal ??= Promise.allSettled([...this.pending.values()]).then(() => {
    });
  }
  async ensure(taskId) {
    try {
      const binding = await this.store.reserve(taskId, this.directory);
      if (binding.mode !== "native" && binding.state !== "ready") throw new TaskStoreError("legacy-pending");
      const persisted = await this.persistence.stat(binding.sessionId);
      const live = this.sessions.get(binding.sessionId);
      if (persisted !== void 0) this.checkIdentity(binding, persisted.header);
      if (live !== void 0) this.checkIdentity(binding, live.header);
      if (binding.state === "ready") {
        if (persisted === void 0) throw new TaskStoreError("session-missing");
        return this.store.present(this.store.get(taskId));
      }
      if (!persisted && !live) {
        const created = await this.controller.create({ sessionId: binding.sessionId, cwd: binding.cwd });
        if (created.sessionId !== binding.sessionId) throw new TaskStoreError("session-unavailable");
      }
      const attached = this.sessions.get(binding.sessionId);
      if (attached !== void 0) {
        this.checkIdentity(binding, attached.header);
        if (!await this.sessions.flush(attached)) throw new TaskStoreError("session-unavailable");
      } else if (persisted === void 0) throw new TaskStoreError("session-unavailable");
      const confirmed = await this.persistence.stat(binding.sessionId);
      if (confirmed === void 0) throw new TaskStoreError("session-unavailable");
      this.checkIdentity(binding, confirmed.header);
      return await this.store.ready(taskId, binding.sessionId);
    } catch (error) {
      if (error instanceof TaskStoreError) throw error;
      throw new TaskStoreError("session-unavailable", error);
    }
  }
  checkIdentity(binding, header) {
    if (binding.sessionId !== header.id || binding.cwd !== header.cwd) throw new TaskStoreError("session-unavailable");
  }
};

// src/index.ts
var name = "team-dsh";
var inject = ["storageDomain", "typert"];
async function apply(ctx) {
  await ctx.effect(async function* () {
    const store = await TaskStore.open(ctx);
    const api = new TaskApi(ctx, store);
    const conversations = /* @__PURE__ */ new Set();
    let closing = false;
    const drain = async () => {
      closing = true;
      await Promise.all([api.close(), ...[...conversations].map((service) => service.close())]);
    };
    yield async () => {
      await drain();
      await store.close();
    };
    yield ctx.provide("teamDshTaskStore", store);
    yield ctx.typert.register(TaskApi.remote);
    yield ctx.provide("teamDshTaskApi", api);
    const scope = ctx.inject(["sessionController", "sessions", "sessionPersistence", "workingDirectory"], async (sessionCtx) => {
      if (closing) return;
      await sessionCtx.effect(function* () {
        const service = new TaskConversations(sessionCtx, store);
        conversations.add(service);
        yield sessionCtx.provide("teamDshTaskConversations", service);
        yield async () => {
          try {
            await service.close();
          } finally {
            conversations.delete(service);
          }
        };
      });
    });
    yield scope.dispose;
    yield drain;
  });
}
export {
  apply,
  inject,
  name
};

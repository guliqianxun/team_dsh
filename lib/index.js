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

// src/history/api.ts
import { Service as Service3 } from "@deepseek-ai/cordis";
import { bindTypertRemote as bindTypertRemote2, Remote as Remote2 } from "@deepseek-ai/dsh-typert-protocol";

// src/shared/history.ts
import { z as z3 } from "zod";
var count = z3.number().int().nonnegative();
var seq = count;
var historyRequestSchema = z3.strictObject({
  sourceIds: z3.array(sessionIdSchema).min(1).max(3).refine((ids) => new Set(ids).size === ids.length)
});
var toolCallSchema = z3.strictObject({
  callId: z3.string(),
  name: z3.string(),
  callSeq: seq,
  resultSeq: seq.nullable(),
  recoverySeq: seq.nullable(),
  explicitError: z3.boolean().nullable(),
  elapsedMs: z3.number().nonnegative().nullable()
});
var toolSummarySchema = z3.strictObject({
  name: z3.string(),
  calls: count,
  completed: count,
  explicitErrors: count,
  unfinished: count,
  measuredDurations: count,
  elapsedMs: z3.number().nonnegative().nullable()
});
var usageSchema = z3.strictObject({
  inputTokens: count,
  outputTokens: count,
  totalTokens: count.optional(),
  cacheReadTokens: count.optional(),
  cacheWriteTokens: count.optional(),
  reasoningTokens: count.optional()
});
var usageRecordSchema = z3.strictObject({
  seq,
  turn: count,
  step: count,
  kind: z3.enum(["assistant/message", "assistant/attempt"]),
  usage: usageSchema.nullable()
});
var bucketSchema = z3.strictObject({ knownSum: count.nullable(), reported: count, missing: count });
var usageTotalsSchema = z3.strictObject({
  inputTokens: bucketSchema,
  outputTokens: bucketSchema,
  totalTokens: bucketSchema,
  cacheReadTokens: bucketSchema,
  cacheWriteTokens: bucketSchema,
  reasoningTokens: bucketSchema
});
var historyAnalysisSchema = z3.strictObject({
  sessionId: sessionIdSchema,
  capturedThroughSeq: z3.number().int().min(-1),
  inheritedEventCount: count,
  tools: z3.array(toolSummarySchema),
  calls: z3.array(toolCallSchema),
  omittedCalls: count,
  unmatchedResults: count,
  recoveryResults: count,
  usage: z3.array(usageRecordSchema),
  omittedUsage: count,
  usageTotals: usageTotalsSchema,
  highlights: z3.strictObject({
    errors: z3.array(toolCallSchema).max(5),
    unfinished: z3.array(toolCallSchema).max(5),
    slowest: z3.array(toolCallSchema).max(5),
    largestUsage: z3.array(usageRecordSchema).max(5)
  })
});
var historyResultSchema = z3.discriminatedUnion("ok", [
  z3.strictObject({ ok: z3.literal(true), sources: z3.array(historyAnalysisSchema).min(1).max(3) }),
  z3.strictObject({ ok: z3.literal(false), error: z3.enum(["forbidden", "invalid-request", "closed", "cancelled", "unavailable"]) })
]);

// src/history/analyze.ts
import { lastAssistantStreamChunk } from "@deepseek-ai/dsh-llm";
import { TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN } from "@deepseek-ai/dsh-session";
var EVIDENCE_LIMIT = 100;
function largest(records, measure) {
  return records.flatMap((record, index) => {
    const value = measure(record);
    return value == null ? [] : [{ record, value, index }];
  }).sort((a, b) => b.value - a.value || a.index - b.index).slice(0, 5).map((item) => item.record);
}
function analyzeHistory(observation) {
  const calls = [];
  const pending = /* @__PURE__ */ new Map();
  const usage = [];
  let lastUsage;
  let unmatchedResults = 0, recoveryResults = 0;
  const key = (turn, step, callId) => JSON.stringify([turn, step, callId]);
  for (const event of observation.events) {
    switch (event.type) {
      case "tool/call": {
        const { turn, step, callId, name: name2 } = event.data;
        const identity = key(turn, step, callId);
        if (pending.has(identity)) throw new Error("Ambiguous tool call identity in selected Session");
        const fact = { callId, name: name2, callSeq: event.seq, resultSeq: null, recoverySeq: null, explicitError: null, elapsedMs: null };
        calls.push(fact);
        pending.set(identity, { fact, time: event.time });
        break;
      }
      case "tool/result": {
        if (event.surfaceOp !== "append") break;
        const { turn, step, message } = event.data;
        const identity = key(turn, step, message.toolCallId);
        const call = pending.get(identity);
        if (event.data.error?.code === TOOL_OUTCOME_UNKNOWN || event.data.error?.code === TOOL_NOT_STARTED) {
          recoveryResults++;
          if (call !== void 0) call.fact.recoverySeq = event.seq;
          break;
        }
        if (call === void 0) {
          unmatchedResults++;
          break;
        }
        call.fact.resultSeq = event.seq;
        call.fact.explicitError = message.isError === true;
        const elapsed = event.time - call.time;
        call.fact.elapsedMs = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
        pending.delete(identity);
        break;
      }
      case "llm/retry-started":
        if (lastUsage?.turn === event.data.turn && lastUsage.step === event.data.step) lastUsage = void 0;
        break;
      case "assistant/message":
      case "assistant/attempt": {
        const sample = (event.type === "assistant/message" ? event.data.usage : void 0) ?? lastAssistantStreamChunk(event.data.stream, "usage")?.usage;
        const { turn, step } = event.data;
        if (lastUsage?.turn === turn && lastUsage.step === step) {
          if (sample !== void 0 || lastUsage.usage === null) {
            Object.assign(lastUsage, { seq: event.seq, kind: event.type, usage: sample === void 0 ? null : { ...sample } });
          }
        } else {
          lastUsage = { seq: event.seq, turn, step, kind: event.type, usage: sample === void 0 ? null : { ...sample } };
          usage.push(lastUsage);
        }
        break;
      }
      default:
        break;
    }
  }
  const summaries = /* @__PURE__ */ new Map();
  for (const call of calls) {
    let summary = summaries.get(call.name);
    if (summary === void 0) {
      summary = { name: call.name, calls: 0, completed: 0, explicitErrors: 0, unfinished: 0, measuredDurations: 0, elapsedMs: null };
      summaries.set(call.name, summary);
    }
    summary.calls++;
    if (call.resultSeq === null) summary.unfinished++;
    else summary.completed++;
    if (call.explicitError === true) summary.explicitErrors++;
    if (call.elapsedMs !== null) {
      summary.measuredDurations++;
      summary.elapsedMs = (summary.elapsedMs ?? 0) + call.elapsedMs;
    }
  }
  const bucket = (field) => {
    let knownSum = null, reported = 0;
    for (const record of usage) {
      const value = record.usage?.[field];
      if (value !== void 0) {
        knownSum = (knownSum ?? 0) + value;
        reported++;
      }
    }
    return { knownSum, reported, missing: usage.length - reported };
  };
  return {
    sessionId: observation.header.id,
    capturedThroughSeq: observation.cursor,
    inheritedEventCount: observation.inheritedEventCount,
    tools: [...summaries.values()],
    calls: calls.slice(0, EVIDENCE_LIMIT),
    omittedCalls: Math.max(0, calls.length - EVIDENCE_LIMIT),
    unmatchedResults,
    recoveryResults,
    usage: usage.slice(0, EVIDENCE_LIMIT),
    omittedUsage: Math.max(0, usage.length - EVIDENCE_LIMIT),
    usageTotals: {
      inputTokens: bucket("inputTokens"),
      outputTokens: bucket("outputTokens"),
      totalTokens: bucket("totalTokens"),
      cacheReadTokens: bucket("cacheReadTokens"),
      cacheWriteTokens: bucket("cacheWriteTokens"),
      reasoningTokens: bucket("reasoningTokens")
    },
    highlights: {
      errors: calls.filter((call) => call.explicitError === true).slice(0, 5),
      unfinished: calls.filter((call) => call.resultSeq === null).slice(0, 5),
      slowest: largest(calls, (call) => call.elapsedMs),
      largestUsage: largest(usage, (record) => record.usage?.totalTokens)
    }
  };
}

// src/history/api.ts
var _analyze_dec, _a2, _init2;
_a2 = Service3.tracker, _analyze_dec = [Remote2];
var HistoryApi = class {
  /** @param ctx Scope retaining the native sessionQuery service throughout reads. */
  constructor(ctx) {
    this.ctx = ctx;
    __runInitializers(_init2, 5, this);
    __publicField(this, _a2, { associate: "teamDshHistoryApi", property: "ctx" });
    __publicField(this, "typertRemote", bindTypertRemote2(this, "teamDshHistoryApi"));
    __publicField(this, "active", /* @__PURE__ */ new Set());
    __publicField(this, "shutdown", new AbortController());
    __publicField(this, "disposal");
  }
  analyze(request, signal) {
    if (this.ctx.invocation?.peer.principal.kind !== "owner") return Promise.resolve({ ok: false, error: "forbidden" });
    if (this.shutdown.signal.aborted) return Promise.resolve({ ok: false, error: "closed" });
    if (signal.aborted) return Promise.resolve({ ok: false, error: "cancelled" });
    const parsed = historyRequestSchema.safeParse(request);
    if (!parsed.success) return Promise.resolve({ ok: false, error: "invalid-request" });
    const result = this.read(parsed.data.sourceIds, AbortSignal.any([signal, this.shutdown.signal]));
    this.active.add(result);
    void result.then(() => this.active.delete(result), () => this.active.delete(result));
    return result;
  }
  /** Cancel reads and wait for their leases before releasing the query dependency. */
  close() {
    this.shutdown.abort();
    return this.disposal ??= Promise.allSettled([...this.active]).then(() => {
    });
  }
  async read(sourceIds, signal) {
    try {
      const sources = [];
      for (const id of sourceIds) {
        signal.throwIfAborted();
        const observation = await this.ctx.sessionQuery.observeSession(id, { signal, projectionMode: "none" });
        const live = observation.source === "live";
        try {
          signal.throwIfAborted();
          if (observation.header.id !== id) throw new Error("Selected Session identity changed");
          if (live) sources.push(analyzeHistory(observation));
        } finally {
          observation[Symbol.dispose]();
        }
        if (!live) {
          signal.throwIfAborted();
          const handle = await this.ctx.sessionPersistence.open(id, "read", { signal });
          try {
            signal.throwIfAborted();
            if (handle.header.id !== id) throw new Error("Stored Session identity changed");
            const { events } = await handle.read(0, void 0, { signal });
            signal.throwIfAborted();
            sources.push(analyzeHistory({
              header: handle.header,
              inheritedEventCount: handle.inheritedEventCount,
              cursor: events.at(-1)?.seq ?? -1,
              events
            }));
          } finally {
            await handle.close();
          }
        }
      }
      signal.throwIfAborted();
      return { ok: true, sources };
    } catch (error) {
      if (signal.aborted) return { ok: false, error: "cancelled" };
      this.ctx.logger.error("Selected history could not be measured.", error);
      return { ok: false, error: "unavailable" };
    }
  }
};
_init2 = __decoratorStart(null);
__decorateElement(_init2, 1, "analyze", _analyze_dec, HistoryApi);
__decoratorMetadata(_init2, HistoryApi);
__publicField(HistoryApi, "remote", {
  package: "team-dsh/history-api",
  face: "host",
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [{
    id: "team-dsh/history-api#analyze",
    service: "teamDshHistoryApi",
    namespace: "teamDshHistoryApi",
    method: "analyze",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: { mode: "src-json" } }],
    cancellation: { parameter: "signal" },
    result: { mode: "src-json" }
  }]
});

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
    const historyScope = ctx.inject(["sessionQuery", "sessionPersistence"], async (queryCtx) => {
      await queryCtx.effect(function* () {
        const history = new HistoryApi(queryCtx);
        yield queryCtx.typert.register(HistoryApi.remote);
        yield queryCtx.provide("teamDshHistoryApi", history);
        yield () => history.close();
      });
    });
    yield historyScope.dispose;
    yield drain;
  });
}
export {
  apply,
  inject,
  name
};

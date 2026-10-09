/**
 * ============================================================================
 * 云端同步引擎 —— core/sync/index.js（第 7 阶段新增）
 * ----------------------------------------------------------------------------
 * 让 PC 端和手机端的学习数据互通：
 *
 *   · 任何学习操作（勾选任务、小测、反馈、扫题……本质是写 localStorage）
 *     完成后 1.2 秒内自动静默同步到云端（需求：延迟 ≤3 秒）
 *   · 弱网/断网：同步任务进入本地待传队列，恢复网络自动续传
 *   · 多端冲突：按"最后修改时间"自动保留最新版本（需求约定）
 *   · 未登录不同步：账号是数据的"隔间门牌号"（用户数据隔离）
 *
 * 同步哪些数据？
 *   所有 'fenti-' 开头的 localStorage 键（计划/金币/错题/日志……），
 *   排除：账号本身（fenti-account-v1，按设备保留登录态）、
 *         同步队列/元信息（fenti-sync-queue / fenti-sync-meta）。
 *   ——也就是说：零改动打通了全部旧功能，新功能只要用 fenti- 前缀存档，
 *     自动享受云同步，一行同步代码都不用写。
 *
 * 后端在哪？
 *   方式一（默认）：演示模式——"本地模拟云"（localStorage + BroadcastChannel），
 *     用于本地开发和验收同步逻辑；跨标签页可互相同步。
 *   方式二（部署）：设置环境变量 VITE_SYNC_ENDPOINT 指向 Vercel 云函数
 *    （参考实现见项目根目录 serverless/sync.js，免费额度可用），
 *     引擎自动切换为真实 HTTP 同步，页面代码零改动。
 * ============================================================================
 */
import { reactive, readonly } from 'vue'
import { useAccount } from '@/core/account'

/** 云端接口地址：空 = 演示模式（本地模拟云） */
const ENDPOINT = import.meta.env.VITE_SYNC_ENDPOINT || ''

/** 同步延迟目标：操作后 1.2 秒内触发推送（要求 ≤3 秒） */
const PUSH_DEBOUNCE = 1200
/** 离线重试的基础退避毫秒数 */
const RETRY_BASE = 3000

/** 不参与同步的键（账号按设备保留；队列/元信息仅本地） */
const EXCLUDE_KEYS = new Set(['fenti-account-v1', 'fenti-sync-queue', 'fenti-sync-meta'])

/** 待传队列的 localStorage 键 */
const QUEUE_KEY = 'fenti-sync-queue'
/** 每个键"本地最后修改时间"的元信息键（冲突判断的依据） */
const META_KEY = 'fenti-sync-meta'
/** 演示模式"云端"数据的键（真实模式走 Vercel，不用它） */
const MOCK_CLOUD_PREFIX = 'fenti-cloud-mock:'

/* ---------------- 同步状态（响应式，个人中心页展示用） ---------------- */

const state = reactive({
  /** idle 闲置 / syncing 同步中 / synced 已同步 / offline 离线待传 */
  status: 'idle',
  lastSyncAt: null,     // 最近一次成功同步时间（ISO 字符串）
  pendingCount: 0,      // 待传队列里的记录数
  /** 云端备份记录（最近 20 条，个人中心"备份记录"展示） */
  history: []
})

function logHistory(kind, detail) {
  state.history.unshift({ time: new Date().toISOString(), kind, detail })
  if (state.history.length > 20) state.history.length = 20
}

export function useSync() {
  return readonly(state)
}

/* ---------------- 工具函数 ---------------- */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

/** 列出所有应同步的键 */
function syncableKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('fenti-') && !EXCLUDE_KEYS.has(key) && !key.startsWith(MOCK_CLOUD_PREFIX)) {
      keys.push(key)
    }
  }
  return keys
}

/**
 * 合并冲突（纯函数，自测直接测它）：两端都有的键，保留 updatedAt 较新的一方。
 * @param {Object[]} local  本地记录 [{ key, value, updatedAt }]
 * @param {Object[]} remote 云端记录
 * @returns {{ merged: Object[], appliedRemote: Object[] }}
 *   merged        = 合并后的完整记录集
 *   appliedRemote = 本地需要采纳的云端记录（云端更新的部分）
 */
export function mergeRecords(local, remote) {
  const map = new Map()
  for (const record of local) map.set(record.key, record)
  const appliedRemote = []
  for (const record of remote) {
    const localRecord = map.get(record.key)
    if (!localRecord || record.updatedAt > localRecord.updatedAt) {
      map.set(record.key, record)
      appliedRemote.push(record)
    }
  }
  return { merged: [...map.values()], appliedRemote }
}

/* ---------------- 监控本机数据变化（打补丁，不动业务代码） ---------------- */

/**
 * 给 localStorage.setItem / removeItem 打补丁：
 * 任何模块写入学习数据后，同步引擎都能立刻知道（无需业务方主动通知）。
 * 应用云端数据时设置 __fentiSyncApplying 标记，避免"回写→又触发同步"的死循环。
 */
let patched = false
function patchStorage() {
  if (patched) return
  patched = true

  const originalSet = Storage.prototype.setItem
  const originalRemove = Storage.prototype.removeItem

  Storage.prototype.setItem = function (key, value) {
    originalSet.call(this, key, value)
    onLocalWrite(key)
  }
  Storage.prototype.removeItem = function (key) {
    originalRemove.call(this, key)
    onLocalWrite(key)
  }
}

/** 本机写入后的处理：更新该键时间戳 + 标记待同步 */
function onLocalWrite(key) {
  if (!key.startsWith('fenti-') || EXCLUDE_KEYS.has(key)) return
  if (window.__fentiSyncApplying) return // 正在回写云端数据，不再触发推送
  const meta = readJson(META_KEY, {})
  meta[key] = Date.now()
  writeJson(META_KEY, meta)
  schedulePush()
}

/* ---------------- 待传队列 ---------------- */

function loadQueue() { return readJson(QUEUE_KEY, []) }
function saveQueue(queue) {
  writeJson(QUEUE_KEY, queue)
  state.pendingCount = queue.length
}

/** 把一批记录放入待传队列（去重：同键保留 updatedAt 最新的） */
function enqueue(records) {
  const queue = loadQueue()
  const map = new Map(queue.map((r) => [r.key, r]))
  for (const record of records) {
    const existing = map.get(record.key)
    if (!existing || record.updatedAt > existing.updatedAt) map.set(record.key, record)
  }
  saveQueue([...map.values()])
}

/* ---------------- 传输层：演示模式（本地模拟云） / 真实 HTTP ---------------- */

/**
 * 推送记录到"云端"，返回"云端比本地新、需要回写"的记录。
 * 演示模式：按用户 id 存在本机 localStorage（fenti-cloud-mock:用户id），
 *           并用 BroadcastChannel 通知其他标签页"云里有新数据"；
 * 真实模式：POST 到 Vercel 云函数，函数内部按用户 id 隔离存储。
 */
async function transportPush(userId, records) {
  if (ENDPOINT) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, records })
    })
    if (!response.ok) throw new Error(`同步接口返回 ${response.status}`)
    const data = await response.json()
    return data.records || []
  }
  // —— 演示模式 ——
  const cloudKey = MOCK_CLOUD_PREFIX + userId
  const cloud = readJson(cloudKey, [])
  const { merged, appliedRemote } = mergeRecords(cloud, records)
  writeJson(cloudKey, merged)
  // 模拟"另一台设备"：通知其他标签页来拉取
  broadcastChannel?.postMessage({ type: 'cloud-updated', userId })
  return appliedRemote
}

/** 全量拉取云端记录（登录后首次同步用） */
async function transportPull(userId) {
  if (ENDPOINT) {
    const response = await fetch(`${ENDPOINT}?userId=${encodeURIComponent(userId)}`)
    if (!response.ok) throw new Error(`拉取接口返回 ${response.status}`)
    const data = await response.json()
    return data.records || []
  }
  return readJson(MOCK_CLOUD_PREFIX + userId, [])
}

/** 跨标签页通知（演示模式下模拟多端） */
const broadcastChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('fenti-sync')
  : null

/* ---------------- 同步主流程 ---------------- */

let pushTimer = null
let retryTimer = null
let pushing = false // 防重入：上一次推送没结束就不开新的

/** 安排一次推送（防抖 1.2s，满足 ≤3s 延迟要求） */
function schedulePush() {
  if (!account.isLoggedIn.value) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { pushDirty() }, PUSH_DEBOUNCE)
}

/** 收集"本地有而云端可能没有 / 已变化"的记录 */
function collectLocalRecords(keys) {
  const meta = readJson(META_KEY, {})
  return keys
    .map((key) => ({
      key,
      value: localStorage.getItem(key),
      updatedAt: meta[key] || 0,
      deleted: false
    }))
    .filter((r) => r.value !== null)
}

/** 把云端较新的记录回写到本机（带防循环标记） */
function applyRemoteRecords(records) {
  if (!records.length) return
  window.__fentiSyncApplying = true
  const meta = readJson(META_KEY, {})
  try {
    for (const record of records) {
      localStorage.setItem(record.key, record.value)
      meta[record.key] = record.updatedAt
    }
    writeJson(META_KEY, meta)
  } finally {
    window.__fentiSyncApplying = false
  }
  // 回写后页面数据需要重新加载：用事件通知（各 core 模块自行决定如何处理）
  window.dispatchEvent(new CustomEvent('fenti:sync-applied', { detail: { keys: records.map((r) => r.key) } }))
}

/** 推送待传队列 + 本轮脏数据 */
async function pushDirty() {
  if (pushing) return
  const user = account.state.user
  if (!user) return
  const queue = loadQueue()
  const records = collectLocalRecords(syncableKeys())
  if (!queue.length && !records.length) return

  pushing = true
  state.status = 'syncing'
  try {
    const newerFromCloud = await transportPush(user.id, [...queue, ...records])
    applyRemoteRecords(newerFromCloud)
    saveQueue([])
    state.status = 'synced'
    state.lastSyncAt = new Date().toISOString()
    logHistory('push', `同步 ${records.length} 项${newerFromCloud.length ? `，合并云端更新 ${newerFromCloud.length} 项` : ''}`)
  } catch (error) {
    // 弱网/断网/接口失败：全部进待传队列，退避后自动续传
    console.warn('[sync] 推送失败，进入离线队列：', error.message)
    enqueue([...queue, ...records])
    state.status = 'offline'
    logHistory('offline', `同步失败已暂存：${error.message}`)
    scheduleRetry()
  } finally {
    pushing = false
  }
}

/** 离线退避重试：3s → 6s → 12s → 封顶 60s，网络恢复事件会立刻提前触发 */
let retryCount = 0
function scheduleRetry() {
  clearTimeout(retryTimer)
  const delay = Math.min(RETRY_BASE * 2 ** retryCount, 60000)
  retryCount++
  retryTimer = setTimeout(() => { pushDirty() }, delay)
}

/** 登录后首次：先拉取云端 → 合并回写 → 再推送本地（保证不覆盖云端新数据） */
async function initialSync() {
  const user = account.state.user
  if (!user) return
  state.status = 'syncing'
  try {
    const remote = await transportPull(user.id)
    const local = collectLocalRecords(syncableKeys())
    const { merged, appliedRemote } = mergeRecords(local, remote)
    applyRemoteRecords(appliedRemote)
    // 合并结果推回云端（把本地较新的部分带上去）
    await transportPush(user.id, merged)
    saveQueue([])
    state.status = 'synced'
    state.lastSyncAt = new Date().toISOString()
    retryCount = 0
    logHistory('login-sync', `登录同步完成：合并本地 ${local.length} 项 / 云端 ${remote.length} 项`)
    window.dispatchEvent(new CustomEvent('fenti:sync-applied', { detail: { keys: appliedRemote.map((r) => r.key), initial: true } }))
  } catch (error) {
    console.warn('[sync] 登录同步失败：', error.message)
    state.status = 'offline'
    logHistory('offline', `登录同步失败：${error.message}`)
    scheduleRetry()
  }
}

/* ---------------- 启动接线 ---------------- */

const account = useAccount()

// 1. 打补丁监控本机写入
patchStorage()

// 2. 登录态变化：登录 → 立刻首次同步；退出 → 停止
let wasLoggedIn = account.isLoggedIn.value
window.addEventListener('fenti:account-changed', () => {
  const loggedIn = account.isLoggedIn.value
  if (loggedIn && !wasLoggedIn) initialSync()
  wasLoggedIn = loggedIn
})

// 3. 网络恢复：立刻续传（不等退避计时器）
window.addEventListener('online', () => {
  retryCount = 0
  if (account.isLoggedIn.value) pushDirty()
})

// 4. 演示模式：其他标签页推送后，本标签页 1.5s 后来拉取（模拟另一台设备收到更新）
broadcastChannel?.addEventListener('message', (event) => {
  if (event.data?.type === 'cloud-updated' && account.isLoggedIn.value) {
    setTimeout(() => { initialSync() }, 1500)
  }
})

// 5. 已登录状态下刷新页面：启动即同步
if (account.isLoggedIn.value) {
  state.pendingCount = loadQueue().length
  initialSync()
}

console.log(`[sync] ☁️ 同步引擎就绪（模式：${ENDPOINT ? 'Vercel 云函数' : '本地演示（跨标签页互通）'}）`)

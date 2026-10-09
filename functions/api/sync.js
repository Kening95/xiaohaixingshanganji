/**
 * ============================================================================
 * Cloudflare Pages 云函数 —— functions/api/sync.js（用户数据云端同步 + 备份）
 * ----------------------------------------------------------------------------
 * 本文件是给「方案 B：Cloudflare Pages 部署」准备的同步接口。
 * （Vercel 版本的 api/sync.js 原样保留，两个平台互不影响，用哪个部署就用哪个。）
 *
 * 【为什么需要这个文件】
 *   Cloudflare 规定：凡是放在 functions/ 目录下的 .js 文件，都会被自动发布成
 *   网络接口。这个文件位于 functions/api/sync.js，所以部署后自动拥有：
 *       https://你的网址.pages.dev/api/sync
 *   和 Vercel 版接口的请求/返回格式一模一样，前端同步引擎无需任何修改，
 *   只要把 VITE_SYNC_ENDPOINT 指向这个地址即可。
 *
 * 【接口约定】（与前端 core/sync/index.js 对接）
 *   GET  /api/sync?userId=xxx         → 返回 { records: 该用户全部云端记录 }
 *   POST /api/sync { userId, records } → 按"最后修改时间"合并，
 *                                        返回 { records: 云端较新、需回写本地的记录 }
 *
 * 【数据隔离】所有记录按 userId 分桶存放（key = sync:<userId>），用户之间不串号。
 *
 * 【存储】Cloudflare KV（在 Cloudflare 控制台创建，免费额度：10 万次读/天，
 *        1000 次写/天，个人项目完全够用）。绑定方法见
 *        docs/Cloudflare部署指引.md 第 3 步：
 *        Pages 项目 → Settings → Functions → KV namespace bindings
 *        把命名空间绑定到变量名 SYNC_KV（必须叫这个名字，下面的 env.SYNC_KV 才能读到）。
 *        未绑定时本函数会返回 503 错误提示，不会悄悄丢数据。
 * ============================================================================
 */

/**
 * 从请求里取 userId（GET 在网址参数里，POST 在 JSON 请求体里）。
 * userId = 登录手机号脱敏值，本身就是数据隔离的"门牌号"。
 */
function extractUserId(method, url, body) {
  if (method === 'GET') return url.searchParams.get('userId')
  if (method === 'POST') return body?.userId
  return null
}

/** 统一返回 JSON 的小工具 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

/**
 * 检查 KV 是否已绑定（见文件头第 3 步）。
 * 没绑定时返回一段 503 报错，前端个人中心会显示"同步失败"而不是默默丢数据。
 * 已绑定时返回 null，表示一切正常。
 */
function kvMissingResponse(env) {
  if (env.SYNC_KV) return null
  return json({
    error: 'KV not bound',
    hint: '请在 Cloudflare Pages 项目 Settings → Functions → KV namespace bindings 绑定变量名 SYNC_KV，然后重新部署'
  }, 503)
}

/**
 * 读取某用户全部云端记录。
 * Cloudflare KV 里存的是字符串，读出来后用 { json: true } 直接解析成数组。
 */
async function readCloud(env, userId) {
  const data = await env.SYNC_KV.get(`sync:${userId}`, 'json')
  return Array.isArray(data) ? data : []
}

/** 把合并后的完整记录集写回 KV（JSON 序列化成字符串存储） */
async function writeCloud(env, userId, records) {
  await env.SYNC_KV.put(`sync:${userId}`, JSON.stringify(records))
}

/** GET /api/sync?userId=xxx → 返回云端全部记录（登录后首次同步"拉取"用） */
export async function onRequestGet({ request, env }) {
  const kvMissing = kvMissingResponse(env)
  if (kvMissing) return kvMissing

  const userId = extractUserId('GET', new URL(request.url))
  if (!userId || userId.length > 64) return json({ error: 'userId required' }, 400)

  const records = await readCloud(env, userId)
  return json({ records })
}

/**
 * POST /api/sync → 双向合并。
 * 规则：同一个 key 两端都有时，保留 updatedAt（最后修改时间）较新的一方，
 *       和前端 mergeRecords 完全一致，保证多端冲突自动取最新。
 */
export async function onRequestPost({ request, env }) {
  const kvMissing = kvMissingResponse(env)
  if (kvMissing) return kvMissing

  const body = await request.json().catch(() => null)
  const userId = extractUserId('POST', null, body)
  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    return json({ error: 'userId required' }, 400)
  }

  const incoming = Array.isArray(body?.records) ? body.records : []
  // 单用户数据量保护：防止异常请求撑爆存储
  if (incoming.length > 500) return json({ error: 'too many records' }, 413)

  const cloud = await readCloud(env, userId)

  // 1) 合并：云端记录为底，把本地较新的盖上去
  const mergedMap = new Map(cloud.map((r) => [r.key, r]))
  for (const record of incoming) {
    const existing = mergedMap.get(record.key)
    if (!existing || record.updatedAt > existing.updatedAt) mergedMap.set(record.key, record)
  }
  const merged = [...mergedMap.values()]
  await writeCloud(env, userId, merged)

  // 2) 找出"云端比客户端新"的记录，回给前端让其覆盖本地旧数据
  const localMap = new Map(incoming.map((r) => [r.key, r]))
  const recordsNewerOnCloud = merged.filter((r) => {
    const local = localMap.get(r.key)
    return !local || r.updatedAt > local.updatedAt
  })
  return json({ records: recordsNewerOnCloud })
}

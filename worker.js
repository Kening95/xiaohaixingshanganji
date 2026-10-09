/**
 * ============================================================================
 * Cloudflare Worker 入口 —— worker.js（网站 + 同步接口 二合一）
 * ----------------------------------------------------------------------------
 * 背景：2025 年后 Cloudflare 把 Pages 合并进了 Workers，新建项目时界面变成
 *      「Build command + npx wrangler deploy」的 Worker 流程，没有了 Framework preset。
 *      本文件就是让这套新流程能直接跑通的关键：
 *
 *      · 网址路径 /api/sync        → 由下面代码处理（用户数据云端同步，存 Cloudflare KV）
 *      · 其他所有路径（/ /map …） → 交给 env.ASSETS（构建产物 dist/ 里的静态网页），
 *                                  public/_redirects 会保证子页面刷新不 404
 *
 * 工作原理（小白版）：
 *      访客请求进来 → 先看是不是同步接口 → 是就处理数据；不是就“转手”给静态网页文件。
 *
 * 配置：wrangler.toml 告诉 Cloudflare 本文件是入口、dist 是网站文件。
 *      KV 绑定在 Cloudflare 控制台操作：项目 → Settings → Bindings → KV
 *      变量名必须叫 SYNC_KV（下面 env.SYNC_KV 读它）。
 *
 * 接口约定（与前端 core/sync/index.js 对接，和 Vercel 版完全一致）：
 *      GET  /api/sync?userId=xxx          → { records: 云端全部记录 }
 *      POST /api/sync { userId, records } → { records: 云端较新、需回写本地的记录 }
 * ============================================================================
 */

/** 统一返回 JSON */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

/** KV 没绑定时给前端明确报错，不悄悄丢数据 */
function kvMissingResponse(env) {
  if (env.SYNC_KV) return null
  return json({
    error: 'KV not bound',
    hint: '请在 Cloudflare 项目 Settings → Bindings 绑定 KV（变量名 SYNC_KV），然后重新部署'
  }, 503)
}

/** 读某用户全部云端记录（KV 里存字符串，读出时直接解析成数组） */
async function readCloud(env, userId) {
  const data = await env.SYNC_KV.get(`sync:${userId}`, 'json')
  return Array.isArray(data) ? data : []
}

/** 合并后的完整记录集写回 KV */
async function writeCloud(env, userId, records) {
  await env.SYNC_KV.put(`sync:${userId}`, JSON.stringify(records))
}

/** GET：登录后首次同步"拉取"云端全部记录 */
async function handleGet(request, env) {
  const kvMissing = kvMissingResponse(env)
  if (kvMissing) return kvMissing

  const userId = new URL(request.url).searchParams.get('userId')
  if (!userId || userId.length > 64) return json({ error: 'userId required' }, 400)

  return json({ records: await readCloud(env, userId) })
}

/**
 * POST：双向合并。同一 key 两端都有时，保留 updatedAt（最后修改时间）较新的一方，
 * 和前端 mergeRecords 规则一致，保证多端冲突自动取最新。
 */
async function handlePost(request, env) {
  const kvMissing = kvMissingResponse(env)
  if (kvMissing) return kvMissing

  const body = await request.json().catch(() => null)
  const userId = body?.userId
  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    return json({ error: 'userId required' }, 400)
  }

  const incoming = Array.isArray(body?.records) ? body.records : []
  // 单用户数据量保护
  if (incoming.length > 500) return json({ error: 'too many records' }, 413)

  const cloud = await readCloud(env, userId)

  // 1) 合并：云端为底，本地较新的盖上去
  const mergedMap = new Map(cloud.map((r) => [r.key, r]))
  for (const record of incoming) {
    const existing = mergedMap.get(record.key)
    if (!existing || record.updatedAt > existing.updatedAt) mergedMap.set(record.key, record)
  }
  const merged = [...mergedMap.values()]
  await writeCloud(env, userId, merged)

  // 2) 找出云端比客户端新的记录，回给前端覆盖本地旧数据
  const localMap = new Map(incoming.map((r) => [r.key, r]))
  const recordsNewerOnCloud = merged.filter((r) => {
    const local = localMap.get(r.key)
    return !local || r.updatedAt > local.updatedAt
  })
  return json({ records: recordsNewerOnCloud })
}

/** Worker 入口：每个访客请求都会进这个函数 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // 同步接口
    if (url.pathname === '/api/sync') {
      if (request.method === 'GET') return handleGet(request, env)
      if (request.method === 'POST') return handlePost(request, env)
      return json({ error: 'method not allowed' }, 405)
    }

    // 其他所有请求 → 交给静态网页（dist/ 里的文件）
    return env.ASSETS.fetch(request)
  }
}

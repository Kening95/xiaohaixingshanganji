/**
 * ============================================================================
 * Vercel Serverless 云函数 —— api/sync.js（用户数据云端同步 + 备份）
 * ----------------------------------------------------------------------------
 * Vercel 会自动识别 api/ 目录下的文件并发布为 Serverless 函数，
 * 无需自己买服务器、配数据库。
 *
 * 前端对接：设置环境变量 VITE_SYNC_ENDPOINT=https://你的域名/api/sync
 *          同步引擎（core/sync/index.js）即自动切换为真实云端同步。
 *          ⚠️ Vite 在"构建时"把环境变量写进网页代码，所以改完变量必须重新部署。
 *
 * 接口约定：
 *   GET  /api/sync?userId=xxx   → 返回该用户的全部云端记录
 *   POST /api/sync { userId, records } → 按"最后修改时间"合并，返回云端较新的记录
 *
 * 数据隔离：所有记录按 userId 分桶存放（key = sync:<userId>），用户之间不串号。
 *
 * 存储：@vercel/kv（Vercel 控制台「Storage」一键开通，免费额度个人项目够用，
 *       不引入任何其他第三方付费服务）。未配置 KV 时退化为进程内内存
 *      （仅演示可用；Serverless 实例会轮换，内存数据可能丢失，生产务必配 KV）。
 * ============================================================================
 */

// 尝试加载 @vercel/kv；没装/没配置就用内存兜底
let kv = null
try {
  const mod = await import('@vercel/kv')
  kv = mod.kv
  await kv.ping?.() // 没配置环境变量时这里会抛错，走内存兜底
  console.log('[sync-api] 使用 @vercel/kv 存储')
} catch {
  console.warn('[sync-api] @vercel/kv 未配置，退化为内存存储（重启/换实例会丢数据）')
}

/** 内存兜底存储：Map<userId, Record[]> */
const memoryStore = new Map()

async function readCloud(userId) {
  if (kv) {
    const data = await kv.get(`sync:${userId}`)
    return Array.isArray(data) ? data : []
  }
  return memoryStore.get(userId) || []
}

async function writeCloud(userId, records) {
  if (kv) {
    await kv.set(`sync:${userId}`, records)
    return
  }
  memoryStore.set(userId, records)
}

/** 合并规则：同键保留 updatedAt 较新的一方（与前端 mergeRecords 完全一致） */
export default async function handler(request, response) {
  // 简单鉴权：必须有 userId（本项目 userId = 登录手机号脱敏值，本身即隔离凭证；
  // 如需更强防护可在此增加 token 校验）
  const userId = request.method === 'GET'
    ? request.query.userId
    : request.body?.userId

  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    return response.status(400).json({ error: 'userId required' })
  }

  try {
    if (request.method === 'GET') {
      const records = await readCloud(userId)
      return response.status(200).json({ records })
    }

    if (request.method === 'POST') {
      const incoming = Array.isArray(request.body?.records) ? request.body.records : []
      // 单用户数据量保护：防止异常请求撑爆存储
      if (incoming.length > 500) {
        return response.status(413).json({ error: 'too many records' })
      }
      const cloud = await readCloud(userId)
      // 双向合并：云 vs 本次推送 → 较新的进云；云里比本地新的 → 回给前端
      const cloudMap = new Map(cloud.map((r) => [r.key, r]))
      const mergedMap = new Map(cloudMap)
      for (const record of incoming) {
        const existing = mergedMap.get(record.key)
        if (!existing || record.updatedAt > existing.updatedAt) mergedMap.set(record.key, record)
      }
      const merged = [...mergedMap.values()]
      await writeCloud(userId, merged)
      // 找出"云端比客户端新"的记录（客户端本地较旧 → 需要回写）
      const localMap = new Map(incoming.map((r) => [r.key, r]))
      const recordsNewerOnCloud = merged.filter((r) => {
        const local = localMap.get(r.key)
        return !local || r.updatedAt > local.updatedAt
      })
      return response.status(200).json({ records: recordsNewerOnCloud })
    }

    return response.status(405).json({ error: 'method not allowed' })
  } catch (error) {
    console.error('[sync-api] 处理失败：', error)
    return response.status(500).json({ error: 'internal error' })
  }
}

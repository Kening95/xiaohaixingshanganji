/**
 * ============================================================================
 * 账号体系 —— core/account/index.js（第 7 阶段新增）
 * ----------------------------------------------------------------------------
 * 双端数据互通的"身份证"：登录后学习数据才能跨设备云端同步。
 *
 * 支持的登录方式（极简，只保留两种）：
 *   1. 手机号 + 验证码（6 位）
 *   2. 微信扫码
 *
 * 免登机制：登录一次 7 天内自动保持（token 带过期时间），
 * 过期后下次操作会要求重新登录。
 *
 * 【诚实声明 · 演示环境】
 *   本项目是纯前端工程，没有真实的短信网关和微信开放平台资质。
 *   因此：验证码为"演示验证码"（固定 888888，页面会直接提示）；
 *   微信扫码为"模拟扫码"（点击即视为扫码成功）。
 *   接入真实服务时只需替换 sendSmsCode / confirmWechatScan 两个函数内部实现，
 *   页面与同步引擎一行都不用改（分层解耦）。
 * ============================================================================
 */
import { reactive, computed, readonly } from 'vue'

/** localStorage 存档键（账号信息属敏感数据，隐私清空会一并删除） */
const STORAGE_KEY = 'fenti-account-v1'

/** 免登时长：7 天（毫秒） */
export const LOGIN_TTL = 7 * 24 * 60 * 60 * 1000

/** 演示环境固定验证码（接入真实短信服务后删除这行） */
export const DEMO_SMS_CODE = '888888'

/** 账号状态（响应式仓库） */
const state = reactive({
  /** 当前登录用户：null = 未登录；{ id, phone?, maskedPhone?, provider, loggedAt, expiresAt } */
  user: null
})

/* ---------------- 存档读写 ---------------- */

function save() {
  try {
    if (state.user) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user))
    else localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('[account] 账号存档失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const user = JSON.parse(raw)
    // 7 天免登：过期即视为未登录（存档顺手清掉）
    if (user.expiresAt && user.expiresAt > Date.now()) {
      state.user = user
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
    console.error('[account] 读取账号存档失败：', error)
  }
}

/** 手机号脱敏：138****5678 */
function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

/* ---------------- 对外 API ---------------- */

/** 是否已登录（含 7 天有效期判断，响应式） */
export function useAccount() {
  return {
    state: readonly(state),
    isLoggedIn: computed(() => !!state.user && state.user.expiresAt > Date.now()),
    /** 距离免登到期还剩几天（未登录返回 0） */
    daysLeft: computed(() => {
      if (!state.user) return 0
      return Math.max(0, Math.ceil((state.user.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    })
  }
}

/**
 * 发送短信验证码。
 * 【演示环境】不发真实短信，直接返回固定验证码并通过 toast 提示用户。
 * @param {string} phone 11 位手机号
 * @returns {{ ok: boolean, demoCode?: string, reason?: string }}
 */
export function sendSmsCode(phone) {
  if (!/^1\d{10}$/.test(phone)) {
    return { ok: false, reason: '手机号格式不对哦，检查一下是不是 11 位～' }
  }
  // TODO(接入真实短信)：在这里调用短信服务商 API（如阿里云/腾讯云短信），
  // 并把真实验证码暂存到服务端或本地（带过期时间）。
  console.log(`[account] 📨 演示验证码已"发送"到 ${maskPhone(phone)}：${DEMO_SMS_CODE}`)
  return { ok: true, demoCode: DEMO_SMS_CODE }
}

/**
 * 手机号 + 验证码登录。
 * @returns {{ ok: boolean, reason?: string }}
 */
export function loginWithSms(phone, code) {
  if (!/^1\d{10}$/.test(phone)) {
    return { ok: false, reason: '手机号格式不对哦，检查一下是不是 11 位～' }
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, reason: '验证码是 6 位数字哦～' }
  }
  // 【演示环境】只校验固定演示码；接入真实短信后改为校验服务端下发的验证码
  if (code !== DEMO_SMS_CODE) {
    return { ok: false, reason: '验证码不对，再试一次嘛（演示验证码见页面提示）' }
  }
  const now = Date.now()
  state.user = {
    id: `phone-${phone}`,
    phone,
    maskedPhone: maskPhone(phone),
    provider: 'sms',
    loggedAt: now,
    expiresAt: now + LOGIN_TTL // 7 天免登
  }
  save()
  notifyLoginChanged()
  console.log(`[account] ✅ 手机号登录成功：${maskPhone(phone)}（7 天免登）`)
  return { ok: true }
}

/**
 * 微信扫码登录（演示环境 = 点击"模拟扫码成功"即登录）。
 * 【接入真实微信】需要在微信开放平台申请网站应用，走 OAuth 授权流程拿 openid，
 *  再换成这里的 user 对象即可。
 * @returns {{ ok: boolean }}
 */
export function loginWithWechat() {
  const now = Date.now()
  state.user = {
    id: `wechat-demo-${now.toString(36)}`,
    provider: 'wechat',
    maskedPhone: null,
    loggedAt: now,
    expiresAt: now + LOGIN_TTL // 7 天免登
  }
  save()
  notifyLoginChanged()
  console.log('[account] ✅ 微信扫码登录成功（演示环境模拟，7 天免登）')
  return { ok: true }
}

/** 退出登录：清本地账号信息（不会删除学习数据） */
export function logout() {
  state.user = null
  save()
  notifyLoginChanged()
  console.log('[account] 👋 已退出登录')
}

/** 登录态变化广播：同步引擎等模块据此启停 */
function notifyLoginChanged() {
  window.dispatchEvent(new CustomEvent('fenti:account-changed'))
}

// 启动即恢复登录态（7 天内免登）
load()

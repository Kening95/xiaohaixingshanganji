/**
 * ============================================================================
 * 粉蹄专注幻境 —— core/focus/index.js（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   一键进入全屏"幻境"：只剩粉蹄海星陪你呼吸的纯净画面，屏蔽一切干扰，
 *   专注计时结束后温柔地唤你回来，并给一点小奖励。
 *
 * 规则（全部复用现有体系）：
 *   · 预设时长：15 / 25 / 45 分钟（番茄工作法常用档）
 *   · 完成奖励：专注满 1 次 +2 金币（走游戏化统一接口②），并记入学习日志
 *     （core/stats 的 minutes），热力图/周报自动同步——幻境里的每一分钟都算数
 *   · 中途退出：不扣东西也不发奖，诚实记录已专注的分钟数进日志
 *   · 防刷：同一秒内完成多次结算会被忽略；奖励次数不设上限但时间是真实流逝的
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins } from '@/core/gamification'
import { addMinutes } from '@/core/stats'

const STORAGE_KEY = 'fenti-focus-v1'

export const FOCUS_PRESETS = [
  { minutes: 15, label: '小试 15 分钟' },
  { minutes: 25, label: '标准番茄 25 分钟' },
  { minutes: 45, label: '深度 45 分钟' }
]

const state = reactive({
  active: false,        // 幻境是否开启
  totalSeconds: 0,      // 本次设定的总时长（秒）
  remainSeconds: 0,     // 剩余秒数
  startedAt: 0,         // 开始时间戳（真实时间校验防刷）
  sessionDone: 0        // 历史累计完成次数（持久化）
})

let timer = null

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionDone: state.sessionDone }))
  } catch (error) {
    console.error('[focus] 存档失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) state.sessionDone = JSON.parse(raw).sessionDone || 0
  } catch (error) {
    console.error('[focus] 读档失败：', error)
  }
}

load()

/** 心跳：每秒减 1 秒，用真实时间差（后台标签页定时器被节流也不失真） */
function startTick() {
  stopTick()
  let last = Date.now()
  timer = setInterval(() => {
    const now = Date.now()
    const delta = Math.round((now - last) / 1000)
    last = now
    if (delta <= 0) return
    state.remainSeconds = Math.max(0, state.remainSeconds - delta)
    if (state.remainSeconds === 0) finishFocus()
  }, 1000)
}

function stopTick() {
  if (timer) { clearInterval(timer); timer = null }
}

/** 进入幻境 */
export function enterFocus(minutes = 25) {
  state.active = true
  state.totalSeconds = minutes * 60
  state.remainSeconds = state.totalSeconds
  state.startedAt = Date.now()
  startTick()
  console.log(`[focus] 🧘 进入专注幻境：${minutes} 分钟`)
}

/**
 * 完成：结算奖励。只有真实时间真的走完了才发奖（时间戳校验）。
 * @param {number} [now] 当前时间戳，测试用例可注入假时间；默认 Date.now()
 * @returns {{ coins: number, minutes: number, full: boolean }} 本次发放的金币与计入的学习分钟
 */
export function finishFocus(now = Date.now()) {
  const elapsed = Math.floor((now - state.startedAt) / 1000)
  const full = elapsed >= state.totalSeconds
  const minutes = Math.min(Math.round(elapsed / 60), Math.round(state.totalSeconds / 60))
  let coins = 0
  if (full) {
    coins = 2
    state.sessionDone++
    save()
    addCoins(coins, `专注幻境完成 ${Math.round(state.totalSeconds / 60)} 分钟`)
  }
  // 不管是否完成，真实专注过的分钟都记入学习日志（热力图同步变深）
  if (minutes > 0) addMinutes(minutes)
  const result = { coins, minutes, full }
  stopTick()
  state.active = false
  console.log(`[focus] 🌅 退出幻境：专注 ${minutes} 分钟${full ? '，完成奖励 +2 金币' : '（未完成，无奖励）'}`)
  return result
}

/** 主动退出（中途放弃）。测试用例可注入时间戳模拟"真的专注了 N 分钟"。 */
export function exitFocus(now) {
  return finishFocus(now)
}

/** 幻境状态（响应式） */
export function useFocusState() {
  return computed(() => ({
    ...state,
    percent: state.totalSeconds ? Math.round((1 - state.remainSeconds / state.totalSeconds) * 100) : 0
  }))
}

/** 剩余时间 mm:ss */
export function fmtRemain(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

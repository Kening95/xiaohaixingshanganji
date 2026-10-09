/**
 * ============================================================================
 * 考前幸运 buff 壁纸生成器 —— core/wallpaper/index.js（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 把"考前倒计时 + 幸运 buff + 粉蹄"画成一张 1080×1920 手机壁纸，
 * 一键下载 PNG 存进相册，天天换壁纸天天有好运。
 *
 * 画布内容（数据全部来自现有体系，无任何虚构字段）：
 *   · 品牌渐变底色：默认「晨光蓝粉」；商店购入「星空粉主题」后可切换
 *   · 考试倒计时：计划创建日 + 备考天数 - 今天（读 core/plan）
 *   · 粉蹄当前体重 + 全局进度（读 gamification/plan 总账）
 *   · 幸运 buff 文案：基础 6 条 + 商店「幸运 buff 签」解锁 6 条
 *   · 大粉蹄海星 + 日期 +  slogan
 *
 * 纯 Canvas 2D 绘制，无图片依赖（海星用 emoji 绘制，系统字体自带），
 * 离线可用。
 * ============================================================================
 */
import { usePlan } from '@/core/plan'
import { useGamification } from '@/core/gamification'
import { owns } from '@/core/shop'

/** 基础 buff 文案池（人人可用） */
export const FREE_BUFFS = [
  '今日题感 +100%，会的全对',
  '蒙的都对，算的都快',
  '粉蹄附体，逢考必过',
  '心静如水，下笔有神',
  '好运正在路上，请保持刷题',
  '这一页做完，就离上岸近一点'
]

/** 商店「幸运 buff 签」解锁的隐藏 buff 池 */
export const PREMIUM_BUFFS = [
  '锦鲤加持，行测申论双开花',
  '考官看了都想给你加分',
  '蒙题直觉今日在线',
  '错题小怪兽见你绕道走',
  '猪队友全员为你打 call',
  '上岸名单里已经有你的名字'
]

/** 主题配色（壁纸底色渐变 + 文字色） */
export const WALLPAPER_THEMES = [
  { id: 'morning', name: '晨光蓝粉（默认）', colors: ['#E6F4FF', '#FFE6F2'], text: '#333333', free: true },
  { id: 'starry', name: '星空粉（商店限定）', colors: ['#2b2d5c', '#ff9ec4'], text: '#ffffff', free: false }
]

/** 返回用户当前可用的 buff 池（含已解锁的隐藏款） */
export function availableBuffs() {
  return owns('lucky-buff') ? [...FREE_BUFFS, ...PREMIUM_BUFFS] : [...FREE_BUFFS]
}

/** 返回用户当前可用的主题列表 */
export function availableThemes() {
  return WALLPAPER_THEMES.filter((t) => t.free || owns('theme-starry'))
}

/** 剩余备考天数（读计划；没有计划返回 null） */
function daysLeft() {
  const plan = usePlan().value
  if (!plan?.createdAt || !plan.examDays) return null
  const examDate = new Date(plan.createdAt)
  examDate.setDate(examDate.getDate() + plan.examDays)
  return Math.max(0, Math.ceil((examDate - Date.now()) / 86400000))
}

/**
 * 生成壁纸。
 * @param {Object} options { buff: string 文案, themeId: string 主题 }
 * @returns {string} PNG dataURL（1080×1920）
 */
export function generateWallpaper({ buff, themeId = 'morning' } = {}) {
  const theme = WALLPAPER_THEMES.find((t) => t.id === themeId) || WALLPAPER_THEMES[0]
  const game = useGamification()
  const plan = usePlan().value
  const stats = plan
    ? plan.stages.reduce((acc, s) => {
        acc.total += s.tasks.length
        acc.done += s.tasks.filter((t) => t.done).length
        return acc
      }, { total: 0, done: 0 })
    : { total: 0, done: 0 }
  const progress = stats.total ? Math.round(stats.done / stats.total * 100) : 0
  const left = daysLeft()

  const W = 1080
  const H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  /* 底色渐变 */
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, theme.colors[0])
  grad.addColorStop(1, theme.colors[1])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  /* 顶部：日期 + 倒计时 */
  ctx.fillStyle = theme.text
  ctx.textAlign = 'center'
  ctx.font = '42px sans-serif'
  ctx.globalAlpha = 0.75
  ctx.fillText(new Date().toLocaleDateString('sv-SE'), W / 2, 140)
  ctx.globalAlpha = 1

  if (left != null) {
    ctx.font = 'bold 120px sans-serif'
    ctx.fillText(`${left}`, W / 2, 330)
    ctx.font = '48px sans-serif'
    ctx.fillText('天后上岸', W / 2, 400)
  } else {
    ctx.font = 'bold 72px sans-serif'
    ctx.fillText('粉蹄陪你备考', W / 2, 330)
  }

  /* 中央：大粉蹄海星 */
  ctx.font = '300px sans-serif'
  ctx.fillText('🌊', W / 2, 800)
  ctx.font = '200px sans-serif'
  ctx.fillText('⭐', W / 2, 810)

  /* 状态行：体重 + 总进度 */
  ctx.font = '44px sans-serif'
  ctx.globalAlpha = 0.9
  ctx.fillText(`⭐ 粉蹄 ${game.weight} 斤（目标 100）`, W / 2, 1020)
  ctx.fillText(`📈 全局进度 ${progress}%`, W / 2, 1090)
  ctx.globalAlpha = 1

  /* 幸运 buff 文案（自动换行，最长 12 字/行） */
  const text = buff || availableBuffs()[Math.floor(Math.random() * availableBuffs().length)]
  ctx.font = 'bold 56px sans-serif'
  const chars = text.split('')
  const lines = []
  for (let i = 0; i < chars.length; i += 12) lines.push(chars.slice(i, i + 12).join(''))
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 1260 + i * 80))

  /* 底部 slogan */
  ctx.font = '36px sans-serif'
  ctx.globalAlpha = 0.7
  ctx.fillText('—— 小海星上岸记 · 一题一题上岸 ——', W / 2, 1800)
  ctx.globalAlpha = 1

  return canvas.toDataURL('image/png')
}

/** 下载壁纸 PNG */
export function downloadWallpaper(dataUrl, suffix = '') {
  const link = document.createElement('a')
  link.download = `粉蹄幸运壁纸_${new Date().toLocaleDateString('sv-SE')}${suffix}.png`
  link.href = dataUrl
  link.click()
}

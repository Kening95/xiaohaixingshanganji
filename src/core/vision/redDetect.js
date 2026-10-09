/**
 * ============================================================================
 * 红笔判定 —— core/vision/redDetect.js
 * ----------------------------------------------------------------------------
 * 需求：识别到红笔叉号、红笔涂改 → 判为"错题"；只识别到红笔对勾 → "答对"；
 * 空白无笔迹 → "未做题"。
 *
 * 实现思路（纯 Canvas 像素分析，浏览器本地完成，不上传图片）：
 *   1. 先数"红色笔迹像素"（红通道显著高于绿蓝通道的点）
 *      数量太少 → 直接判"未做题"
 *   2. 把红像素归一化投到 8×8 网格，看笔画"走"过哪些格子：
 *      · 两条对角线（↘ 和 ↙）都有笔画 → 典型的"叉号" → 错题
 *      · 单条对角线且笔画又长又重（贯穿整个区域、红像素密度高）→ 涂改/划掉 → 错题
 *      · 单条对角线但笔画轻短 → 对勾 → 答对
 *   3. 判断不了的 → 'unknown'，交给用户点击图片手动一键改判
 *
 * 诚实声明：叉号和对勾的形状识别是启发式算法，遇到连笔、花体可能拿不准，
 * 所以产品上有"手动改判"兜底（需求本身也要求了这个入口）。
 * ============================================================================
 */

/**
 * 判定结果：
 *   'wrong'  红叉或红笔涂改 → 错题
 *   'right'  红笔对勾 → 答对
 *   'blank'  无红笔迹 → 未做题
 *   'unknown'拿不准 → 待手动改判
 */
export const RED_VERDICTS = ['wrong', 'right', 'blank', 'unknown']

/** 网格边长：把红像素分布投到 GRID×GRID 的格子里分析笔画走向 */
const GRID = 8

/**
 * 分析画布上的红色笔迹并给出判定。
 * @param {HTMLCanvasElement} source
 * @returns {{ verdict: string, redRatio: number, confidence: 'high'|'low', hint: string }}
 */
export function detectRedMark(source) {
  try {
    const ctx = source.getContext('2d')
    const { width, height } = source
    const { data } = ctx.getImageData(0, 0, width, height)

    // ---- 第 1 步：收集红色笔迹像素坐标 ----
    const redPoints = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // 红色判定：红通道明显盖过绿蓝（兼容暗红笔：阈值取低一些）
        if (r > 100 && r - g > 35 && r - b > 35) {
          redPoints.push({ x, y })
        }
      }
    }

    const redRatio = redPoints.length / (width * height)
    if (redPoints.length < 40 || redRatio < 0.00015) {
      return { verdict: 'blank', redRatio, confidence: 'high', hint: '没有检测到红笔迹' }
    }

    // ---- 第 2 步：红像素包围盒 + 8×8 网格 ----
    let minX = width; let maxX = 0; let minY = height; let maxY = 0
    for (const p of redPoints) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const boxW = Math.max(1, maxX - minX + 1)
    const boxH = Math.max(1, maxY - minY + 1)

    // 网格里每格的红像素数
    const grid = Array.from({ length: GRID * GRID }, () => 0)
    for (const p of redPoints) {
      const gx = Math.min(GRID - 1, Math.floor(((p.x - minX) / boxW) * GRID))
      const gy = Math.min(GRID - 1, Math.floor(((p.y - minY) / boxH) * GRID))
      grid[gy * GRID + gx]++
    }
    // 每格"有笔画"的阈值：该格红像素数 ≥ 红像素总数的 1%（格子总数 64）
    const cellThreshold = redPoints.length * 0.01
    const hasInk = (gx, gy) => grid[gy * GRID + gx] >= cellThreshold

    // ---- 第 3 步：沿两条对角线统计笔画覆盖率 ----
    let diagA = 0 // ↘ 主对角线：左上 → 右下
    let diagB = 0 // ↙ 副对角线：右上 → 左下
    for (let k = 0; k < GRID; k++) {
      if (hasInk(k, k)) diagA++
      if (hasInk(GRID - 1 - k, k)) diagB++
    }

    // 笔画"重不重"：红像素数 ÷ 包围盒面积（涂改 typically 又密又长）
    const density = redPoints.length / (boxW * boxH)
    // 笔画"长不长"：红像素包围盒占整图的比例（涂改线常贯穿题目区域）
    const span = (boxW * boxH) / (width * height)
    // 笔画"横不横"：包围盒宽高比（整行划掉的涂改线是个扁长条）
    const flatness = boxW / boxH

    // ---- 第 4 步：启发式规则 ----
    if (diagA >= 3 && diagB >= 3) {
      return { verdict: 'wrong', redRatio, confidence: 'high', hint: '检测到红笔交叉笔画（叉号/涂改）' }
    }
    const singleDiag = Math.max(diagA, diagB)
    if (singleDiag >= 4 && density > 0.06 && span > 0.15) {
      return { verdict: 'wrong', redRatio, confidence: 'medium', hint: '检测到长而重的红笔划掉痕迹' }
    }
    // 扁长条 + 高密度的红笔画 = 整行作答被划掉（涂改线通常横贯一行）
    if (flatness > 3 && density > 0.05) {
      return { verdict: 'wrong', redRatio, confidence: 'medium', hint: '检测到横贯的红笔涂改线' }
    }
    if (singleDiag >= 3) {
      return { verdict: 'right', redRatio, confidence: 'medium', hint: '检测到单笔红笔标记（对勾）' }
    }

    return { verdict: 'unknown', redRatio, confidence: 'low', hint: '红笔迹存在但形状拿不准，请手动确认' }
  } catch (error) {
    console.warn('[vision] 红笔判定失败：', error)
    return { verdict: 'unknown', redRatio: 0, confidence: 'low', hint: '分析出错，请手动判定' }
  }
}

/** 判定结果的友好文案（UI 徽章展示用） */
export const VERDICT_TEXT = {
  wrong: '❌ 错题',
  right: '✅ 答对',
  blank: '⬜ 未做',
  unknown: '❓ 待确认'
}

/**
 * ============================================================================
 * 图像预处理 —— core/vision/preprocess.js
 * ----------------------------------------------------------------------------
 * 拍照扫题拍出来的照片通常有这些问题：边缘有大片桌面背景、纸张倾斜、
 * 红笔字迹淡。这个模块在识别前对图片做三步预处理（全部在浏览器本地
 * 用 Canvas 完成，不上传任何数据）：
 *
 *   1. cropEdges    裁剪边缘：找到"有内容的区域"，把四周空白/桌面裁掉
 *   2. deskew       校正倾斜：在 ±8° 里逐个角度试，挑"文字行最水平"的角度
 *   3. enhanceRed   增强红色笔迹对比度：让红叉、红勾更红，黑字轻微灰化
 *
 * 每个函数都是"输入 canvas → 输出新 canvas"，纯函数风格，
 * 任意一步失败就原样返回输入，绝不让预处理成为流程的阻塞点。
 * ============================================================================
 */

/** 创建同尺寸空画布 */
function blankCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** 把画布内容画到新画布（复制一份，避免改到原图） */
export function cloneCanvas(source) {
  const copy = blankCanvas(source.width, source.height)
  copy.getContext('2d').drawImage(source, 0, 0)
  return copy
}

/**
 * 第 1 步：裁剪边缘。
 * 思路：把图转灰度后，统计每一行、每一列的"像素明暗变化量"（方差），
 * 文字区域的行列变化量远高于空白桌面，由此圈出内容包围盒。
 */
export function cropEdges(source, padding = 12) {
  try {
    const ctx = source.getContext('2d')
    const { width, height } = source
    const { data } = ctx.getImageData(0, 0, width, height)

    // 灰度数组
    const gray = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) {
      gray[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) | 0
    }

    // 每行 / 每列的明暗变化量（相邻像素差绝对值求和）
    const rowEnergy = new Float64Array(height)
    const colEnergy = new Float64Array(width)
    for (let y = 0; y < height; y++) {
      for (let x = 1; x < width; x++) {
        const diff = Math.abs(gray[y * width + x] - gray[y * width + x - 1])
        rowEnergy[y] += diff
        colEnergy[x] += diff
      }
    }

    // 阈值：能量高于平均值才算"内容行/列"
    const avgRow = rowEnergy.reduce((a, b) => a + b, 0) / height
    const avgCol = colEnergy.reduce((a, b) => a + b, 0) / width

    let top = 0; while (top < height && rowEnergy[top] < avgRow * 0.6) top++
    let bottom = height - 1; while (bottom > top && rowEnergy[bottom] < avgRow * 0.6) bottom--
    let left = 0; while (left < width && colEnergy[left] < avgCol * 0.6) left++
    let right = width - 1; while (right > left && colEnergy[right] < avgCol * 0.6) right--

    // 留一圈 padding，并做合法性检查：裁掉的面积不能超过 70%，否则宁可不裁
    top = Math.max(0, top - padding)
    left = Math.max(0, left - padding)
    bottom = Math.min(height - 1, bottom + padding)
    right = Math.min(width - 1, right + padding)

    const w = right - left + 1
    const h = bottom - top + 1
    if (w < width * 0.3 || h < height * 0.3 || w < 50 || h < 50) return source

    const cropped = blankCanvas(w, h)
    cropped.getContext('2d').drawImage(source, left, top, w, h, 0, 0, w, h)
    return cropped
  } catch (error) {
    console.warn('[vision] 裁剪边缘失败，使用原图：', error)
    return source
  }
}

/**
 * 第 2 步：校正倾斜。
 * 思路：把图按不同角度旋转后，"文字行"会让暗像素的水平分布出现明显的
 * 高峰低谷（行与行之间间隔），方差最大的时候就是纸最正的时候。
 * 在 ±8° 范围内以 1° 步进搜索，够用且很快。
 */
export function deskew(source, maxAngle = 8, step = 1) {
  try {
    // 计算某个角度下旋转图的"暗像素行分布方差"
    const projectionVariance = (angle) => {
      const rad = (angle * Math.PI) / 180
      const w = source.width
      const h = source.height
      const diag = Math.ceil(Math.sqrt(w * w + h * h))
      const canvas = blankCanvas(diag, diag)
      const ctx = canvas.getContext('2d')
      ctx.translate(diag / 2, diag / 2)
      ctx.rotate(rad)
      ctx.drawImage(source, -w / 2, -h / 2)
      const { data } = ctx.getImageData(0, 0, diag, diag)
      const rowDark = new Float64Array(diag)
      for (let y = 0; y < diag; y++) {
        for (let x = 0; x < diag; x++) {
          const i = (y * diag + x) * 4
          const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11
          if (gray < 140) rowDark[y]++
        }
      }
      const mean = rowDark.reduce((a, b) => a + b, 0) / diag
      return rowDark.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / diag
    }

    // 搜索最佳角度
    let bestAngle = 0
    let bestVariance = projectionVariance(0)
    for (let a = -maxAngle; a <= maxAngle; a += step) {
      const v = projectionVariance(a)
      if (v > bestVariance) {
        bestVariance = v
        bestAngle = a
      }
    }

    // 角度太小就没必要转（避免无意义的画质损失）
    if (Math.abs(bestAngle) < 1) return source

    const rad = (bestAngle * Math.PI) / 180
    const w = source.width
    const h = source.height
    const rotated = blankCanvas(w, h)
    const ctx = rotated.getContext('2d')
    ctx.translate(w / 2, h / 2)
    ctx.rotate(rad)
    ctx.drawImage(source, -w / 2, -h / 2)
    return rotated
  } catch (error) {
    console.warn('[vision] 倾斜校正失败，使用原图：', error)
    return source
  }
}

/**
 * 第 3 步：增强红色笔迹对比度。
 * 思路：偏红的像素（红叉红勾）把红色通道拉满、压暗其他通道；
 * 不偏红的像素轻微灰化。红笔越醒目，后面的红笔判定就越准。
 */
export function enhanceRed(source) {
  try {
    const canvas = cloneCanvas(source)
    const ctx = canvas.getContext('2d')
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = image
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const isRed = r > 110 && r - g > 40 && r - b > 40
      if (isRed) {
        data[i] = Math.min(255, r * 1.35)
        data[i + 1] = g * 0.6
        data[i + 2] = b * 0.6
      } else {
        // 非红像素轻微灰化（保留明暗），拉开与红笔的差距
        const gray = r * 0.3 + g * 0.59 + b * 0.11
        data[i] = r * 0.7 + gray * 0.3
        data[i + 1] = g * 0.7 + gray * 0.3
        data[i + 2] = b * 0.7 + gray * 0.3
      }
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  } catch (error) {
    console.warn('[vision] 红色增强失败，使用原图：', error)
    return source
  }
}

/**
 * 三步预处理一条龙（裁剪 → 纠倾 → 增强红笔）。
 * 每步内部都有 try/catch，整体绝不会抛错。
 */
export function preprocess(source) {
  return enhanceRed(deskew(cropEdges(source)))
}

/** 把图片缩到指定宽度以内（OCR 和缩略图用，防止大图拖慢识别） */
export function downscale(source, maxSize = 1000) {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height))
  if (scale >= 1) return source
  const canvas = blankCanvas(Math.round(source.width * scale), Math.round(source.height * scale))
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

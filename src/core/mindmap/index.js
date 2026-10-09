/**
 * ============================================================================
 * 思维导图上传 —— core/mindmap/index.js
 * ----------------------------------------------------------------------------
 * 做什么：用户在"知识梳理关"做完行测/申论的梳理后，把"做题思路
 * 思维导图"拍照/从相册上传。图片存在本地（localStorage），专项练习阶段
 * 可读取它们对照查漏（后续也可扩展按导图自动生成分类，模块入口不变）。
 *
 * 存储方式：
 *   · 每个任务一张图，键 = 'fenti-mindmap-{taskId}'（dataURL 字符串）
 *   · 'fenti-' 前缀 = 本应用数据 → 一键清空隐私功能会自动覆盖这里，无需额外处理
 *   · 上传前先压缩：最长边压到 1000px、JPEG 0.8 —— 一张图约 100~200KB，
 *     6 科加起来不到 1MB，localStorage 完全装得下
 *
 * 给小白的一句话：这就是个"相册"，任务id 是相册格子的编号，存取都按编号来。
 * ============================================================================
 */

/** 存储键前缀（必须是 'fenti-'，一键清空靠它识别本应用数据） */
const KEY_PREFIX = 'fenti-mindmap-'

/** 取某一题任务的思维导图（返回 dataURL 或 null） */
export function getMindmap(taskId) {
  return localStorage.getItem(KEY_PREFIX + taskId)
}

/**
 * 保存思维导图：读文件 → 压缩 → 存本地。
 * @param {string} taskId 任务 id（梳理关的思维导图任务）
 * @param {File} file 用户选的图片文件
 * @returns {Promise<string>} 压缩后的 dataURL
 */
export function saveMindmap(taskId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        // 等比压缩到最长边 1000px（本来就更小则原样使用）
        const scale = Math.min(1, 1000 / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        localStorage.setItem(KEY_PREFIX + taskId, dataUrl)
        resolve(dataUrl)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/** 删除某一任务的思维导图（用户重新拍/不要了时用） */
export function deleteMindmap(taskId) {
  localStorage.removeItem(KEY_PREFIX + taskId)
}

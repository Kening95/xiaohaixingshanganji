/**
 * ============================================================================
 * OCR 识别适配器 —— core/ocr/index.js
 * ----------------------------------------------------------------------------
 * 需求：调用开源免费的 OCR 接口识别题目文字，辅助给错题打"科目"标签。
 *
 * 引擎选型：tesseract.js（开源 Apache-2.0，完全在浏览器本地运行，
 * 不需要注册、不收费、图片不出本机，符合"开源免费"要求）。
 * 首次识别时才会懒加载引擎和中文语言包（约几 MB，自动缓存）。
 *
 * 设计要点：
 *   · 引擎是"可替换的"：recognizeText 是统一出口，以后想换成百度/腾讯
 *     OCR 只要改这一个文件，上层代码零改动
 *   · 识别失败绝不阻塞主流程：红笔判定和错题收录不依赖 OCR，
 *     OCR 只影响"自动打科目标签"，失败时退回手动选科目
 * ============================================================================
 */
/* ---------------- OCR 引擎（懒加载） ----------------
 * tesseract.js 体积较大，改为首次识别时才动态 import，
 * 避免拖慢首屏，也让构建工具自动把它拆成独立 chunk 按需加载。
 */
let tesseractModule = null

async function getTesseract() {
  if (!tesseractModule) {
    tesseractModule = await import('tesseract.js')
  }
  return tesseractModule
}

/** 懒加载的识别 worker（首次调用时才创建，避免拖慢首屏） */
let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    const { createWorker } = await getTesseract()
    // chi_sim = 简体中文。logger 只保留识别进度，避免刷爆控制台
    workerPromise = createWorker('chi_sim', 1, {
      logger: (m) => { if (m.status === 'recognizing text') console.log(`[ocr] 识别中 ${Math.round(m.progress * 100)}%`) }
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/**
 * 识别图片中的文字。
 * @param {HTMLCanvasElement} canvas 预处理后的题目图片
 * @returns {Promise<string>} 识别出的文字（失败返回空字符串，绝不抛错）
 */
export async function recognizeText(canvas) {
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(canvas)
    const text = (data.text || '').replace(/\s+/g, ' ').trim()
    console.log(`[ocr] ✅ 识别完成：${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`)
    return text
  } catch (error) {
    // 常见原因：语言包下载失败（网络受限）、浏览器不支持
    console.warn('[ocr] ⚠️ 识别失败（不影响红笔判定和错题收录）：', error.message || error)
    return ''
  }
}

/* ---------------- 科目关键词库：用识别出的文字猜科目 ---------------- */

const SUBJECT_KEYWORDS = {
  常识判断: ['宪法', '科举', '节气', '京剧', '光年', '朝代', '天文', '地理', '法律', '历史', '科技', '人文'],
  言语理解: ['成语', '病句', '填空', '排序', '段落', '主旨', '语句', '词语', '下列句子', '成语使用'],
  数量关系: ['工程', '行程', '浓度', '利润', '数列', '鸡兔', '百分比', '倍数', '平均', '概率', '排列'],
  判断推理: ['推理', '图形', '类比', '定义', '逻辑', '论证', '直言', '命题', '如果', '那么', '所有'],
  资料分析: ['增长率', '比重', '百分点', 'GDP', '产量', '销量', '同比', '环比', '平均数', '统计'],
  申论: ['申论', '材料', '概括', '对策', '公文', '作文', '标题', '发文', '基层', '治理', '根据给定资料']
}

/**
 * 根据识别文字猜测科目（命中关键词最多的科目胜出）。
 * @param {string} text OCR 识别结果
 * @returns {string} 科目名；猜不出返回空字符串（UI 退回手动选择）
 */
export function detectSubject(text) {
  if (!text) return ''
  let bestSubject = ''
  let bestScore = 0
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    const score = keywords.reduce((n, kw) => (text.includes(kw) ? n + 1 : n), 0)
    if (score > bestScore) {
      bestScore = score
      bestSubject = subject
    }
  }
  if (bestSubject) {
    console.log(`[ocr] 🏷️ 科目判定：${bestSubject}（命中 ${bestScore} 个关键词）`)
  }
  return bestSubject
}

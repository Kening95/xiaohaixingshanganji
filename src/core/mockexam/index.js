/**
 * ============================================================================
 * 错题专属模拟卷 —— core/mockexam/index.js（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   一键把"最近 30 天的错题"自动重组成一份空白模拟卷 PDF：
 *   去重 → 按真实公考行测题型比例分配科目题量 → 生成适配 A4 打印的 PDF。
 *   打印出来就是一份"只属于自己的薄弱点试卷"，配合手写重做效果最好。
 *
 * 组卷规则（行测真实题型比例，全国联考通用口径）：
 *   言语理解 30% ｜ 判断推理 25% ｜ 常识判断 15% ｜
 *   数量关系 15% ｜ 资料分析 15%
 *   （实际题量按"该科目可用错题数"等比缩放，某科错题少就占比小，
 *     一份卷子里同科题目保持相对比例一致。）
 *
 * 去重规则：
 *   以题图内容哈希为准（同一张照片重复导入只算一道）；
 *   哈希是简易字符串哈希，用于"同图判重"足够，不用于安全场景。
 *
 * PDF 生成：jsPDF 库（纯前端生成，无需服务器），A4 竖版。
 *   懒加载：用到才下载 jsPDF 代码（约 300KB），不影响首屏速度。
 * ============================================================================
 */
import { useWrongbook } from '@/core/wrongbook'

/** 行测题型比例（公考联考通用结构） */
export const EXAM_RATIO = [
  { subject: '言语理解', ratio: 0.30 },
  { subject: '判断推理', ratio: 0.25 },
  { subject: '常识判断', ratio: 0.15 },
  { subject: '数量关系', ratio: 0.15 },
  { subject: '资料分析', ratio: 0.15 }
]

/** 简易字符串哈希（FNV-1a 变体）：同一张图的 dataURL 得到同一个值 */
function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * 拉取最近 N 天的错题并去重。
 * @param {number} days 窗口天数（需求：30 天）
 * @returns {Array} 去重后的错题条目（按收录时间新→旧）
 */
export function collectRecentWrongs(days = 30) {
  const now = Date.now()
  const seen = new Set()
  return useWrongbook().value
    .filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) <= days * 86400000)
    .filter((e) => {
      const key = `${e.subject}#${hashString(e.image || e.id)}` // 科目 + 题图哈希 双重判重
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * 按行测题型比例把错题分成"模拟卷科目区块"。
 * @param {Array} wrongs collectRecentWrongs() 的结果
 * @param {number} maxQuestions 卷子总题量上限（默认 40，够写满一套小题卷）
 * @returns {Object} 组卷结果 { sections: [{subject, ratio, questions}], total }
 */
export function assembleMockExam(wrongs, maxQuestions = 40) {
  // 按科目把错题分组
  const bySubject = {}
  for (const w of wrongs) {
    bySubject[w.subject] ||= []
    bySubject[w.subject].push(w)
  }

  const available = EXAM_RATIO.filter((r) => bySubject[r.subject]?.length > 0)
  if (available.length === 0) {
    return { sections: [], total: 0, generatedAt: new Date().toISOString() }
  }

  // 只统计"有错题的科目"内部的比例，保持它们之间的相对结构
  const ratioSum = available.reduce((n, r) => n + r.ratio, 0)
  const sections = available.map((r) => {
    const questions = bySubject[r.subject].slice(0, maxQuestions) // 该科全部可用错题（上限内）
    return { subject: r.subject, ratio: Math.round(r.ratio / ratioSum * 100) / 100, questions }
  })

  return {
    title: '粉蹄错题专属模拟卷',
    sections,
    total: sections.reduce((n, s) => n + s.questions.length, 0),
    generatedAt: new Date().toISOString()
  }
}

/**
 * 用 jsPDF 组装模拟卷文档（纯排版，不触发下载）。
 * 拆成独立函数是为了：① 自测页可以直接验证排版结果；② 下载只是最后一步。
 *
 * @param {Object} exam assembleMockExam() 的结果
 * @returns {Promise<import('jspdf').jsPDF>} 组装好的 PDF 文档对象
 */
export async function buildExamDoc(exam) {
  const { jsPDF } = await import('jspdf') // 懒加载：用到才下载 PDF 引擎
  if (!exam?.sections?.length) throw new Error('[mockexam] 没有可用错题，无法组卷')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) // A4：210 × 297 mm
  const pageWidth = 210
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = 0

  /** 内容写不下时自动换页（A4 内容区高约 267mm，底部留 15mm 边距） */
  const ensureSpace = (need) => {
    if (y + need > 282) { doc.addPage(); y = margin }
  }

  /* ---------- 卷头 ---------- */
  doc.setFontSize(18)
  doc.text(exam.title, pageWidth / 2, y = 20, { align: 'center' })
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(`组卷时间：${exam.generatedAt.slice(0, 16).replace('T', ' ')}　｜　共 ${exam.total} 题　｜　闭卷重做，做完回错题本攻克核对`, pageWidth / 2, y = 28, { align: 'center' })
  doc.setTextColor(0)
  doc.setDrawColor(255, 184, 108) // 暖橙分隔线（品牌辅助色）
  doc.setLineWidth(0.8)
  doc.line(margin, y = 32, pageWidth - margin, 32)
  y = 40

  /* ---------- 逐科目分区 ---------- */
  let questionNo = 1
  for (const section of exam.sections) {
    ensureSpace(20)
    // 分区标题：科目 + 占比
    doc.setFillColor(230, 244, 255) // 品牌主色 #E6F4FF
    doc.rect(margin, y - 6, contentWidth, 10, 'F')
    doc.setFontSize(13)
    doc.text(`【${section.subject}】（本区 ${section.questions.length} 题）`, margin + 3, y)
    y += 12

    for (const q of section.questions) {
      // 题号
      ensureSpace(15)
      doc.setFontSize(11)
      doc.text(`${questionNo}. （收录于 ${q.date}）`, margin, y)
      questionNo++
      y += 4

      // 题图：等比缩放到内容宽度内，最高 110mm（防止一页被一张图占满）
      if (q.image?.startsWith('data:image')) {
        try {
          const props = doc.getImageProperties(q.image)
          const scale = Math.min(contentWidth / props.width, 110 / props.height, 1)
          const w = props.width * scale
          const h = props.height * scale
          ensureSpace(h + 4)
          doc.addImage(q.image, props.fileType || 'JPEG', margin, y, w, h)
          y += h + 4
        } catch (error) {
          console.warn('[mockexam] 题图嵌入失败，改为文字占位：', error)
          doc.setFontSize(9)
          doc.setTextColor(150)
          doc.text('（题图加载失败，请回错题本查看原题）', margin, y)
          doc.setTextColor(0)
          y += 6
        }
      }

      // 重做答题区：3 行横线
      ensureSpace(18)
      doc.setDrawColor(200)
      doc.setLineWidth(0.2)
      for (let i = 0; i < 3; i++) {
        doc.line(margin + 2, y, pageWidth - margin - 2, y)
        y += 6
      }
      y += 4
    }
  }

  /* ---------- 卷尾小贴士 ---------- */
  ensureSpace(16)
  doc.setFontSize(9)
  doc.setTextColor(150)
  doc.text('做完后回到「电子错题本」逐题攻克，每攻克一道 +1 金币，小怪兽全部消灭！', pageWidth / 2, y, { align: 'center' })

  return doc
}

/**
 * 生成并下载 A4 空白模拟卷 PDF。
 * 版式：页眉（卷名 + 日期）→ 分区大标题 → 每题"题图 + 重做横线"。
 * 空白卷 = 不带答案（答案在错题本里攻克时自己核对）。
 *
 * @param {Object} exam assembleMockExam() 的结果
 * @returns {Promise<boolean>} 成功返回 true
 */
export async function downloadMockExamPdf(exam) {
  if (!exam.sections?.length) return false
  const doc = await buildExamDoc(exam)
  const filename = `粉蹄错题模拟卷_${new Date().toLocaleDateString('sv-SE')}.pdf`
  doc.save(filename)
  console.log(`[mockexam] 📄 模拟卷已导出：${filename}（${exam.total} 题）`)
  return true
}

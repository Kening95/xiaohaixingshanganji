/**
 * ============================================================================
 * 知识点题库 —— core/data/questions.js
 * ----------------------------------------------------------------------------
 * 每日小测（5 道题）的题目来源。按六大科目分组，每题包含：
 *   question  题干
 *   options   4 个选项
 *   answer    正确选项的下标（0~3）
 *   knowledge 知识点名称（答对时收集"考点小海星"用）
 *
 * 扩充题库：照着 QUESTION_BANK 里的格式往里加对象即可，
 * 出题逻辑会自动从新题里随机抽题，其他代码一行不用改。
 * ============================================================================
 */
export const QUESTION_BANK = [
  /* ---------------- 常识判断 ---------------- */
  {
    id: 'cs-01', subject: '常识判断',
    question: '我国现行宪法颁布于哪一年？',
    options: ['1954 年', '1975 年', '1982 年', '2004 年'],
    answer: 2, knowledge: '现行宪法年份'
  },
  {
    id: 'cs-02', subject: '常识判断',
    question: '科举制度正式创立于哪个朝代？',
    options: ['汉朝', '隋朝', '唐朝', '宋朝'],
    answer: 1, knowledge: '科举制度起源'
  },
  {
    id: 'cs-03', subject: '常识判断',
    question: '"光年"是什么物理量的单位？',
    options: ['时间', '速度', '长度', '亮度'],
    answer: 2, knowledge: '光年是长度单位'
  },
  {
    id: 'cs-04', subject: '常识判断',
    question: '京剧脸谱中，白脸通常代表人物性格是？',
    options: ['忠勇正直', '奸诈多疑', '刚正不阿', '豪爽粗犷'],
    answer: 1, knowledge: '京剧脸谱含义'
  },
  {
    id: 'cs-05', subject: '常识判断',
    question: '二十四节气中，"夏至"之后的下一个节气是？',
    options: ['小暑', '大暑', '芒种', '立秋'],
    answer: 0, knowledge: '二十四节气顺序'
  },

  /* ---------------- 言语理解 ---------------- */
  {
    id: 'yw-01', subject: '言语理解',
    question: '成语"相得益彰"的意思是？',
    options: ['互相配合，双方优点更加突出', '互相攀比，互不相让', '彼此抵消，效果归零', '各自为政，互不干涉'],
    answer: 0, knowledge: '成语"相得益彰"'
  },
  {
    id: 'yw-02', subject: '言语理解',
    question: '下列句子中，没有语病的一项是？',
    options: ['通过这次培训，使我掌握了答题方法。', '能否坚持刷题，是提分的关键。', '他每天背常识，积累了不少时政热点。', '为了防止不再迟到，他定了三个闹钟。'],
    answer: 2, knowledge: '病句辨析（缺主语/两面对一面/否定不当）'
  },
  {
    id: 'yw-03', subject: '言语理解',
    question: '"空穴来风"的本义是？',
    options: ['毫无根据的谣言', '消息的传播有根据', '空穴中有风吹出', '形容通风良好'],
    answer: 1, knowledge: '"空穴来风"本义'
  },
  {
    id: 'yw-04', subject: '言语理解',
    question: '选词填空："当前的就业形势非常___。"',
    options: ['严厉', '严峻', '严格', '严肃'],
    answer: 1, knowledge: '"严峻"与"严厉"辨析'
  },
  {
    id: 'yw-05', subject: '言语理解',
    question: '"莘莘学子"中的"莘莘"是什么意思？',
    options: ['勤奋', '众多', '优秀', '年轻'],
    answer: 1, knowledge: '"莘莘"词义'
  },

  /* ---------------- 数量关系 ---------------- */
  {
    id: 'sl-01', subject: '数量关系',
    question: '1 + 2 + 3 + … + 100 = ？',
    options: ['4950', '5000', '5050', '5100'],
    answer: 2, knowledge: '等差数列求和'
  },
  {
    id: 'sl-02', subject: '数量关系',
    question: '一项工程，甲单独做 10 天完成，乙单独做 15 天完成，两人合作需要几天？',
    options: ['5 天', '6 天', '7 天', '8 天'],
    answer: 1, knowledge: '工程问题（合作效率）'
  },
  {
    id: 'sl-03', subject: '数量关系',
    question: '等差数列 2，5，8，… 的第 10 项是？',
    options: ['26', '27', '29', '32'],
    answer: 2, knowledge: '等差数列通项'
  },
  {
    id: 'sl-04', subject: '数量关系',
    question: '20% 的 80 是多少？',
    options: ['8', '16', '20', '160'],
    answer: 1, knowledge: '百分数计算'
  },
  {
    id: 'sl-05', subject: '数量关系',
    question: '鸡兔同笼：头共 10 个，脚共 28 只，鸡有几只？',
    options: ['4 只', '5 只', '6 只', '7 只'],
    answer: 2, knowledge: '鸡兔同笼问题'
  },

  /* ---------------- 判断推理 ---------------- */
  {
    id: 'pd-01', subject: '判断推理',
    question: '所有猫都是动物，所有动物都会动。由此可以推出？',
    options: ['所有会动的都是猫', '猫会动', '有些动物不是猫', '有些猫不是动物'],
    answer: 1, knowledge: '直言命题推理'
  },
  {
    id: 'pd-02', subject: '判断推理',
    question: '类比推理：医生 ∶ 医院，相当于 教师 ∶ ？',
    options: ['学生', '学校', '课本', '教室'],
    answer: 1, knowledge: '类比推理（职业与场所）'
  },
  {
    id: 'pd-03', subject: '判断推理',
    question: '"如果下雨，地面就会湿。现在地面湿了，所以一定下雨了。"这个推理？',
    options: ['完全正确', '犯了"肯定后件"的逻辑错误', '犯了"否定前件"的逻辑错误', '无法判断'],
    answer: 1, knowledge: '假言推理错误类型'
  },
  {
    id: 'pd-04', subject: '判断推理',
    question: '同一平面内，不相交的两条直线叫做？',
    options: ['垂线', '平行线', '相交线', '异面直线'],
    answer: 1, knowledge: '平行线定义'
  },
  {
    id: 'pd-05', subject: '判断推理',
    question: '已知 A 比 B 高，B 比 C 高，那么可以推出？',
    options: ['C 比 A 高', 'A 比 C 高', 'A 和 C 一样高', '无法比较 A 和 C'],
    answer: 1, knowledge: '传递性关系推理'
  },

  /* ---------------- 资料分析 ---------------- */
  {
    id: 'zl-01', subject: '资料分析',
    question: '某市 2025 年 GDP 为 1000 亿元，2024 年为 800 亿元，2025 年同比增长了多少？',
    options: ['20%', '25%', '80%', '125%'],
    answer: 1, knowledge: '增长率计算'
  },
  {
    id: 'zl-02', subject: '资料分析',
    question: '全班 60 人，男生 30 人，男生占全班人数的？',
    options: ['30%', '40%', '50%', '60%'],
    answer: 2, knowledge: '比重计算'
  },
  {
    id: 'zl-03', subject: '资料分析',
    question: '某店 5 天销量分别为 10、20、30、40、50 件，平均每天销量为？',
    options: ['20 件', '25 件', '30 件', '35 件'],
    answer: 2, knowledge: '平均数计算'
  },
  {
    id: 'zl-04', subject: '资料分析',
    question: '某厂 2025 年产量 120 吨，2024 年产量 60 吨，2025 年是 2024 年的几倍？',
    options: ['1 倍', '2 倍', '3 倍', '60 倍'],
    answer: 1, knowledge: '倍数计算'
  },
  {
    id: 'zl-05', subject: '资料分析',
    question: '某指标增长率由 10% 提高到 15%，可以说提高了多少？',
    options: ['提高了 5%', '提高了 5 个百分点', '提高了 50 个百分点', '提高了 10%'],
    answer: 1, knowledge: '"百分点"概念'
  },

  /* ---------------- 申论 ---------------- */
  {
    id: 'sp-01', subject: '申论',
    question: '申论作答的首要原则是？',
    options: ['自由发挥，展示文采', '依据给定材料作答', '背诵模板直接套用', '尽量多写覆盖考点'],
    answer: 1, knowledge: '申论材料为王原则'
  },
  {
    id: 'sp-02', subject: '申论',
    question: '归纳概括题最核心的要求是？',
    options: ['语言华丽', '全面、准确', '字数越多越好', '观点标新立异'],
    answer: 1, knowledge: '归纳概括评分标准'
  },
  {
    id: 'sp-03', subject: '申论',
    question: '公文标题的三要素不包括？',
    options: ['发文机关', '事由', '文种', '落款日期'],
    answer: 3, knowledge: '公文标题三要素'
  },
  {
    id: 'sp-04', subject: '申论',
    question: '提出对策题中，对策最基本的要求是？',
    options: ['角度新颖', '针对问题且切实可行', '引用名言警句', '对仗工整'],
    answer: 1, knowledge: '对策可行性要求'
  },
  {
    id: 'sp-05', subject: '申论',
    question: '申论大作文立意的最佳来源是？',
    options: ['考生个人经历', '材料主旨与命题人意图', '网络热门观点', '押题范文'],
    answer: 1, knowledge: '大作文立意来源'
  }
]

/**
 * 给某一天出 5 道题。出题优先级（从高到低）：
 *   ① 当日扫题上传的错题涉及哪些科目 → 今天实际练了哪里，就优先考哪里；
 *   ② 当天任务涉及科目的题；
 *   ③ 全题库兜底补齐。
 *
 * 兼容旧调用：第三参数不传时退化为 ②→③ 两级优先，行为与之前完全一致。
 *
 * @param {Object[]} dayTasks      当天任务列表（用来确定当天学过哪些科目）
 * @param {number}   [count=5]     出题数量
 * @param {Object[]} [uploadedEntries=[]] 当天扫题收录的错题条目（wrongbook 条目，含 subject 字段）
 * @returns {Object[]} count 道题目（随机排序）
 */
export function pickQuestions(dayTasks, count = 5, uploadedEntries = []) {
  // 第一优先：当日上传错题涉及哪些科目（去重、过滤空科目）
  const uploadedSubjects = [...new Set((uploadedEntries || []).map((e) => e.subject).filter(Boolean))]
  // 第二优先：当天任务涉及哪些科目（去重）
  const daySubjects = [...new Set(dayTasks.map((t) => t.subject))]

  // 三层候选池，互不重叠：上传科目池 > 当天任务科目池 > 全库兜底池
  const uploadedPool = QUESTION_BANK.filter((q) => uploadedSubjects.includes(q.subject))
  const subjectPool = QUESTION_BANK.filter(
    (q) => !uploadedSubjects.includes(q.subject) && daySubjects.includes(q.subject)
  )
  const restPool = QUESTION_BANK.filter(
    (q) => !uploadedSubjects.includes(q.subject) && !daySubjects.includes(q.subject)
  )

  // 洗牌工具：Fisher-Yates，抽题更随机
  const shuffle = (arr) => {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  // 先抽当日上传科目的题，再抽当天任务科目的题，最后全库补齐，洗乱顺序
  const picked = [...shuffle(uploadedPool), ...shuffle(subjectPool), ...shuffle(restPool)].slice(0, count)
  return shuffle(picked)
}

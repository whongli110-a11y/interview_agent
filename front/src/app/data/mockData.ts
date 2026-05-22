export type InterviewCard = {
  id: string;
  title: string;
  mode: "technical" | "behavioral" | "mixed";
  role: string;
  score: number;
  createdAt: string;
  weakPoints: string[];
  status: "completed" | "in_progress" | "draft";
  duration: number;
  questionCount: number;
};

export type DocumentCard = {
  id: string;
  filename: string;
  type: "resume" | "jd" | "project" | "other";
  parseStatus: "pending" | "processing" | "completed" | "failed";
  indexed: boolean;
  chunkCount: number;
  createdAt: string;
  size: string;
};

export type InterviewReportView = {
  id: string;
  title: string;
  date: string;
  mode: string;
  role: string;
  totalScore: number;
  dimensionScores: {
    technicalAccuracy: number;
    projectClarity: number;
    jobFit: number;
    structure: number;
    followUpHandling: number;
    behavioral: number;
  };
  topSuggestions: string[];
  questionReviews: {
    id: string;
    question: string;
    tag: string;
    answerSummary: string;
    evaluation: string;
    score: number;
    issues: string[];
    betterAnswerDirection: string;
  }[];
  resumeSuggestions: string[];
  nextTrainingPlan: string[];
};

export const mockInterviews: InterviewCard[] = [
  {
    id: "1",
    title: "后端开发技术面（中等难度）",
    mode: "technical",
    role: "后端开发",
    score: 78,
    createdAt: "2026-05-20",
    weakPoints: ["系统设计", "数据库优化"],
    status: "completed",
    duration: 30,
    questionCount: 8,
  },
  {
    id: "2",
    title: "算法 + 行为面综合（挑战难度）",
    mode: "mixed",
    role: "算法工程师",
    score: 65,
    createdAt: "2026-05-15",
    weakPoints: ["追问应对", "项目量化表达"],
    status: "completed",
    duration: 45,
    questionCount: 10,
  },
  {
    id: "3",
    title: "前端开发技术面",
    mode: "technical",
    role: "前端开发",
    score: 82,
    createdAt: "2026-05-10",
    weakPoints: ["性能优化细节"],
    status: "completed",
    duration: 20,
    questionCount: 6,
  },
];

export const mockDocuments: DocumentCard[] = [
  {
    id: "r1",
    filename: "李明_简历_2026.pdf",
    type: "resume",
    parseStatus: "completed",
    indexed: true,
    chunkCount: 12,
    createdAt: "2026-05-18",
    size: "245 KB",
  },
  {
    id: "j1",
    filename: "字节跳动_后端开发_JD.pdf",
    type: "jd",
    parseStatus: "completed",
    indexed: true,
    chunkCount: 8,
    createdAt: "2026-05-19",
    size: "89 KB",
  },
  {
    id: "j2",
    filename: "阿里云_算法工程师_JD.pdf",
    type: "jd",
    parseStatus: "completed",
    indexed: false,
    chunkCount: 9,
    createdAt: "2026-05-21",
    size: "102 KB",
  },
  {
    id: "p1",
    filename: "毕业项目_分布式存储系统.docx",
    type: "project",
    parseStatus: "completed",
    indexed: true,
    chunkCount: 23,
    createdAt: "2026-05-17",
    size: "1.2 MB",
  },
  {
    id: "p2",
    filename: "实习项目_推荐系统优化.md",
    type: "project",
    parseStatus: "failed",
    indexed: false,
    chunkCount: 0,
    createdAt: "2026-05-20",
    size: "34 KB",
  },
];

export const mockReport: InterviewReportView = {
  id: "1",
  title: "后端开发技术面（中等难度）",
  date: "2026-05-20",
  mode: "技术面",
  role: "后端开发",
  totalScore: 78,
  dimensionScores: {
    technicalAccuracy: 82,
    projectClarity: 74,
    jobFit: 80,
    structure: 70,
    followUpHandling: 65,
    behavioral: 85,
  },
  topSuggestions: [
    "系统设计题缺乏容量估算和故障处理方案，建议补充「规模估算」思维框架",
    "项目描述中技术收益未量化，如「优化了响应时间」需补充具体数据（如 P99 从 200ms 降至 80ms）",
    "追问时应对不够流畅，建议练习 STAR 法则，先结论后展开",
  ],
  questionReviews: [
    {
      id: "q1",
      question: "请介绍你在毕业设计分布式存储系统中的核心贡献和遇到的最大挑战？",
      tag: "项目深挖",
      answerSummary: "介绍了系统架构设计和 Raft 一致性协议实现，提到了分片策略。对挑战的描述较为笼统，未给出具体数据支撑。",
      evaluation: "回答结构清晰，技术内容准确，但缺乏量化指标和问题解决过程的细节",
      score: 72,
      issues: ["缺少性能数据量化", "挑战描述过于笼统", "未说明个人贡献 vs 团队贡献"],
      betterAnswerDirection: "明确个人负责模块（如「我负责 Raft 实现和 Leader 选举」），给出具体数据（如「写入吞吐提升 3x，P99 延迟控制在 50ms 内」），并说明解决过程中的具体决策",
    },
    {
      id: "q2",
      question: "MySQL 中 B+ 树索引和哈希索引各适合什么场景？",
      tag: "技术基础",
      answerSummary: "正确区分了两者的适用场景，B+树适合范围查询，哈希索引适合等值查询。提到了聚簇索引和非聚簇索引的区别。",
      evaluation: "基础概念掌握扎实，回答完整，稍可补充实际选择时的考量",
      score: 88,
      issues: ["可以补充实际使用场景中的选型建议"],
      betterAnswerDirection: "可补充：「在高并发等值查询场景（如缓存穿透防护），哈希索引更优；但 MySQL InnoDB 默认使用 B+树，哈希索引仅 Memory 引擎支持，生产中较少直接使用」",
    },
    {
      id: "q3",
      question: "如果你的服务某天请求量突增 10 倍，你会如何应对？",
      tag: "系统设计",
      answerSummary: "提到了水平扩展、缓存层和限流熔断，但缺乏具体的执行顺序和容量规划思路。",
      evaluation: "方向正确但缺乏系统性，建议建立「诊断 → 短期处置 → 中期优化」框架",
      score: 65,
      issues: ["缺乏优先级排序", "未提容量估算", "故障回滚方案未提及"],
      betterAnswerDirection: "先分析流量来源（正常增长 vs 异常攻击），再按时间线处置：立即（限流、降级）→ 短期（扩容、缓存预热）→ 中期（架构优化、异步解耦），给出每步的具体指标触发条件",
    },
  ],
  resumeSuggestions: [
    "分布式存储系统项目：缺少量化结果，建议补充「提升写入吞吐 3x，P99 延迟 < 50ms」等数据",
    "推荐系统实习经历：技术细节不足，建议说明具体算法选型和 A/B 测试结果",
    "技能栏与 JD 匹配弱：JD 要求 Kubernetes 运维经验，简历未提及，建议补充相关项目或课程",
  ],
  nextTrainingPlan: [
    "系统设计专题：练习「容量估算 → 架构设计 → 故障处理」完整流程，推荐每周 1 题",
    "项目量化表达：针对每个项目提炼 2-3 个可量化指标，形成固定话术",
    "追问应对训练：针对面试官「为什么」「如果…会怎样」类追问做 5 轮专项练习",
  ],
};

export const mockMessages = [
  {
    id: "m1",
    role: "interviewer" as const,
    content: "你好，我是今天的面试官。我们先从你的项目经历聊起。请介绍一下你在毕业设计中做的分布式存储系统，重点说说你的核心贡献和遇到的最大挑战。",
    tag: "项目深挖",
    timestamp: "10:02",
  },
  {
    id: "m2",
    role: "user" as const,
    content: "好的，我的毕业设计是一个基于 Raft 协议的分布式键值存储系统。我主要负责了一致性层的实现，包括 Leader 选举、日志复制和快照机制。最大的挑战是在网络分区场景下保证一致性，我们通过...测试验证了系统在各种故障场景下的正确性。",
    timestamp: "10:04",
  },
  {
    id: "m3",
    role: "interviewer" as const,
    content: "你提到了日志复制，能具体说说你们的日志压缩策略是怎么设计的吗？特别是快照的触发时机和存储方式。",
    tag: "追问",
    isFollowUp: true,
    timestamp: "10:05",
  },
];

export const historyTrendData = [
  { date: "5月1日", score: 58, technical: 55, project: 60, jobFit: 58 },
  { date: "5月5日", score: 63, technical: 62, project: 65, jobFit: 62 },
  { date: "5月10日", score: 72, technical: 75, project: 70, jobFit: 72 },
  { date: "5月15日", score: 65, technical: 68, project: 62, jobFit: 65 },
  { date: "5月20日", score: 78, technical: 82, project: 74, jobFit: 80 },
];

export const weakPointFrequency = [
  { name: "系统设计", count: 4 },
  { name: "项目量化", count: 3 },
  { name: "追问应对", count: 3 },
  { name: "数据库优化", count: 2 },
  { name: "算法时复", count: 1 },
];

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Play,
  AlertCircle,
  CheckCircle2,
  FileText,
  Briefcase,
  FolderOpen,
  ChevronDown,
  Info,
  Loader2,
} from "lucide-react";
import { documentsApi, type ApiDocument } from "../../api/documents";
import { interviewsApi, type CreateInterviewRequest } from "../../api/interviews";
import { ApiError } from "../../api/client";

type InterviewType = "technical" | "behavioral" | "mixed";
type Difficulty = "basic" | "medium" | "challenge";
type Duration = 10 | 20 | 30;
type LanguageStyle = "formal" | "friendly" | "pressure";
type RoleDirection =
  | "backend"
  | "frontend"
  | "algorithm"
  | "data"
  | "ai"
  | "fullstack";

interface Config {
  type: InterviewType;
  role: RoleDirection;
  jdId: string;
  difficulty: Difficulty;
  duration: Duration;
  followUp: boolean;
  referenceAnswer: boolean;
  languageStyle: LanguageStyle;
}

const roleLabels: Record<RoleDirection, string> = {
  backend: "后端开发",
  frontend: "前端开发",
  algorithm: "算法工程师",
  data: "数据分析",
  ai: "AI 应用开发",
  fullstack: "全栈开发",
};

const roleDirectionCN: Record<RoleDirection, string> = {
  backend: "后端开发工程师",
  frontend: "前端开发工程师",
  algorithm: "算法工程师",
  data: "数据分析师",
  ai: "AI 应用开发工程师",
  fullstack: "全栈开发工程师",
};

/** Frontend "challenge" maps to backend "hard" */
const difficultyMap: Record<Difficulty, "basic" | "medium" | "hard"> = {
  basic: "basic",
  medium: "medium",
  challenge: "hard",
};

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-[#E5E7EB] rounded overflow-hidden">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-[13px] font-medium transition-colors ${
            value === opt.value
              ? "bg-[#2563EB] text-white"
              : "bg-white text-[#374151] hover:bg-[#F9FAFB]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? "bg-[#2563EB]" : "bg-[#D1D5DB]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const estimatedQuestions: Record<InterviewType, Record<Duration, number>> = {
  technical: { 10: 4, 20: 7, 30: 10 },
  behavioral: { 10: 3, 20: 5, 30: 8 },
  mixed: { 10: 4, 20: 7, 30: 12 },
};

const coverageTopics: Record<InterviewType, string[]> = {
  technical: ["数据结构与算法", "系统设计", "数据库", "并发与锁", "网络基础"],
  behavioral: ["项目经历", "冲突处理", "团队协作", "职业规划", "学习能力"],
  mixed: ["技术基础", "系统设计", "项目经历", "岗位匹配", "行为能力"],
};

export function InterviewSetup() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [config, setConfig] = useState<Config>({
    type: "mixed",
    role: "backend",
    jdId: "",
    difficulty: "medium",
    duration: 20,
    followUp: true,
    referenceAnswer: true,
    languageStyle: "formal",
  });

  useEffect(() => {
    documentsApi
      .list()
      .then((data) => {
        setDocs(data);
        // Pre-select first JD if available
        const firstJd = data.find((d) => d.source_type === "jd" && d.parse_status === "completed");
        if (firstJd) {
          setConfig((prev) => ({ ...prev, jdId: firstJd.id }));
        }
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, []);

  const update = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const jdDocs = docs.filter((d) => d.source_type === "jd" && d.parse_status === "completed");
  const hasResume = docs.some(
    (d) => d.source_type === "resume" && d.parse_status === "completed"
  );
  const hasProject = docs.some(
    (d) => d.source_type === "project" && d.parse_status === "completed"
  );
  const canStart = hasResume && !starting;
  const hasJd = config.jdId !== "";

  const qCount = estimatedQuestions[config.type][config.duration];
  const topics = coverageTopics[config.type];

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const req: CreateInterviewRequest = {
        user_id: "default",
        mode: config.type,
        role_direction: roleDirectionCN[config.role],
        difficulty: difficultyMap[config.difficulty],
        duration_minutes: config.duration,
        max_questions: qCount,
        enable_follow_up: config.followUp,
      };
      const res = await interviewsApi.create(req);
      navigate(`/interviews/${res.session_id}`, {
        state: {
          question: res.question,
          mode: config.type,
          role: roleLabels[config.role],
          maxQuestions: qCount,
          difficulty: config.difficulty,
        },
      });
    } catch (err) {
      setStartError(
        err instanceof ApiError ? err.message : "创建面试失败，请检查后端服务是否启动"
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold text-[#111827]">配置模拟面试</h1>
        <p className="text-[14px] text-[#6B7280] mt-0.5">调整参数后点击「开始模拟面试」</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Config form - 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          {/* Interview type */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <label className="block text-[13px] font-medium text-[#374151] mb-2">面试类型</label>
            <SegmentedControl
              options={[
                { label: "技术面", value: "technical" as InterviewType },
                { label: "综合面", value: "behavioral" as InterviewType },
                { label: "技术 + 综合", value: "mixed" as InterviewType },
              ]}
              value={config.type}
              onChange={(v) => update("type", v)}
            />
          </div>

          {/* Role direction */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <label className="block text-[13px] font-medium text-[#374151] mb-2">岗位方向</label>
            <div className="relative">
              <select
                value={config.role}
                onChange={(e) => update("role", e.target.value as RoleDirection)}
                className="w-full appearance-none border border-[#E5E7EB] rounded px-3 py-2 text-[14px] text-[#111827] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
              >
                {Object.entries(roleLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
              />
            </div>
          </div>

          {/* Target JD */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <label className="block text-[13px] font-medium text-[#374151] mb-2">目标 JD</label>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-[#9CA3AF] py-2">
                <Loader2 size={13} className="animate-spin" />
                加载中...
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <select
                    value={config.jdId}
                    onChange={(e) => update("jdId", e.target.value)}
                    className="w-full appearance-none border border-[#E5E7EB] rounded px-3 py-2 text-[14px] text-[#111827] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                  >
                    <option value="">不指定 JD（使用通用岗位能力）</option>
                    {jdDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.filename}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
                  />
                </div>
                {!hasJd && (
                  <div className="flex items-start gap-1.5 text-[12px] text-[#D97706]">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    将基于简历和通用岗位能力生成问题，建议上传 JD 提升匹配度
                  </div>
                )}
              </>
            )}
          </div>

          {/* Difficulty */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <label className="block text-[13px] font-medium text-[#374151] mb-2">难度</label>
            <SegmentedControl
              options={[
                { label: "基础", value: "basic" as Difficulty },
                { label: "中等", value: "medium" as Difficulty },
                { label: "挑战", value: "challenge" as Difficulty },
              ]}
              value={config.difficulty}
              onChange={(v) => update("difficulty", v)}
            />
            <p className="text-[12px] text-[#9CA3AF] mt-2">
              {config.difficulty === "basic" && "适合初次练习，问题范围基础"}
              {config.difficulty === "medium" && "贴近实际面试，适合正式备考"}
              {config.difficulty === "challenge" && "高难度追问，模拟大厂压力面"}
            </p>
          </div>

          {/* Duration */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <label className="block text-[13px] font-medium text-[#374151] mb-2">时长</label>
            <SegmentedControl
              options={[
                { label: "10 分钟", value: 10 as Duration },
                { label: "20 分钟", value: 20 as Duration },
                { label: "30 分钟", value: 30 as Duration },
              ]}
              value={config.duration}
              onChange={(v) => update("duration", v)}
            />
          </div>

          {/* Advanced options */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 space-y-4">
            <h3 className="text-[13px] font-medium text-[#374151]">高级选项</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] text-[#111827]">追问模式</div>
                <div className="text-[12px] text-[#9CA3AF]">面试官会对回答进行深入追问</div>
              </div>
              <Toggle checked={config.followUp} onChange={(v) => update("followUp", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] text-[#111827]">参考答案</div>
                <div className="text-[12px] text-[#9CA3AF]">面试结束后在报告中生成</div>
              </div>
              <Toggle
                checked={config.referenceAnswer}
                onChange={(v) => update("referenceAnswer", v)}
              />
            </div>
            <div>
              <div className="text-[14px] text-[#111827] mb-2">语言风格</div>
              <div className="relative">
                <select
                  value={config.languageStyle}
                  onChange={(e) => update("languageStyle", e.target.value as LanguageStyle)}
                  className="w-full appearance-none border border-[#E5E7EB] rounded px-3 py-2 text-[14px] text-[#111827] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                >
                  <option value="formal">正式面试官</option>
                  <option value="friendly">友好教练</option>
                  <option value="pressure">压力面试</option>
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Start button */}
          <div>
            {!hasResume && !docsLoading && (
              <div className="mb-2 flex items-start gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded">
                <AlertCircle size={14} className="text-[#DC2626] mt-0.5 shrink-0" />
                <span className="text-[13px] text-[#DC2626]">需要先上传并解析简历才能开始面试</span>
              </div>
            )}
            {startError && (
              <div className="mb-2 flex items-start gap-2 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded">
                <AlertCircle size={14} className="text-[#DC2626] mt-0.5 shrink-0" />
                <span className="text-[13px] text-[#DC2626]">{startError}</span>
              </div>
            )}
            <button
              onClick={handleStart}
              disabled={!canStart || docsLoading}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded text-[15px] font-medium transition-colors ${
                canStart && !docsLoading
                  ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                  : "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
              }`}
            >
              {starting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {starting ? "正在初始化面试..." : "开始模拟面试"}
            </button>
          </div>
        </div>

        {/* Preview - 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* Interview preview */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <h3 className="text-[14px] font-semibold text-[#111827] mb-3">本次面试预览</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6B7280]">预计问题数</span>
                <span className="text-[13px] font-semibold text-[#111827]">{qCount} 题</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6B7280]">面试时长</span>
                <span className="text-[13px] font-semibold text-[#111827]">
                  {config.duration} 分钟
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6B7280]">岗位方向</span>
                <span className="text-[13px] font-semibold text-[#111827]">
                  {roleLabels[config.role]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6B7280]">追问</span>
                <span
                  className={`text-[13px] font-semibold ${
                    config.followUp ? "text-[#16A34A]" : "text-[#6B7280]"
                  }`}
                >
                  {config.followUp ? "已开启" : "已关闭"}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
              <div className="text-[12px] text-[#6B7280] mb-2">覆盖知识范围</div>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Resource status */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
            <h3 className="text-[14px] font-semibold text-[#111827] mb-3">资料准备状态</h3>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-[#9CA3AF]">
                <Loader2 size={13} className="animate-spin" />
                检查资料中...
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  {
                    label: "简历",
                    icon: FileText,
                    ok: hasResume,
                    msg: hasResume ? "已上传并解析" : "未上传，请先上传简历",
                  },
                  {
                    label: "目标 JD",
                    icon: Briefcase,
                    ok: hasJd,
                    msg: hasJd
                      ? jdDocs.find((d) => d.id === config.jdId)?.filename
                      : "未指定，将使用通用能力模型",
                  },
                  {
                    label: "项目资料",
                    icon: FolderOpen,
                    ok: hasProject,
                    msg: hasProject ? "已上传并入库" : "未上传，可补充以提升面试质量",
                  },
                ].map(({ label, icon: Icon, ok, msg }) => (
                  <div key={label} className="flex items-start gap-2">
                    {ok ? (
                      <CheckCircle2 size={14} className="text-[#16A34A] mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle size={14} className="text-[#D97706] mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="text-[13px] font-medium text-[#111827]">{label}</div>
                      <div
                        className={`text-[12px] ${ok ? "text-[#6B7280]" : "text-[#D97706]"} truncate max-w-[180px]`}
                      >
                        {msg}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-[#0284C7] mt-0.5 shrink-0" />
              <div className="space-y-1.5">
                <p className="text-[12px] text-[#0C4A6E]">面试过程中可以随时暂停，回答不会丢失</p>
                <p className="text-[12px] text-[#0C4A6E]">面试结束后自动生成结构化报告</p>
                <p className="text-[12px] text-[#0C4A6E]">
                  追问模式开启时，面试官会根据你的回答深入提问
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router";
import {
  Play,
  Upload,
  CheckCircle2,
  Circle,
  FileText,
  Briefcase,
  FolderOpen,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { mockInterviews, mockReport } from "../../data/mockData";

const radarData = [
  { subject: "技术准确性", A: 82, fullMark: 100 },
  { subject: "项目表达", A: 74, fullMark: 100 },
  { subject: "岗位匹配", A: 80, fullMark: 100 },
  { subject: "结构化表达", A: 70, fullMark: 100 },
  { subject: "追问应对", A: 65, fullMark: 100 },
  { subject: "综合素质", A: 85, fullMark: 100 },
];

const preparationItems = [
  { label: "简历已上传", done: true, icon: FileText },
  { label: "JD 已上传", done: true, icon: Briefcase },
  { label: "项目资料已上传", done: true, icon: FolderOpen },
  { label: "已完成模拟面试", done: true, count: 3, icon: MessageSquare },
];

const modeLabel: Record<string, string> = {
  technical: "技术面",
  behavioral: "行为面",
  mixed: "综合面",
};

const statusColors: Record<string, string> = {
  completed: "bg-[#DCFCE7] text-[#16A34A]",
  in_progress: "bg-[#DBEAFE] text-[#2563EB]",
  draft: "bg-[#F3F4F6] text-[#6B7280]",
};

const statusLabels: Record<string, string> = {
  completed: "已完成",
  in_progress: "进行中",
  draft: "草稿",
};

const trainingRecommendations = [
  {
    title: "系统设计专题训练",
    desc: "针对容量估算和故障处理薄弱点",
    tag: "强烈推荐",
    tagColor: "bg-[#FEF3C7] text-[#D97706]",
  },
  {
    title: "项目量化表达练习",
    desc: "提炼可量化指标并形成标准话术",
    tag: "推荐",
    tagColor: "bg-[#EFF6FF] text-[#2563EB]",
  },
  {
    title: "追问应对专项练习",
    desc: "STAR 法则应用和即兴追问响应",
    tag: "推荐",
    tagColor: "bg-[#EFF6FF] text-[#2563EB]",
  },
];

export function Dashboard() {
  const completedCount = mockInterviews.filter(i => i.status === "completed").length;
  const avgScore = Math.round(
    mockInterviews.filter(i => i.status === "completed").reduce((s, i) => s + i.score, 0) / completedCount
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#111827]">你好，李明 👋</h1>
          <p className="text-[14px] text-[#6B7280] mt-0.5">当前目标岗位：<span className="text-[#111827] font-medium">后端开发工程师</span></p>
        </div>
        <Link
          to="/interviews/new"
          className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
        >
          <Play size={15} />
          新建面试
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Preparation progress */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <h2 className="text-[15px] font-semibold text-[#111827] mb-4">备考进度</h2>
            <div className="space-y-3">
              {preparationItems.map(({ label, done, count, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 size={16} className="text-[#16A34A] shrink-0" />
                  ) : (
                    <Circle size={16} className="text-[#D1D5DB] shrink-0" />
                  )}
                  <Icon size={14} className="text-[#9CA3AF]" />
                  <span className={`text-[14px] ${done ? "text-[#111827]" : "text-[#9CA3AF]"}`}>
                    {label}
                    {count !== undefined && (
                      <span className="ml-1.5 text-[#2563EB] font-medium">{count} 次</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded p-3 flex items-start gap-2">
              <CheckCircle2 size={14} className="text-[#16A34A] mt-0.5 shrink-0" />
              <p className="text-[13px] text-[#166534]">资料齐全，可以开始个性化面试训练</p>
            </div>
          </div>

          {/* Recent interview summary */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#111827]">最近一次面试</h2>
              <Link to="/interviews/1/report" className="text-[13px] text-[#2563EB] hover:underline flex items-center gap-0.5">
                查看完整报告 <ChevronRight size={13} />
              </Link>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-center">
                <div className="text-[32px] font-bold text-[#111827] leading-none">{mockReport.totalScore}</div>
                <div className="text-[11px] text-[#6B7280] mt-1">综合评分</div>
              </div>
              <div className="flex-1 border-l border-[#E5E7EB] pl-4">
                <div className="text-[13px] text-[#6B7280] mb-1">{mockReport.title} · {mockReport.date}</div>
                <div className="space-y-1.5">
                  {mockReport.topSuggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle size={13} className="text-[#D97706] mt-0.5 shrink-0" />
                      <span className="text-[13px] text-[#374151]">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Training recommendations */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <h2 className="text-[15px] font-semibold text-[#111827] mb-4">专项训练推荐</h2>
            <div className="space-y-3">
              {trainingRecommendations.map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border border-[#E5E7EB] rounded hover:border-[#BFDBFE] hover:bg-[#F8FAFF] transition-colors cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#111827]">{t.title}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${t.tagColor}`}>{t.tag}</span>
                    </div>
                    <div className="text-[12px] text-[#6B7280] mt-0.5">{t.desc}</div>
                  </div>
                  <ArrowRight size={14} className="text-[#9CA3AF]" />
                </div>
              ))}
            </div>
          </div>

          {/* History list */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#111827]">历史面试</h2>
              <Link to="/history" className="text-[13px] text-[#2563EB] hover:underline flex items-center gap-0.5">
                查看全部 <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-2">
              {mockInterviews.map((interview) => (
                <div key={interview.id} className="flex items-center gap-3 p-3 border border-[#E5E7EB] rounded hover:bg-[#F9FAFB] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#111827] truncate">{interview.title}</span>
                      <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded ${statusColors[interview.status]}`}>
                        {statusLabels[interview.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[12px] text-[#6B7280]">{interview.createdAt}</span>
                      <span className="text-[12px] text-[#6B7280]">{modeLabel[interview.mode]}</span>
                      {interview.weakPoints.length > 0 && (
                        <span className="text-[12px] text-[#D97706]">薄弱：{interview.weakPoints[0]}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[18px] font-bold text-[#111827]">{interview.score}</div>
                    <Link to={`/interviews/${interview.id}/report`} className="text-[11px] text-[#2563EB] hover:underline">
                      查看报告
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <div className="text-[11px] text-[#6B7280] mb-1">累计面试</div>
              <div className="text-[24px] font-bold text-[#111827]">{completedCount}</div>
              <div className="text-[11px] text-[#16A34A] flex items-center gap-0.5 mt-0.5">
                <TrendingUp size={11} /> 持续进步
              </div>
            </div>
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <div className="text-[11px] text-[#6B7280] mb-1">平均评分</div>
              <div className="text-[24px] font-bold text-[#111827]">{avgScore}</div>
              <div className="text-[11px] text-[#2563EB] flex items-center gap-0.5 mt-0.5">
                <TrendingUp size={11} /> 较上次 +13
              </div>
            </div>
          </div>

          {/* Radar chart */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <h2 className="text-[15px] font-semibold text-[#111827] mb-1">能力概览</h2>
            <p className="text-[12px] text-[#6B7280] mb-3">基于最近一次面试</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 10, fill: "#6B7280" }}
                  />
                  <Radar
                    name="能力"
                    dataKey="A"
                    stroke="#2563EB"
                    fill="#2563EB"
                    fillOpacity={0.15}
                    strokeWidth={1.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {radarData.map((d) => (
                <div key={d.subject} className="flex items-center gap-2">
                  <span className="text-[12px] text-[#6B7280] w-20 shrink-0">{d.subject}</span>
                  <div className="flex-1 bg-[#F3F4F6] rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-[#2563EB]"
                      style={{ width: `${d.A}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-medium text-[#111827] w-6 text-right">{d.A}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <h2 className="text-[15px] font-semibold text-[#111827] mb-3">快捷操作</h2>
            <div className="space-y-2">
              <Link
                to="/interviews/new"
                className="flex items-center gap-2.5 p-3 bg-[#2563EB] text-white rounded hover:bg-[#1D4ED8] transition-colors"
              >
                <Play size={14} />
                <span className="text-[13px] font-medium">开始新一轮面试</span>
              </Link>
              <Link
                to="/documents"
                className="flex items-center gap-2.5 p-3 border border-[#E5E7EB] rounded hover:bg-[#F9FAFB] transition-colors"
              >
                <Upload size={14} className="text-[#6B7280]" />
                <span className="text-[13px] text-[#374151]">上传新资料</span>
              </Link>
              <button className="w-full flex items-center gap-2.5 p-3 border border-[#E5E7EB] rounded hover:bg-[#F9FAFB] transition-colors">
                <TrendingUp size={14} className="text-[#6B7280]" />
                <span className="text-[13px] text-[#374151]">基于薄弱项再来一轮</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

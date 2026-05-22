import { useState } from "react";
import { Link } from "react-router";
import {
  TrendingUp,
  Eye,
  RefreshCw,
  Trash2,
  ChevronDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
} from "recharts";
import { mockInterviews, historyTrendData, weakPointFrequency } from "../../data/mockData";

const modeLabels: Record<string, string> = {
  technical: "技术面",
  behavioral: "综合面",
  mixed: "技术 + 综合",
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

const radarCompare = [
  { subject: "技术准确性", recent: 82, average: 72 },
  { subject: "项目表达", recent: 74, average: 68 },
  { subject: "岗位匹配", recent: 80, average: 70 },
  { subject: "结构化表达", recent: 70, average: 65 },
  { subject: "追问应对", recent: 65, average: 60 },
  { subject: "综合素质", recent: 85, average: 75 },
];

export function History() {
  const [interviews, setInterviews] = useState(mockInterviews);
  const [typeFilter, setTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filtered = interviews.filter(i => {
    if (typeFilter !== "all" && i.mode !== typeFilter) return false;
    if (roleFilter !== "all" && i.role !== roleFilter) return false;
    return true;
  });

  const avgScore = Math.round(interviews.reduce((s, i) => s + i.score, 0) / interviews.length);
  const bestScore = Math.max(...interviews.map(i => i.score));

  const handleDelete = (id: string) => {
    setInterviews(prev => prev.filter(i => i.id !== id));
    setDeleteConfirm(null);
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#111827]">历史记录</h1>
        <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
          <TrendingUp size={14} /> 共 {interviews.length} 次面试
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
          <div className="text-[12px] text-[#6B7280] mb-1">累计面试</div>
          <div className="text-[28px] font-bold text-[#111827]">{interviews.length}</div>
        </div>
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
          <div className="text-[12px] text-[#6B7280] mb-1">平均分</div>
          <div className="text-[28px] font-bold text-[#111827]">{avgScore}</div>
        </div>
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
          <div className="text-[12px] text-[#6B7280] mb-1">最高分</div>
          <div className="text-[28px] font-bold text-[#16A34A]">{bestScore}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Score trend */}
        <div className="lg:col-span-2 bg-white border border-[#E5E7EB] rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-[#111827] mb-4">评分趋势</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <Tooltip
                  contentStyle={{ border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="综合分"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#2563EB" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="technical"
                  name="技术"
                  stroke="#16A34A"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="project"
                  name="项目"
                  stroke="#D97706"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar comparison */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-[#111827] mb-4">能力对比</h2>
          <p className="text-[11px] text-[#9CA3AF] mb-2">最近一次 vs 历史均值</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarCompare} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                <Radar name="最近" dataKey="recent" stroke="#2563EB" fill="#2563EB" fillOpacity={0.15} strokeWidth={1.5} />
                <Radar name="均值" dataKey="average" stroke="#D97706" fill="#D97706" fillOpacity={0.1} strokeWidth={1} strokeDasharray="3 2" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Weak points bar chart */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-[#111827] mb-4">高频薄弱项</h2>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weakPointFrequency} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "#374151" }} width={70} />
              <Tooltip contentStyle={{ border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="count" name="出现次数" fill="#2563EB" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="appearance-none border border-[#E5E7EB] rounded px-3 py-1.5 text-[13px] text-[#374151] bg-white pr-7 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="all">全部类型</option>
            <option value="technical">技术面</option>
            <option value="behavioral">综合面</option>
            <option value="mixed">技术 + 综合</option>
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="appearance-none border border-[#E5E7EB] rounded px-3 py-1.5 text-[13px] text-[#374151] bg-white pr-7 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="all">全部岗位</option>
            <option value="后端开发">后端开发</option>
            <option value="前端开发">前端开发</option>
            <option value="算法工程师">算法工程师</option>
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
        </div>
        <span className="text-[13px] text-[#9CA3AF]">{filtered.length} 条记录</span>
      </div>

      {/* History table */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_80px_90px_80px_1fr_120px] gap-4 px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB] text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide">
          <span>面试名称</span>
          <span>类型</span>
          <span>岗位</span>
          <span>评分</span>
          <span>薄弱项</span>
          <span>操作</span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-[#9CA3AF]">
            <TrendingUp size={32} />
            <div className="text-[14px]">暂无符合条件的记录</div>
          </div>
        ) : (
          filtered.map((interview, idx) => (
            <div key={interview.id} className={`${idx > 0 ? "border-t border-[#E5E7EB]" : ""}`}>
              {/* Desktop row */}
              <div className="hidden md:grid grid-cols-[1fr_80px_90px_80px_1fr_120px] gap-4 px-4 py-3 items-center hover:bg-[#F9FAFB] transition-colors">
                <div>
                  <div className="text-[14px] font-medium text-[#111827]">{interview.title}</div>
                  <div className="text-[12px] text-[#9CA3AF] mt-0.5">{interview.createdAt}</div>
                </div>
                <div>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${statusColors[interview.status]}`}>
                    {statusLabels[interview.status]}
                  </span>
                </div>
                <div className="text-[13px] text-[#374151]">{interview.role}</div>
                <div className={`text-[18px] font-bold ${interview.score >= 80 ? "text-[#16A34A]" : interview.score >= 65 ? "text-[#D97706]" : "text-[#DC2626]"}`}>
                  {interview.score}
                </div>
                <div className="flex flex-wrap gap-1">
                  {interview.weakPoints.map(w => (
                    <span key={w} className="text-[11px] px-1.5 py-0.5 bg-[#FEF3C7] text-[#D97706] rounded">{w}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/interviews/${interview.id}/report`}
                    className="flex items-center gap-1 text-[12px] text-[#2563EB] hover:underline"
                  >
                    <Eye size={12} /> 报告
                  </Link>
                  <Link
                    to="/interviews/new"
                    className="flex items-center gap-1 text-[12px] text-[#6B7280] hover:text-[#2563EB]"
                  >
                    <RefreshCw size={12} /> 练习
                  </Link>
                  <button
                    onClick={() => setDeleteConfirm(interview.id)}
                    className="text-[12px] text-[#6B7280] hover:text-[#DC2626]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Mobile card */}
              <div className="md:hidden p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-[#111827] truncate">{interview.title}</div>
                    <div className="text-[12px] text-[#9CA3AF] mt-0.5">{interview.createdAt} · {interview.role}</div>
                  </div>
                  <div className={`text-[20px] font-bold shrink-0 ${interview.score >= 80 ? "text-[#16A34A]" : interview.score >= 65 ? "text-[#D97706]" : "text-[#DC2626]"}`}>
                    {interview.score}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${statusColors[interview.status]}`}>
                    {statusLabels[interview.status]}
                  </span>
                  {interview.weakPoints.map(w => (
                    <span key={w} className="text-[11px] px-1.5 py-0.5 bg-[#FEF3C7] text-[#D97706] rounded">{w}</span>
                  ))}
                  <Link to={`/interviews/${interview.id}/report`} className="text-[12px] text-[#2563EB] ml-auto">
                    查看报告
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-2">确认删除</h3>
            <p className="text-[14px] text-[#6B7280]">确定要删除这条面试记录吗？相关报告也将一并移除。</p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-[#E5E7EB] rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB]"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-[#DC2626] text-white rounded text-[13px] hover:bg-[#B91C1C]"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

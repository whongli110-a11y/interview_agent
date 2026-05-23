import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Download,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  Tag,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  FileText,
  Loader2,
} from "lucide-react";
import { interviewsApi, dimensionLabel, type ApiReport } from "../../api/interviews";
import { ApiError } from "../../api/client";

const scoreColor = (score: number) => {
  if (score >= 80) return "text-[#16A34A]";
  if (score >= 65) return "text-[#D97706]";
  return "text-[#DC2626]";
};

const scoreBarColor = (score: number) => {
  if (score >= 80) return "bg-[#16A34A]";
  if (score >= 65) return "bg-[#D97706]";
  return "bg-[#DC2626]";
};

const tagColors: Record<string, string> = {
  项目深挖: "bg-[#EDE9FE] text-[#7C3AED]",
  技术基础: "bg-[#DBEAFE] text-[#1D4ED8]",
  系统设计: "bg-[#FEF3C7] text-[#D97706]",
  行为面: "bg-[#DCFCE7] text-[#16A34A]",
  追问: "bg-[#FEE2E2] text-[#DC2626]",
};

interface ReviewItem {
  id: string;
  question: string;
  tag: string;
  answerSummary: string;
  evaluation: string;
  issues: string[];
  betterAnswerDirection: string;
}

function QuestionCard({ q, index }: { q: ReviewItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[12px] font-medium text-[#9CA3AF]">Q{index + 1}</span>
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded ${
                tagColors[q.tag] ?? "bg-[#F3F4F6] text-[#6B7280]"
              }`}
            >
              {q.tag}
            </span>
          </div>
          <div className="text-[14px] font-medium text-[#111827] leading-relaxed">
            {q.question}
          </div>
          {!expanded && (
            <div className="text-[13px] text-[#6B7280] mt-1 line-clamp-2">{q.answerSummary}</div>
          )}
        </div>
        <div className="shrink-0 text-[#9CA3AF]">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#E5E7EB] p-4 space-y-3 bg-[#F9FAFB]">
          {q.answerSummary && (
            <div>
              <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-1">
                回答摘要
              </div>
              <div className="text-[13px] text-[#374151] leading-relaxed">{q.answerSummary}</div>
            </div>
          )}
          {q.evaluation && (
            <div>
              <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-1">
                评价
              </div>
              <div className="text-[13px] text-[#374151] leading-relaxed">{q.evaluation}</div>
            </div>
          )}
          {q.issues.length > 0 && (
            <div>
              <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-1">
                主要问题
              </div>
              <div className="space-y-1">
                {q.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle size={13} className="text-[#DC2626] mt-0.5 shrink-0" />
                    <span className="text-[13px] text-[#374151]">{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {q.betterAnswerDirection && (
            <div>
              <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-1">
                更好的回答思路
              </div>
              <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded text-[13px] text-[#14532D] leading-relaxed">
                {q.betterAnswerDirection}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Link
              to="/interviews/new"
              className="flex items-center gap-1.5 text-[12px] text-[#2563EB] border border-[#BFDBFE] bg-white px-3 py-1.5 rounded hover:bg-[#EFF6FF] transition-colors"
            >
              <RefreshCw size={12} />
              重新练习
            </Link>
            <button className="flex items-center gap-1.5 text-[12px] text-[#2563EB] border border-[#BFDBFE] bg-white px-3 py-1.5 rounded hover:bg-[#EFF6FF] transition-colors">
              <Sparkles size={12} />
              生成更优答案
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InterviewReport() {
  const navigate = useNavigate();
  const { id: sessionId } = useParams<{ id: string }>();
  const [report, setReport] = useState<ApiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let attempts = 0;
    const maxAttempts = 8;
    const delay = 2000;

    const tryFetch = async () => {
      attempts++;
      try {
        const data = await interviewsApi.getReport(sessionId);
        setReport(data);
        setLoading(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && attempts < maxAttempts) {
          // Report may still be generating — retry
          setTimeout(tryFetch, delay);
        } else {
          setError(
            err instanceof ApiError ? err.message : "获取报告失败，请稍后重试"
          );
          setLoading(false);
        }
      }
    };

    tryFetch();
  }, [sessionId]);

  const handleCopy = () => {
    if (!report) return;
    const text = [
      `面试报告 · 综合评分 ${report.total_score}`,
      "",
      "改进建议：",
      ...report.resume_suggestions.map((s, i) => `${i + 1}. ${s}`),
      "",
      "训练计划：",
      ...report.next_training_plan.map((p, i) => `${i + 1}. ${p}`),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="animate-spin text-[#2563EB] mx-auto" />
          <div className="text-[15px] font-medium text-[#111827]">正在生成面试报告...</div>
          <div className="text-[13px] text-[#6B7280]">AI 正在综合评估你的表现，请稍候</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <AlertCircle size={32} className="text-[#DC2626] mx-auto" />
          <div className="text-[15px] font-medium text-[#111827]">报告加载失败</div>
          <div className="text-[13px] text-[#6B7280]">{error}</div>
          <button
            onClick={() => navigate(-1)}
            className="text-[13px] text-[#2563EB] hover:underline"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // Transform question_reviews for display
  const reviews: ReviewItem[] = report.question_reviews.map((r, i) => ({
    id: String(i),
    question: r.question,
    tag: "技术基础",
    answerSummary: r.answer_summary,
    evaluation: r.evaluation,
    issues: r.issues,
    betterAnswerDirection: r.better_answer_direction,
  }));

  // Top suggestions: use resume_suggestions as primary
  const topSuggestions = report.resume_suggestions.slice(0, 3);

  const reportDate = report.created_at.slice(0, 10);

  return (
    <div className="p-6 max-w-[960px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-[#6B7280] hover:text-[#111827] p-1 rounded hover:bg-[#F3F4F6]"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-[20px] font-semibold text-[#111827]">面试评估报告</h1>
          <div className="flex items-center gap-3 mt-0.5 text-[13px] text-[#6B7280]">
            <span>{reportDate}</span>
            <span>·</span>
            <span>综合评分 {report.total_score} 分</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 border border-[#E5E7EB] px-3 py-1.5 rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB]"
          >
            {copied ? (
              <CheckCircle2 size={13} className="text-[#16A34A]" />
            ) : (
              <Copy size={13} />
            )}
            {copied ? "已复制" : "复制摘要"}
          </button>
          <button className="flex items-center gap-1.5 border border-[#E5E7EB] px-3 py-1.5 rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB]">
            <Download size={13} />
            导出
          </button>
        </div>
      </div>

      {/* Score + top suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Score card */}
        <div className="lg:col-span-2 bg-white border border-[#E5E7EB] rounded-lg p-5">
          <div className="text-center mb-4">
            <div
              className={`text-[52px] font-bold leading-none ${scoreColor(report.total_score)}`}
            >
              {report.total_score}
            </div>
            <div className="text-[13px] text-[#6B7280] mt-1">综合评分</div>
          </div>
          <div className="space-y-2.5">
            {Object.entries(report.dimension_scores).map(([key, score]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] text-[#374151]">{dimensionLabel(key)}</span>
                  <span className={`text-[12px] font-semibold ${scoreColor(score)}`}>{score}</span>
                </div>
                <div className="bg-[#F3F4F6] rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${scoreBarColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top suggestions */}
        <div className="lg:col-span-3 bg-white border border-[#E5E7EB] rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-[#111827] mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-[#D97706]" />
            最重要的改进建议
          </h2>
          <div className="space-y-3">
            {topSuggestions.length > 0 ? (
              topSuggestions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded"
                >
                  <div className="w-5 h-5 rounded-full bg-[#D97706] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-[13px] text-[#374151] leading-relaxed">{s}</span>
                </div>
              ))
            ) : (
              <div className="text-[13px] text-[#9CA3AF]">暂无改进建议</div>
            )}
          </div>
        </div>
      </div>

      {/* Question reviews */}
      {reviews.length > 0 && (
        <div>
          <h2 className="text-[16px] font-semibold text-[#111827] mb-3 flex items-center gap-2">
            <Tag size={15} className="text-[#6B7280]" />
            逐题复盘
          </h2>
          <div className="space-y-3">
            {reviews.map((q, i) => (
              <QuestionCard key={q.id} q={q} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Resume suggestions */}
      {report.resume_suggestions.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-[#111827] mb-3 flex items-center gap-2">
            <FileText size={15} className="text-[#6B7280]" />
            简历优化建议
          </h2>
          <div className="space-y-2">
            {report.resume_suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border border-[#E5E7EB] rounded">
                <AlertCircle size={14} className="text-[#D97706] mt-0.5 shrink-0" />
                <span className="text-[13px] text-[#374151]">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next training plan */}
      {report.next_training_plan.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-[#111827] mb-3 flex items-center gap-2">
            <Sparkles size={15} className="text-[#6B7280]" />
            下一步训练计划
          </h2>
          <div className="space-y-2 mb-4">
            {report.next_training_plan.map((plan, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded"
              >
                <div className="w-5 h-5 rounded-full bg-[#0284C7] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <span className="text-[13px] text-[#0C4A6E] leading-relaxed">{plan}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/interviews/new"
              className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded text-[13px] font-medium hover:bg-[#1D4ED8]"
            >
              <RefreshCw size={13} />
              基于薄弱项再来一轮
            </Link>
            <Link
              to="/interviews/new"
              className="flex items-center gap-2 border border-[#E5E7EB] text-[#374151] px-4 py-2 rounded text-[13px] hover:bg-[#F9FAFB]"
            >
              推荐下一次面试模式
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

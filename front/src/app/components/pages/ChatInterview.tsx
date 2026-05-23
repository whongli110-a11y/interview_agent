import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import {
  Send,
  Pause,
  Play,
  Square,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lightbulb,
  SkipForward,
  Tag,
  CheckCircle2,
  AlertCircle,
  Database,
} from "lucide-react";
import {
  interviewsApi,
  questionTypeTag,
  type InterviewQuestion,
} from "../../api/interviews";
import { ApiError } from "../../api/client";

type MessageRole = "interviewer" | "user" | "system";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  tag?: string;
  isFollowUp?: boolean;
  timestamp: string;
}

const tagColors: Record<string, string> = {
  项目深挖: "bg-[#EDE9FE] text-[#7C3AED]",
  技术基础: "bg-[#DBEAFE] text-[#1D4ED8]",
  系统设计: "bg-[#FEF3C7] text-[#D97706]",
  行为面: "bg-[#DCFCE7] text-[#16A34A]",
  追问: "bg-[#FEE2E2] text-[#DC2626]",
  岗位匹配: "bg-[#F0F9FF] text-[#0284C7]",
};

function makeMsg(
  role: MessageRole,
  content: string,
  extra?: Partial<Message>
): Message {
  return {
    id: `${role}-${Date.now()}-${Math.random()}`,
    role,
    content,
    timestamp: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ...extra,
  };
}

function questionToMsg(q: InterviewQuestion): Message {
  const tag = questionTypeTag(q.question_type);
  return makeMsg("interviewer", q.content, {
    tag,
    isFollowUp: q.question_type === "follow_up",
  });
}

interface LocationState {
  question?: InterviewQuestion | null;
  mode?: string;
  role?: string;
  maxQuestions?: number;
  difficulty?: string;
}

export function ChatInterview() {
  const navigate = useNavigate();
  const { id: sessionId } = useParams<{ id: string }>();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [question, setQuestion] = useState(1);
  const [maxQuestions, setMaxQuestions] = useState(state.maxQuestions ?? 8);
  const [mode] = useState(state.mode ?? "综合面");
  const [role] = useState(state.role ?? "");
  const [difficulty] = useState(state.difficulty ?? "medium");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Covered abilities tracked per session
  const [dimensionCovered, setDimensionCovered] = useState<string[]>([]);
  const [currentFocus, setCurrentFocus] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init: if we got a question from navigation state, add it; otherwise fetch from API
  useEffect(() => {
    if (state.question) {
      setMessages([questionToMsg(state.question)]);
      setCurrentFocus([questionTypeTag(state.question.question_type)]);
      if (state.maxQuestions) setMaxQuestions(state.maxQuestions);
    } else if (sessionId) {
      // Re-hydrate session (e.g. browser refresh)
      interviewsApi
        .getStatus(sessionId)
        .then((status) => {
          setMaxQuestions(status.max_questions);
          setQuestion(status.current_question_index + 1);
          if (status.turns.length === 0 && status.current_question) {
            setMessages([questionToMsg(status.current_question)]);
          } else {
            // Reconstruct message history from turns
            const msgs: Message[] = [];
            status.turns.forEach((t) => {
              msgs.push(
                makeMsg("interviewer", t.question, {
                  tag: questionTypeTag(t.question_type),
                  isFollowUp: t.question_type === "follow_up",
                  id: `q-${t.turn_index}`,
                })
              );
              if (t.answer) {
                msgs.push(makeMsg("user", t.answer, { id: `a-${t.turn_index}` }));
              }
            });
            if (status.current_question) {
              msgs.push(questionToMsg(status.current_question));
            }
            setMessages(msgs);
          }
        })
        .catch((err) => {
          setSessionError(
            err instanceof ApiError ? err.message : "加载面试会话失败"
          );
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    if (!paused && !showEndDialog) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, showEndDialog]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = overrideContent ?? input.trim();
    if (!content || loading || paused || !sessionId) return;

    const userMsg = makeMsg("user", content);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowHint(false);

    // Show retrieval indicator
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        makeMsg("system", "正在检索你的项目资料...", { id: `sys-${Date.now()}` }),
      ]);
    }, 300);

    try {
      const res = await interviewsApi.submitAnswer(sessionId, content);

      // Remove system indicator
      setMessages((prev) => prev.filter((m) => m.role !== "system"));

      if (res.status === "completed") {
        // Interview done
        setMessages((prev) => [
          ...prev,
          makeMsg(
            "interviewer",
            "本次面试已结束，感谢你的参与！系统正在生成综合评估报告，请稍候...",
            { tag: "面试结束" }
          ),
        ]);
        setLoading(false);
        setTimeout(() => {
          navigate(`/interviews/${sessionId}/report`);
        }, 1500);
        return;
      }

      if (res.question) {
        const tag = questionTypeTag(res.question.question_type);
        setMessages((prev) => [...prev, questionToMsg(res.question!)]);
        setQuestion((q) => Math.min(q + 1, maxQuestions));
        setCurrentFocus([tag]);
        setDimensionCovered((prev) =>
          prev.includes(tag) ? prev : [...prev, tag]
        );
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.role !== "system"));
      setMessages((prev) => [
        ...prev,
        makeMsg(
          "system",
          `提交失败：${err instanceof ApiError ? err.message : "网络异常"}`,
          { id: `err-${Date.now()}` }
        ),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendMessage();
  };

  const handleSkip = () => {
    sendMessage("[跳过此题]");
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    setFinalizing(true);
    try {
      await interviewsApi.finalize(sessionId);
    } catch {
      // finalize 失败也继续跳转，报告页会处理错误
    } finally {
      setFinalizing(false);
    }
    navigate(`/interviews/${sessionId}/report`);
  };

  const difficultyLabel: Record<string, string> = {
    basic: "基础",
    medium: "中等",
    challenge: "挑战",
    hard: "挑战",
  };

  if (sessionError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <AlertCircle size={32} className="text-[#DC2626] mx-auto" />
          <div className="text-[15px] font-medium text-[#111827]">加载会话失败</div>
          <div className="text-[13px] text-[#6B7280]">{sessionError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#F7F8FA]">
      {/* Left status - desktop */}
      <div className="hidden md:flex flex-col w-52 bg-white border-r border-[#E5E7EB] p-4 shrink-0">
        <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">
          面试状态
        </div>
        <div className="space-y-3">
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">面试类型</div>
            <div className="text-[13px] font-medium text-[#111827] capitalize">{mode}</div>
          </div>
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">当前进度</div>
            <div className="text-[13px] font-medium text-[#111827]">
              第 <span className="text-[#2563EB]">{question}</span> / {maxQuestions} 题
            </div>
            <div className="mt-1.5 bg-[#E5E7EB] rounded-full h-1.5">
              <div
                className="h-1.5 bg-[#2563EB] rounded-full transition-all"
                style={{ width: `${(question / maxQuestions) * 100}%` }}
              />
            </div>
          </div>
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">已用时间</div>
            <div className="text-[13px] font-medium text-[#111827] flex items-center gap-1.5">
              <Clock size={13} className="text-[#6B7280]" />
              {formatTime(elapsed)}
            </div>
          </div>
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">难度</div>
            <div className="text-[13px] font-medium text-[#111827]">
              {difficultyLabel[difficulty] ?? difficulty}
            </div>
          </div>
          {role && (
            <div className="p-3 bg-[#F9FAFB] rounded">
              <div className="text-[11px] text-[#6B7280] mb-0.5">岗位方向</div>
              <div className="text-[13px] font-medium text-[#111827]">{role}</div>
            </div>
          )}
        </div>
        <div className="mt-auto pt-3 border-t border-[#E5E7EB]">
          <button
            onClick={() => setShowEndDialog(true)}
            className="w-full flex items-center justify-center gap-2 py-2 border border-[#DC2626] text-[#DC2626] rounded text-[13px] hover:bg-[#FEF2F2] transition-colors"
          >
            <Square size={13} />
            结束面试
          </button>
        </div>
      </div>

      {/* Chat main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[#111827]">
                {role ? `${role} · ` : ""}{mode}（{difficultyLabel[difficulty] ?? difficulty}难度）
              </div>
              <div className="flex items-center gap-2 text-[12px] text-[#6B7280]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${paused ? "bg-[#D97706]" : "bg-[#16A34A]"}`}
                />
                {paused ? "已暂停" : "进行中"} · {formatTime(elapsed)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusExpanded(!statusExpanded)}
              className="md:hidden flex items-center gap-1 border border-[#E5E7EB] rounded px-2.5 py-1.5 text-[12px] text-[#374151]"
            >
              {statusExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              进度
            </button>
            <button
              onClick={() => setPaused(!paused)}
              className="flex items-center gap-1.5 border border-[#E5E7EB] rounded px-3 py-1.5 text-[13px] text-[#374151] hover:bg-[#F9FAFB]"
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              <span className="hidden sm:inline">{paused ? "继续" : "暂停"}</span>
            </button>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className="hidden md:flex items-center gap-1.5 border border-[#E5E7EB] rounded px-3 py-1.5 text-[13px] text-[#374151] hover:bg-[#F9FAFB]"
            >
              <Tag size={13} />
              分析
            </button>
            <button
              onClick={() => setShowEndDialog(true)}
              className="flex items-center gap-1.5 border border-[#DC2626] text-[#DC2626] rounded px-3 py-1.5 text-[13px] hover:bg-[#FEF2F2]"
            >
              <Square size={13} />
              <span className="hidden sm:inline">结束</span>
            </button>
          </div>
        </div>

        {/* Mobile status bar */}
        {statusExpanded && (
          <div className="md:hidden grid grid-cols-4 gap-2 px-4 py-2 bg-white border-b border-[#E5E7EB] text-center">
            <div>
              <div className="text-[10px] text-[#6B7280]">进度</div>
              <div className="text-[12px] font-semibold text-[#111827]">
                {question}/{maxQuestions}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">已用时</div>
              <div className="text-[12px] font-semibold text-[#111827]">{formatTime(elapsed)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">难度</div>
              <div className="text-[12px] font-semibold text-[#111827]">
                {difficultyLabel[difficulty] ?? difficulty}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">类型</div>
              <div className="text-[12px] font-semibold text-[#111827]">{mode}</div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => {
            if (msg.role === "system") {
              return (
                <div key={msg.id} className="flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-3 py-1.5 text-[12px] text-[#6B7280]">
                    <Database size={11} className="animate-pulse text-[#2563EB]" />
                    {msg.content}
                  </div>
                </div>
              );
            }

            if (msg.role === "interviewer") {
              return (
                <div key={msg.id} className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-[#1E40AF] flex items-center justify-center text-white text-[12px] font-semibold shrink-0 mt-0.5">
                    面
                  </div>
                  <div>
                    {msg.tag && (
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded ${
                            tagColors[msg.tag] ?? "bg-[#F3F4F6] text-[#6B7280]"
                          }`}
                        >
                          {msg.isFollowUp ? "↳ 追问" : msg.tag}
                        </span>
                      </div>
                    )}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-3 text-[14px] text-[#111827] leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] mt-1 ml-1">{msg.timestamp}</div>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex gap-3 max-w-[80%] ml-auto flex-row-reverse">
                <div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] text-[12px] font-semibold shrink-0 mt-0.5">
                  我
                </div>
                <div>
                  <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-3 text-[14px] text-[#111827] leading-relaxed">
                    {msg.content}
                  </div>
                  <div className="text-[11px] text-[#9CA3AF] mt-1 mr-1 text-right">
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-[#1E40AF] flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
                面
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#6B7280]" />
                <span className="text-[13px] text-[#9CA3AF]">正在思考...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Hint panel */}
        {showHint && (
          <div className="mx-4 mb-2 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg">
            <div className="flex items-start gap-2">
              <Lightbulb size={14} className="text-[#D97706] mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-[#92400E]">提示</div>
                <div className="text-[12px] text-[#78350F] mt-0.5">
                  尝试从多个角度展开回答：背景、技术选型、具体实现、遇到的挑战以及最终成果。结合具体数据会让回答更有说服力。
                </div>
              </div>
              <button
                onClick={() => setShowHint(false)}
                className="ml-auto text-[#9CA3AF] hover:text-[#6B7280] shrink-0"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Paused overlay */}
        {paused && (
          <div className="mx-4 mb-2 p-3 bg-[#FFF7ED] border border-[#FED7AA] rounded-lg flex items-center gap-2">
            <Pause size={14} className="text-[#D97706]" />
            <span className="text-[13px] text-[#92400E]">面试已暂停，点击「继续」恢复</span>
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 bg-white border-t border-[#E5E7EB]">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setShowHint(true)}
              disabled={loading || paused}
              className="flex items-center gap-1.5 border border-[#E5E7EB] rounded px-2.5 py-1 text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Lightbulb size={12} />
              我需要一点提示
            </button>
            <button
              onClick={handleSkip}
              disabled={loading || paused}
              className="flex items-center gap-1.5 border border-[#E5E7EB] rounded px-2.5 py-1 text-[12px] text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SkipForward size={12} />
              跳过这题
            </button>
          </div>
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={paused ? "面试已暂停" : "输入你的回答... (Ctrl+Enter 发送)"}
              disabled={loading || paused}
              rows={3}
              className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-[14px] resize-none focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || paused}
              className="flex items-center gap-1.5 bg-[#2563EB] text-white px-4 py-2.5 rounded-lg text-[13px] font-medium hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="hidden sm:inline">发送</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right panel - real-time analysis */}
      {showRightPanel && (
        <div className="hidden md:flex flex-col w-60 bg-white border-l border-[#E5E7EB] p-4 shrink-0 overflow-y-auto">
          <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">
            实时分析
          </div>
          <div className="space-y-4">
            {currentFocus.length > 0 && (
              <div>
                <div className="text-[13px] font-medium text-[#111827] mb-2">当前考察点</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentFocus.map((f) => (
                    <span key={f} className="text-[11px] px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {dimensionCovered.length > 0 && (
              <div>
                <div className="text-[13px] font-medium text-[#111827] mb-2">已覆盖能力</div>
                <div className="space-y-1.5">
                  {dimensionCovered.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-[#16A34A]" />
                      <span className="text-[12px] text-[#374151]">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="p-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded">
              <div className="flex items-start gap-1.5">
                <AlertCircle size={13} className="text-[#0284C7] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-[#0C4A6E]">答题建议</div>
                  <div className="text-[11px] text-[#075985] mt-0.5">
                    结合具体数据和案例，使用 STAR 法则组织回答
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End dialog */}
      {showEndDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-[16px] font-semibold text-[#111827] mb-2">结束本次面试？</h3>
            <p className="text-[14px] text-[#6B7280]">
              已回答 {question - 1} 题，用时 {formatTime(elapsed)}。结束后将生成结构化面试报告。
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowEndDialog(false)}
                className="flex-1 py-2 border border-[#E5E7EB] rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB]"
              >
                继续面试
              </button>
              <button
                onClick={handleEnd}
                disabled={finalizing}
                className="flex-1 py-2 bg-[#2563EB] text-white rounded text-[13px] hover:bg-[#1D4ED8] flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {finalizing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    生成中...
                  </>
                ) : (
                  "生成报告"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

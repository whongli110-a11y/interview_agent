import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
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
import { mockMessages } from "../../data/mockData";

type Message = {
  id: string;
  role: "interviewer" | "user" | "system";
  content: string;
  tag?: string;
  isFollowUp?: boolean;
  timestamp: string;
};

const tagColors: Record<string, string> = {
  项目深挖: "bg-[#EDE9FE] text-[#7C3AED]",
  技术基础: "bg-[#DBEAFE] text-[#1D4ED8]",
  系统设计: "bg-[#FEF3C7] text-[#D97706]",
  行为面: "bg-[#DCFCE7] text-[#16A34A]",
  追问: "bg-[#FEE2E2] text-[#DC2626]",
  岗位匹配: "bg-[#F0F9FF] text-[#0284C7]",
};

const dimensionCovered = ["数据结构", "Raft 协议", "分布式系统"];
const currentFocus = ["项目深度", "技术细节", "挑战处理"];

const interviewerReplies = [
  "谢谢你的回答。关于快照机制，你提到了阈值触发，能说说这个阈值是怎么确定的，以及快照期间系统是否还能接受写入请求吗？",
  "好的，我理解了。那在实际测试中，你们是如何模拟网络分区场景的？用了哪些测试工具或方法？",
  "不错，接下来我们换个话题。你如何评估一个分布式系统的读写延迟性能？有没有在这个项目中做过 benchmark？",
  "很好。最后一个问题：如果这个系统要在生产环境部署，你认为最需要补充哪些监控指标和告警策略？",
];

let replyIndex = 0;

export function ChatInterview() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [input, setInput] = useState("");
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [question, setQuestion] = useState(1);
  const [totalQuestions] = useState(8);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!paused && !showEndDialog) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, showEndDialog]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const sendMessage = () => {
    if (!input.trim() || loading || paused) return;
    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowHint(false);

    setTimeout(() => {
      const systemMsg: Message = {
        id: `sys${Date.now()}`,
        role: "system",
        content: "正在检索你的项目资料...",
        timestamp: "",
      };
      setMessages(prev => [...prev, systemMsg]);
    }, 400);

    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.role !== "system"));
      const reply = interviewerReplies[replyIndex % interviewerReplies.length];
      replyIndex++;
      const iFollowUp = replyIndex % 3 === 0;
      const tags = ["技术基础", "系统设计", "行为面", "项目深挖", "岗位匹配"];
      const nextTag = tags[replyIndex % tags.length];
      const botMsg: Message = {
        id: `b${Date.now()}`,
        role: "interviewer",
        content: reply,
        tag: iFollowUp ? "追问" : nextTag,
        isFollowUp: iFollowUp,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, botMsg]);
      setLoading(false);
      setQuestion(q => Math.min(q + 1, totalQuestions));
    }, 2200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendMessage();
  };

  const handleEnd = () => {
    navigate("/interviews/1/report");
  };

  return (
    <div className="flex h-full bg-[#F7F8FA]">
      {/* Left status - desktop */}
      <div className="hidden md:flex flex-col w-52 bg-white border-r border-[#E5E7EB] p-4 shrink-0">
        <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">面试状态</div>
        <div className="space-y-3">
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">面试类型</div>
            <div className="text-[13px] font-medium text-[#111827]">技术 + 综合</div>
          </div>
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">当前进度</div>
            <div className="text-[13px] font-medium text-[#111827]">
              第 <span className="text-[#2563EB]">{question}</span> / {totalQuestions} 题
            </div>
            <div className="mt-1.5 bg-[#E5E7EB] rounded-full h-1.5">
              <div
                className="h-1.5 bg-[#2563EB] rounded-full transition-all"
                style={{ width: `${(question / totalQuestions) * 100}%` }}
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
            <div className="text-[13px] font-medium text-[#111827]">中等</div>
          </div>
          <div className="p-3 bg-[#F9FAFB] rounded">
            <div className="text-[11px] text-[#6B7280] mb-0.5">当前考察维度</div>
            <div className="text-[13px] font-medium text-[#111827]">分布式系统</div>
          </div>
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
              <div className="text-[14px] font-semibold text-[#111827]">后端开发技术面（中等难度）</div>
              <div className="flex items-center gap-2 text-[12px] text-[#6B7280]">
                <span className={`w-1.5 h-1.5 rounded-full ${paused ? "bg-[#D97706]" : "bg-[#16A34A]"}`} />
                {paused ? "已暂停" : "进行中"} · {formatTime(elapsed)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile status toggle */}
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
              <div className="text-[12px] font-semibold text-[#111827]">{question}/{totalQuestions}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">已用时</div>
              <div className="text-[12px] font-semibold text-[#111827]">{formatTime(elapsed)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">难度</div>
              <div className="text-[12px] font-semibold text-[#111827]">中等</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B7280]">考察</div>
              <div className="text-[12px] font-semibold text-[#111827]">分布式</div>
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
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${tagColors[msg.tag] ?? "bg-[#F3F4F6] text-[#6B7280]"}`}>
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
                  <div className="text-[11px] text-[#9CA3AF] mt-1 mr-1 text-right">{msg.timestamp}</div>
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
                  可以从快照的触发时机（日志条目数阈值）、存储方式（独立快照文件 + 元数据）、以及快照期间对写入的影响（Raft 可以继续接收日志，快照完成后压缩旧日志）三个角度展开回答。
                </div>
              </div>
              <button onClick={() => setShowHint(false)} className="ml-auto text-[#9CA3AF] hover:text-[#6B7280] shrink-0">×</button>
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
              onClick={() => {
                const skipMsg: Message = {
                  id: `skip${Date.now()}`,
                  role: "user",
                  content: "[跳过此题]",
                  timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
                };
                setMessages(prev => [...prev, skipMsg]);
                setInput("");
                setLoading(true);
                setTimeout(() => {
                  const nextMsg: Message = {
                    id: `b${Date.now()}`,
                    role: "interviewer",
                    content: "好的，我们继续下一个问题。MySQL 中 B+ 树索引和哈希索引各适合什么场景？",
                    tag: "技术基础",
                    timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
                  };
                  setMessages(prev => [...prev, nextMsg]);
                  setLoading(false);
                  setQuestion(q => Math.min(q + 1, totalQuestions));
                }, 1500);
              }}
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={paused ? "面试已暂停" : "输入你的回答... (Ctrl+Enter 发送)"}
              disabled={loading || paused}
              rows={3}
              className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-[14px] resize-none focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]"
            />
            <button
              onClick={sendMessage}
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
          <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">实时分析</div>
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-medium text-[#111827] mb-2">当前问题考察点</div>
              <div className="flex flex-wrap gap-1.5">
                {currentFocus.map(f => (
                  <span key={f} className="text-[11px] px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded">{f}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-[#111827] mb-2">已覆盖能力</div>
              <div className="space-y-1.5">
                {dimensionCovered.map(d => (
                  <div key={d} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-[#16A34A]" />
                    <span className="text-[12px] text-[#374151]">{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-[#FFF7ED] border border-[#FED7AA] rounded">
              <div className="flex items-start gap-1.5">
                <AlertCircle size={13} className="text-[#D97706] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-[#92400E]">回答状态</div>
                  <div className="text-[11px] text-[#78350F] mt-0.5">回答偏短，可以补充项目细节和具体数据</div>
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
                className="flex-1 py-2 bg-[#2563EB] text-white rounded text-[13px] hover:bg-[#1D4ED8]"
              >
                生成报告
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

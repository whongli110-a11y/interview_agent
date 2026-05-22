import { useState, useRef } from "react";
import {
  Upload,
  File,
  FileText,
  Briefcase,
  FolderOpen,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Search,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Database,
  X,
} from "lucide-react";
import { mockDocuments, type DocumentCard } from "../../data/mockData";

const typeConfig = {
  resume: { label: "简历", icon: FileText, color: "text-[#2563EB] bg-[#DBEAFE]" },
  jd: { label: "岗位 JD", icon: Briefcase, color: "text-[#D97706] bg-[#FEF3C7]" },
  project: { label: "项目资料", icon: FolderOpen, color: "text-[#16A34A] bg-[#DCFCE7]" },
  other: { label: "其他", icon: File, color: "text-[#6B7280] bg-[#F3F4F6]" },
};

const parseStatusConfig = {
  pending: { label: "待解析", icon: Clock, className: "text-[#6B7280] bg-[#F3F4F6]" },
  processing: { label: "解析中", icon: Loader2, className: "text-[#2563EB] bg-[#DBEAFE]", spin: true },
  completed: { label: "已完成", icon: CheckCircle2, className: "text-[#16A34A] bg-[#DCFCE7]" },
  failed: { label: "解析失败", icon: XCircle, className: "text-[#DC2626] bg-[#FEE2E2]" },
};

const categoryKeys = ["all", "resume", "jd", "project", "other"] as const;
const categoryLabels: Record<string, string> = {
  all: "全部",
  resume: "简历",
  jd: "岗位 JD",
  project: "项目资料",
  other: "面试记录",
};

type DeleteConfirmState = { id: string; filename: string } | null;

export function KnowledgeBase() {
  const [docs, setDocs] = useState<DocumentCard[]>(mockDocuments);
  const [category, setCategory] = useState<typeof categoryKeys[number]>("all");
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocumentCard | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = docs.filter((d) => {
    if (category !== "all" && d.type !== category) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categoryCounts = {
    all: docs.length,
    resume: docs.filter(d => d.type === "resume").length,
    jd: docs.filter(d => d.type === "jd").length,
    project: docs.filter(d => d.type === "project").length,
    other: docs.filter(d => d.type === "other").length,
  };

  const handleDelete = (id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
    setDeleteConfirm(null);
  };

  const handleRetry = (id: string) => {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, parseStatus: "processing" } : d));
    setTimeout(() => {
      setDocs(prev => prev.map(d => d.id === id ? { ...d, parseStatus: "completed", chunkCount: 15, indexed: true } : d));
    }, 2000);
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const newDoc: DocumentCard = {
        id: `new_${Date.now()}_${Math.random()}`,
        filename: file.name,
        type: "other",
        parseStatus: "processing",
        indexed: false,
        chunkCount: 0,
        createdAt: new Date().toISOString().split("T")[0],
        size: `${(file.size / 1024).toFixed(0)} KB`,
      };
      setDocs(prev => [newDoc, ...prev]);
      setTimeout(() => {
        setDocs(prev => prev.map(d => d.id === newDoc.id ? { ...d, parseStatus: "completed", chunkCount: 8, indexed: true } : d));
      }, 3000);
    });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar categories */}
      <div className="hidden md:flex flex-col w-44 bg-white border-r border-[#E5E7EB] p-3 shrink-0">
        <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide px-2 mb-2">资料分类</div>
        {categoryKeys.map((key) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`flex items-center justify-between px-2 py-2 rounded text-[14px] transition-colors ${
              category === key
                ? "bg-[#EFF6FF] text-[#2563EB] font-medium"
                : "text-[#374151] hover:bg-[#F3F4F6]"
            }`}
          >
            <span>{categoryLabels[key]}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${category === key ? "bg-[#DBEAFE] text-[#2563EB]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
              {categoryCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-[#E5E7EB]">
          <button
            onClick={handleUpload}
            className="flex items-center gap-2 bg-[#2563EB] text-white px-3 py-1.5 rounded text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            <Upload size={14} />
            上传资料
          </button>
          <button className="flex items-center gap-2 border border-[#E5E7EB] px-3 py-1.5 rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB] transition-colors">
            <RefreshCw size={13} />
            重建索引
          </button>
          <div className="flex-1" />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="搜索知识库..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-[#E5E7EB] rounded text-[13px] w-52 focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* Mobile category tabs */}
        <div className="md:hidden flex gap-1 px-4 py-2 bg-white border-b border-[#E5E7EB] overflow-x-auto">
          {categoryKeys.map(key => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                category === key ? "bg-[#2563EB] text-white" : "bg-[#F3F4F6] text-[#374151]"
              }`}
            >
              {categoryLabels[key]}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* File list */}
          <div className={`flex flex-col overflow-hidden ${selectedDoc ? "hidden md:flex md:w-80 border-r border-[#E5E7EB]" : "flex-1"}`}>
            {/* Drop zone at top when list is empty */}
            {filtered.length === 0 ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
                className={`flex-1 flex flex-col items-center justify-center p-8 gap-4 border-2 border-dashed rounded-lg m-4 transition-colors ${dragging ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#D1D5DB]"}`}
              >
                <Upload size={32} className="text-[#9CA3AF]" />
                <div className="text-center">
                  <div className="text-[14px] font-medium text-[#374151]">拖拽文件到此处上传</div>
                  <div className="text-[12px] text-[#6B7280] mt-1">支持 PDF、Word、Markdown 格式</div>
                </div>
                <button
                  onClick={handleUpload}
                  className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
                >
                  <Upload size={13} />
                  选择文件
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* Drop zone hint */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
                  className={`mx-4 mt-4 mb-2 border-2 border-dashed rounded p-3 flex items-center gap-2 transition-colors ${dragging ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#E5E7EB]"}`}
                >
                  <Upload size={14} className={dragging ? "text-[#2563EB]" : "text-[#9CA3AF]"} />
                  <span className="text-[13px] text-[#9CA3AF]">拖拽文件到此处或 <button onClick={handleUpload} className="text-[#2563EB] hover:underline">点击上传</button></span>
                </div>

                <div className="px-4 pb-4 space-y-2">
                  {filtered.map((doc) => {
                    const typeInfo = typeConfig[doc.type];
                    const statusInfo = parseStatusConfig[doc.parseStatus];
                    const TypeIcon = typeInfo.icon;
                    const StatusIcon = statusInfo.icon;
                    const isSelected = selectedDoc?.id === doc.id;

                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(isSelected ? null : doc)}
                        className={`p-3 border rounded cursor-pointer transition-colors ${isSelected ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#E5E7EB] bg-white hover:border-[#BFDBFE] hover:bg-[#F8FAFF]"}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                            <TypeIcon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[#111827] truncate">{doc.filename}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${statusInfo.className}`}>
                                <StatusIcon size={11} className={statusInfo.spin ? "animate-spin" : ""} />
                                {statusInfo.label}
                              </span>
                              {doc.indexed && (
                                <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#16A34A]">
                                  <Database size={10} />
                                  已入库
                                </span>
                              )}
                              {doc.chunkCount > 0 && (
                                <span className="text-[11px] text-[#9CA3AF]">{doc.chunkCount} 块</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pl-9">
                          <span className="text-[11px] text-[#9CA3AF]">{doc.createdAt} · {doc.size}</span>
                          <div className="flex-1" />
                          {doc.parseStatus === "failed" && (
                            <button
                              onClick={e => { e.stopPropagation(); handleRetry(doc.id); }}
                              className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline"
                            >
                              <RefreshCw size={11} /> 重试
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedDoc(doc); }}
                            className="text-[11px] text-[#6B7280] hover:text-[#2563EB]"
                            title="查看详情"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: doc.id, filename: doc.filename }); }}
                            className="text-[11px] text-[#6B7280] hover:text-[#DC2626]"
                            title="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Document detail */}
          {selectedDoc && (
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="sticky top-0 flex items-center justify-between px-5 py-3 bg-white border-b border-[#E5E7EB] z-10">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedDoc(null)} className="text-[#6B7280] hover:text-[#111827] md:hidden">
                    <ChevronRight size={18} className="rotate-180" />
                  </button>
                  <h2 className="text-[15px] font-semibold text-[#111827]">文件详情</h2>
                </div>
                <button onClick={() => setSelectedDoc(null)} className="hidden md:block text-[#9CA3AF] hover:text-[#6B7280]">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* File meta */}
                <div>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${typeConfig[selectedDoc.type].color}`}>
                      {(() => { const Icon = typeConfig[selectedDoc.type].icon; return <Icon size={18} />; })()}
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-[#111827]">{selectedDoc.filename}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[12px] text-[#6B7280]">{typeConfig[selectedDoc.type].label}</span>
                        <span className="text-[12px] text-[#6B7280]">·</span>
                        <span className="text-[12px] text-[#6B7280]">{selectedDoc.createdAt}</span>
                        <span className="text-[12px] text-[#6B7280]">·</span>
                        <span className="text-[12px] text-[#6B7280]">{selectedDoc.size}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {(() => { const s = parseStatusConfig[selectedDoc.parseStatus]; const Icon = s.icon; return (
                      <span className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded ${s.className}`}>
                        <Icon size={12} className={s.spin ? "animate-spin" : ""} /> {s.label}
                      </span>
                    ); })()}
                    {selectedDoc.indexed ? (
                      <span className="flex items-center gap-1 text-[12px] px-2 py-1 rounded bg-[#F0FDF4] text-[#16A34A]">
                        <Database size={12} /> 已入库 · {selectedDoc.chunkCount} 块
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px] px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
                        <Database size={12} /> 未入库
                      </span>
                    )}
                  </div>
                </div>

                {/* Structured extraction */}
                {selectedDoc.parseStatus === "completed" && (
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111827] mb-3">结构化提取结果</h3>
                    {selectedDoc.type === "resume" && (
                      <div className="space-y-2">
                        {[
                          { label: "教育经历", value: "北京大学 · 计算机科学与技术 · 2022-2026" },
                          { label: "核心技能", value: "Go, Python, Java, MySQL, Redis, Kubernetes, Raft 协议" },
                          { label: "项目经历", value: "分布式键值存储系统（毕业设计）、推荐系统优化（实习）" },
                          { label: "实习经历", value: "某大厂后端开发实习 · 6个月" },
                        ].map(({ label, value }) => (
                          <div key={label} className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded">
                            <div className="text-[11px] text-[#6B7280] mb-0.5">{label}</div>
                            <div className="text-[13px] text-[#111827]">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedDoc.type === "jd" && (
                      <div className="space-y-2">
                        {[
                          { label: "岗位职责", value: "负责后端服务开发、系统性能优化、参与技术方案设计" },
                          { label: "技能要求", value: "Go/Java，熟悉 MySQL/Redis，了解分布式系统" },
                          { label: "加分项", value: "有 Kubernetes 运维经验，了解消息队列（Kafka/RabbitMQ）" },
                        ].map(({ label, value }) => (
                          <div key={label} className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded">
                            <div className="text-[11px] text-[#6B7280] mb-0.5">{label}</div>
                            <div className="text-[13px] text-[#111827]">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedDoc.type === "project" && (
                      <div className="space-y-2">
                        {[
                          { label: "项目目标", value: "构建高可用分布式键值存储系统，支持强一致性读写" },
                          { label: "技术栈", value: "Go, Raft 协议, gRPC, LevelDB, Docker" },
                          { label: "核心模块", value: "Raft 一致性层、数据分片、快照机制、客户端路由" },
                          { label: "难点与亮点", value: "网络分区下的一致性保证，Leader 选举优化" },
                        ].map(({ label, value }) => (
                          <div key={label} className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded">
                            <div className="text-[11px] text-[#6B7280] mb-0.5">{label}</div>
                            <div className="text-[13px] text-[#111827]">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Chunk preview */}
                {selectedDoc.parseStatus === "completed" && selectedDoc.chunkCount > 0 && (
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111827] mb-3">知识切片预览</h3>
                    <div className="space-y-2">
                      {[
                        { text: "实现了基于 Raft 协议的日志复制机制，确保在大多数节点存活的情况下系统可用，并通过 Leader 心跳机制维持权威性。", page: "第 1 页", score: 0.94 },
                        { text: "设计了基于一致性哈希的数据分片策略，支持动态扩缩容，减少数据迁移量至约 1/n。", page: "第 2 页", score: 0.87 },
                        { text: "快照机制：当日志条目超过阈值时触发快照，压缩已应用日志，防止内存无限增长。快照存储采用....", page: "第 2 页", score: 0.82 },
                      ].map((chunk, i) => (
                        <div key={i} className="p-3 border border-[#E5E7EB] rounded bg-white">
                          <div className="text-[13px] text-[#374151] leading-relaxed">{chunk.text}</div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[11px] text-[#9CA3AF]">来源：{chunk.page}</span>
                            <span className="text-[11px] text-[#9CA3AF]">相关度 {chunk.score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed state */}
                {selectedDoc.parseStatus === "failed" && (
                  <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-[#DC2626] mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[14px] font-medium text-[#DC2626]">解析失败</div>
                        <div className="text-[13px] text-[#7F1D1D] mt-1">文件格式可能不受支持或文件已损坏。请尝试重新上传或转换为 PDF 格式后再上传。</div>
                        <button
                          onClick={() => handleRetry(selectedDoc.id)}
                          className="mt-2 flex items-center gap-1.5 text-[13px] text-[#DC2626] border border-[#DC2626] px-3 py-1.5 rounded hover:bg-[#DC2626] hover:text-white transition-colors"
                        >
                          <RefreshCw size={13} /> 重新解析
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-[#E5E7EB]">
                  <button
                    onClick={() => setDeleteConfirm({ id: selectedDoc.id, filename: selectedDoc.filename })}
                    className="flex items-center gap-1.5 text-[13px] text-[#DC2626] border border-[#FECACA] px-3 py-1.5 rounded hover:bg-[#FEF2F2] transition-colors"
                  >
                    <Trash2 size={13} /> 删除文件
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.doc,.docx,.md,.txt"
        onChange={e => handleFileSelect(e.target.files)}
      />

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-2">确认删除</h3>
            <p className="text-[14px] text-[#6B7280]">
              确定要删除 <span className="font-medium text-[#111827]">{deleteConfirm.filename}</span> 吗？此操作不可撤销，文件将从知识库中移除。
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-[#E5E7EB] rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="px-4 py-2 bg-[#DC2626] text-white rounded text-[13px] hover:bg-[#B91C1C] transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

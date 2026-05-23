import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  File,
  FileText,
  Briefcase,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Search,
  ChevronRight,
  AlertTriangle,
  Database,
  X,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import {
  type ApiDocument,
  type DocumentChunk,
  type SourceType,
  documentsApi,
  guessSourceType,
} from "../../api/documents";
import { ApiError } from "../../api/client";

const typeConfig = {
  resume: { label: "简历", icon: FileText, color: "text-[#2563EB] bg-[#DBEAFE]" },
  jd: { label: "岗位 JD", icon: Briefcase, color: "text-[#D97706] bg-[#FEF3C7]" },
  project: { label: "项目资料", icon: FolderOpen, color: "text-[#16A34A] bg-[#DCFCE7]" },
  other: { label: "其他", icon: File, color: "text-[#6B7280] bg-[#F3F4F6]" },
};

const parseStatusConfig = {
  pending: { label: "待解析", icon: Clock, className: "text-[#6B7280] bg-[#F3F4F6]", spin: false },
  processing: { label: "解析中", icon: Loader2, className: "text-[#2563EB] bg-[#DBEAFE]", spin: true },
  completed: { label: "已完成", icon: CheckCircle2, className: "text-[#16A34A] bg-[#DCFCE7]", spin: false },
  failed: { label: "解析失败", icon: XCircle, className: "text-[#DC2626] bg-[#FEE2E2]", spin: false },
};

const categoryKeys = ["all", "resume", "jd", "project", "other"] as const;
const categoryLabels: Record<string, string> = {
  all: "全部",
  resume: "简历",
  jd: "岗位 JD",
  project: "项目资料",
  other: "其他",
};

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "resume", label: "简历" },
  { value: "jd", label: "岗位 JD" },
  { value: "project", label: "项目资料" },
  { value: "other", label: "其他" },
];

type DeleteConfirmState = { id: string; filename: string } | null;

interface UploadQueueItem {
  file: File;
  type: SourceType;
}

export function KnowledgeBase() {
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-document chunk counts, populated after parsing
  const [chunkCounts, setChunkCounts] = useState<Record<string, number>>({});

  const [category, setCategory] = useState<typeof categoryKeys[number]>("all");
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<ApiDocument | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload flow: files queued waiting for type selection
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load chunks when a completed document is selected
  useEffect(() => {
    if (!selectedDoc || selectedDoc.parse_status !== "completed") {
      setChunks([]);
      return;
    }
    setChunksLoading(true);
    documentsApi
      .getChunks(selectedDoc.id)
      .then((res) => setChunks(res.chunks))
      .catch(() => setChunks([]))
      .finally(() => setChunksLoading(false));
  }, [selectedDoc?.id, selectedDoc?.parse_status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await documentsApi.list();
      setDocs(data);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const filtered = docs.filter((d) => {
    if (category !== "all" && d.source_type !== category) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categoryCounts = {
    all: docs.length,
    resume: docs.filter((d) => d.source_type === "resume").length,
    jd: docs.filter((d) => d.source_type === "jd").length,
    project: docs.filter((d) => d.source_type === "project").length,
    other: docs.filter((d) => d.source_type === "other").length,
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: UploadQueueItem[] = Array.from(files).map((f) => ({
      file: f,
      type: guessSourceType(f.name),
    }));
    setUploadQueue(items);
    setShowUploadDialog(true);
  };

  const updateQueueType = (idx: number, type: SourceType) => {
    setUploadQueue((prev) => prev.map((item, i) => (i === idx ? { ...item, type } : item)));
  };

  const handleConfirmUpload = async () => {
    setUploading(true);
    for (const item of uploadQueue) {
      try {
        // Upload
        const doc = await documentsApi.upload(item.file, item.type);
        setDocs((prev) => [doc, ...prev]);

        // Immediately trigger parse and update status
        setDocs((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, parse_status: "processing" } : d))
        );
        try {
          const parsed = await documentsApi.parse(doc.id);
          setChunkCounts((prev) => ({ ...prev, [doc.id]: parsed.chunk_count }));
          setDocs((prev) =>
            prev.map((d) =>
              d.id === doc.id ? { ...d, parse_status: parsed.parse_status as ApiDocument["parse_status"] } : d
            )
          );
        } catch {
          setDocs((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, parse_status: "failed" } : d))
          );
        }
      } catch (err) {
        setErrorMsg(err instanceof ApiError ? err.message : "上传失败");
      }
    }
    setUploading(false);
    setShowUploadDialog(false);
    setUploadQueue([]);
  };

  const handleRetry = async (id: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, parse_status: "processing" } : d)));
    try {
      const parsed = await documentsApi.parse(id);
      setChunkCounts((prev) => ({ ...prev, [id]: parsed.chunk_count }));
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, parse_status: parsed.parse_status as ApiDocument["parse_status"] } : d
        )
      );
    } catch {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, parse_status: "failed" } : d)));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await documentsApi.remove(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "删除失败");
    }
    setDeleteConfirm(null);
  };

  const handleRebuildIndex = async () => {
    // Re-parse all completed docs to refresh the index
    const completedDocs = docs.filter((d) => d.parse_status === "completed");
    for (const doc of completedDocs) {
      await handleRetry(doc.id).catch(() => null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar categories */}
      <div className="hidden md:flex flex-col w-44 bg-white border-r border-[#E5E7EB] p-3 shrink-0">
        <div className="text-[12px] font-medium text-[#9CA3AF] uppercase tracking-wide px-2 mb-2">
          资料分类
        </div>
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
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                category === key
                  ? "bg-[#DBEAFE] text-[#2563EB]"
                  : "bg-[#F3F4F6] text-[#6B7280]"
              }`}
            >
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
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-[#2563EB] text-white px-3 py-1.5 rounded text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            <Upload size={14} />
            上传资料
          </button>
          <button
            onClick={handleRebuildIndex}
            className="flex items-center gap-2 border border-[#E5E7EB] px-3 py-1.5 rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB] transition-colors"
          >
            <RefreshCw size={13} />
            重建索引
          </button>
          <div className="flex-1" />
          {errorMsg && (
            <span className="text-[12px] text-[#DC2626] max-w-xs truncate">{errorMsg}</span>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="搜索知识库..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-[#E5E7EB] rounded text-[13px] w-52 focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* Mobile category tabs */}
        <div className="md:hidden flex gap-1 px-4 py-2 bg-white border-b border-[#E5E7EB] overflow-x-auto">
          {categoryKeys.map((key) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                category === key
                  ? "bg-[#2563EB] text-white"
                  : "bg-[#F3F4F6] text-[#374151]"
              }`}
            >
              {categoryLabels[key]}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* File list */}
          <div
            className={`flex flex-col overflow-hidden ${
              selectedDoc ? "hidden md:flex md:w-80 border-r border-[#E5E7EB]" : "flex-1"
            }`}
          >
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-[#9CA3AF]">
                <Loader2 size={20} className="animate-spin mr-2" />
                加载中...
              </div>
            ) : filtered.length === 0 ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
                className={`flex-1 flex flex-col items-center justify-center p-8 gap-4 border-2 border-dashed rounded-lg m-4 transition-colors ${
                  dragging ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#D1D5DB]"
                }`}
              >
                <Upload size={32} className="text-[#9CA3AF]" />
                <div className="text-center">
                  <div className="text-[14px] font-medium text-[#374151]">拖拽文件到此处上传</div>
                  <div className="text-[12px] text-[#6B7280] mt-1">支持 PDF、Word、Markdown 格式</div>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
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
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files); }}
                  className={`mx-4 mt-4 mb-2 border-2 border-dashed rounded p-3 flex items-center gap-2 transition-colors ${
                    dragging ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#E5E7EB]"
                  }`}
                >
                  <Upload size={14} className={dragging ? "text-[#2563EB]" : "text-[#9CA3AF]"} />
                  <span className="text-[13px] text-[#9CA3AF]">
                    拖拽文件到此处或{" "}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[#2563EB] hover:underline"
                    >
                      点击上传
                    </button>
                  </span>
                </div>

                <div className="px-4 pb-4 space-y-2">
                  {filtered.map((doc) => {
                    const typeInfo = typeConfig[doc.source_type] ?? typeConfig.other;
                    const statusInfo = parseStatusConfig[doc.parse_status] ?? parseStatusConfig.pending;
                    const TypeIcon = typeInfo.icon;
                    const StatusIcon = statusInfo.icon;
                    const isSelected = selectedDoc?.id === doc.id;
                    const chunks = chunkCounts[doc.id] ?? 0;
                    const indexed = doc.parse_status === "completed";

                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(isSelected ? null : doc)}
                        className={`p-3 border rounded cursor-pointer transition-colors ${
                          isSelected
                            ? "border-[#2563EB] bg-[#EFF6FF]"
                            : "border-[#E5E7EB] bg-white hover:border-[#BFDBFE] hover:bg-[#F8FAFF]"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${typeInfo.color}`}
                          >
                            <TypeIcon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[#111827] truncate">
                              {doc.filename}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span
                                className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${statusInfo.className}`}
                              >
                                <StatusIcon size={11} className={statusInfo.spin ? "animate-spin" : ""} />
                                {statusInfo.label}
                              </span>
                              {indexed && (
                                <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#16A34A]">
                                  <Database size={10} />
                                  已入库
                                </span>
                              )}
                              {chunks > 0 && (
                                <span className="text-[11px] text-[#9CA3AF]">{chunks} 块</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pl-9">
                          <span className="text-[11px] text-[#9CA3AF]">
                            {doc.created_at.slice(0, 10)}
                          </span>
                          <div className="flex-1" />
                          {doc.parse_status === "failed" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRetry(doc.id); }}
                              className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline"
                            >
                              <RefreshCw size={11} /> 重试
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}
                            className="text-[11px] text-[#6B7280] hover:text-[#2563EB]"
                            title="查看详情"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ id: doc.id, filename: doc.filename });
                            }}
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
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="text-[#6B7280] hover:text-[#111827] md:hidden"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                  </button>
                  <h2 className="text-[15px] font-semibold text-[#111827]">文件详情</h2>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="hidden md:block text-[#9CA3AF] hover:text-[#6B7280]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* File meta */}
                <div>
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${typeConfig[selectedDoc.source_type]?.color ?? typeConfig.other.color}`}
                    >
                      {(() => {
                        const Icon = (typeConfig[selectedDoc.source_type] ?? typeConfig.other).icon;
                        return <Icon size={18} />;
                      })()}
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-[#111827]">
                        {selectedDoc.filename}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[12px] text-[#6B7280]">
                          {(typeConfig[selectedDoc.source_type] ?? typeConfig.other).label}
                        </span>
                        <span className="text-[12px] text-[#6B7280]">·</span>
                        <span className="text-[12px] text-[#6B7280]">
                          {selectedDoc.created_at.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {(() => {
                      const s = parseStatusConfig[selectedDoc.parse_status] ?? parseStatusConfig.pending;
                      const Icon = s.icon;
                      return (
                        <span className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded ${s.className}`}>
                          <Icon size={12} className={s.spin ? "animate-spin" : ""} /> {s.label}
                        </span>
                      );
                    })()}
                    {selectedDoc.parse_status === "completed" ? (
                      <span className="flex items-center gap-1 text-[12px] px-2 py-1 rounded bg-[#F0FDF4] text-[#16A34A]">
                        <Database size={12} />
                        已入库
                        {chunkCounts[selectedDoc.id]
                          ? ` · ${chunkCounts[selectedDoc.id]} 块`
                          : ""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px] px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
                        <Database size={12} /> 未入库
                      </span>
                    )}
                  </div>
                </div>

                {/* Chunk preview */}
                {selectedDoc.parse_status === "completed" && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={14} className="text-[#6B7280]" />
                      <h3 className="text-[14px] font-semibold text-[#111827]">知识切片预览</h3>
                      {chunkCounts[selectedDoc.id] && (
                        <span className="text-[11px] text-[#9CA3AF]">
                          共 {chunkCounts[selectedDoc.id]} 块
                        </span>
                      )}
                    </div>
                    {chunksLoading ? (
                      <div className="flex items-center gap-2 text-[13px] text-[#9CA3AF] py-2">
                        <Loader2 size={13} className="animate-spin" />
                        加载分块中...
                      </div>
                    ) : chunks.length === 0 ? (
                      <div className="text-[13px] text-[#9CA3AF]">暂无分块数据</div>
                    ) : (
                      <div className="space-y-2">
                        {chunks.map((chunk) => {
                          const page = (chunk.metadata as Record<string, unknown>)?.page;
                          return (
                            <div
                              key={chunk.id}
                              className="p-3 border border-[#E5E7EB] rounded bg-white"
                            >
                              <div className="text-[13px] text-[#374151] leading-relaxed line-clamp-4">
                                {chunk.content}
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[11px] text-[#9CA3AF]">
                                  块 #{chunk.chunk_index + 1}
                                </span>
                                {page !== undefined && (
                                  <span className="text-[11px] text-[#9CA3AF]">
                                    第 {page} 页
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {chunks.length >= 30 && (
                          <div className="text-[12px] text-[#9CA3AF] text-center py-1">
                            仅展示前 30 块
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Parse error detail */}
                {selectedDoc.parse_status === "failed" && (
                  <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-[#DC2626] mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[14px] font-medium text-[#DC2626]">解析失败</div>
                        <div className="text-[13px] text-[#7F1D1D] mt-1">
                          {selectedDoc.parse_error ||
                            "文件格式可能不受支持或文件已损坏。请尝试重新上传或转换为 PDF 格式。"}
                        </div>
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
                    onClick={() =>
                      setDeleteConfirm({ id: selectedDoc.id, filename: selectedDoc.filename })
                    }
                    className="flex items-center gap-1.5 text-[13px] text-[#DC2626] border border-[#FECACA] px-3 py-1.5 rounded hover:bg-[#FEF2F2] transition-colors"
                  >
                    <Trash2 size={13} /> 删除文件
                  </button>
                  {selectedDoc.parse_status !== "completed" && (
                    <button
                      onClick={() => handleRetry(selectedDoc.id)}
                      className="flex items-center gap-1.5 text-[13px] text-[#2563EB] border border-[#BFDBFE] px-3 py-1.5 rounded hover:bg-[#EFF6FF] transition-colors"
                    >
                      <RefreshCw size={13} /> 重新解析
                    </button>
                  )}
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
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Upload type-selection dialog */}
      {showUploadDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-1">确认上传文件</h3>
            <p className="text-[13px] text-[#6B7280] mb-4">请为每个文件选择正确的类型，以便系统正确解析。</p>
            <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
              {uploadQueue.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[#111827] truncate">{item.file.name}</div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                      {(item.file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <select
                      value={item.type}
                      onChange={(e) => updateQueueType(idx, e.target.value as SourceType)}
                      className="appearance-none border border-[#E5E7EB] rounded px-2.5 py-1.5 text-[12px] text-[#111827] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB] pr-6"
                    >
                      {SOURCE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowUploadDialog(false); setUploadQueue([]); }}
                disabled={uploading}
                className="px-4 py-2 border border-[#E5E7EB] rounded text-[13px] text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded text-[13px] font-medium hover:bg-[#1D4ED8] disabled:opacity-60 transition-colors"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? "上传中..." : "开始上传"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-2">确认删除</h3>
            <p className="text-[14px] text-[#6B7280]">
              确定要删除{" "}
              <span className="font-medium text-[#111827]">{deleteConfirm.filename}</span>{" "}
              吗？此操作不可撤销，文件将从知识库中移除。
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

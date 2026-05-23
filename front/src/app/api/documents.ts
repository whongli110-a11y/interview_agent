import { api } from "./client";

export type SourceType = "resume" | "jd" | "project" | "other";
export type ParseStatus = "pending" | "processing" | "completed" | "failed";

export interface ApiDocument {
  id: string;
  user_id: string;
  filename: string;
  source_type: SourceType;
  parse_status: ParseStatus;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParseResult {
  document_id: string;
  parse_status: string;
  chunk_count: number;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  user_id: string;
  source_type: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  vector_id: string | null;
  created_at: string;
}

export interface ChunksResponse {
  chunks: DocumentChunk[];
  total: number;
}

export const documentsApi = {
  list: (userId = "default") =>
    api.get<ApiDocument[]>(`/documents?user_id=${encodeURIComponent(userId)}`),

  upload: (file: File, sourceType: SourceType, userId = "default") => {
    const form = new FormData();
    form.append("file", file);
    form.append("source_type", sourceType);
    form.append("user_id", userId);
    return api.upload<ApiDocument>("/documents/upload", form);
  },

  parse: (documentId: string) =>
    api.post<ParseResult>(`/documents/${documentId}/parse`),

  remove: (documentId: string) =>
    api.delete<{ deleted: boolean }>(`/documents/${documentId}`),

  getChunks: (documentId: string, limit = 30) =>
    api.get<ChunksResponse>(`/documents/${documentId}/chunks?limit=${limit}`),
};

/** Guess source type from filename heuristics. */
export function guessSourceType(filename: string): SourceType {
  const lower = filename.toLowerCase();
  if (/resume|cv|简历/.test(lower)) return "resume";
  if (/jd|job.?desc|岗位|职位/.test(lower)) return "jd";
  if (/project|proj|readme|项目/.test(lower)) return "project";
  return "other";
}

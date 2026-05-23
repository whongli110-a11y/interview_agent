import { api } from "./client";

export interface InterviewQuestion {
  turn_index: number;
  question_type: string;
  content: string;
  intent?: string;
  expected_points: string[];
}

export interface CreateInterviewRequest {
  user_id?: string;
  mode: "technical" | "behavioral" | "mixed";
  role_direction: string;
  difficulty: "basic" | "medium" | "hard";
  duration_minutes: number;
  max_questions: number;
  enable_follow_up: boolean;
}

export interface CreateInterviewResponse {
  session_id: string;
  status: string;
  question: InterviewQuestion | null;
}

export interface SubmitAnswerResponse {
  session_id: string;
  status: string;
  question: InterviewQuestion | null;
  last_evaluation: Record<string, unknown> | null;
  report_id: string | null;
}

export interface SessionTurn {
  id: string;
  session_id: string;
  turn_index: number;
  question: string;
  question_type: string;
  answer: string;
  evaluation: Record<string, unknown> | null;
  retrieved_context_ids: string[];
  created_at: string;
}

export interface InterviewStatus {
  session_id: string;
  status: string;
  current_question_index: number;
  max_questions: number;
  current_question: InterviewQuestion | null;
  turns: SessionTurn[];
}

export interface ApiReport {
  id: string;
  session_id: string;
  total_score: number;
  dimension_scores: Record<string, number>;
  question_reviews: Array<{
    question: string;
    answer_summary: string;
    evaluation: string;
    issues: string[];
    better_answer_direction: string;
  }>;
  resume_suggestions: string[];
  next_training_plan: string[];
  created_at: string;
}

export const interviewsApi = {
  create: (req: CreateInterviewRequest) =>
    api.post<CreateInterviewResponse>("/interviews", req),

  submitAnswer: (sessionId: string, answer: string) =>
    api.post<SubmitAnswerResponse>(`/interviews/${sessionId}/answer`, { answer }),

  getStatus: (sessionId: string) =>
    api.get<InterviewStatus>(`/interviews/${sessionId}`),

  getReport: (sessionId: string) =>
    api.get<ApiReport>(`/interviews/${sessionId}/report`),

  finalize: (sessionId: string) =>
    api.post<{ session_id: string; status: string; report_id: string | null }>(
      `/interviews/${sessionId}/finalize`
    ),
};

/** Map backend question_type to a Chinese display tag. */
export function questionTypeTag(qt: string): string {
  const map: Record<string, string> = {
    technical: "技术基础",
    behavioral: "行为面",
    system_design: "系统设计",
    project: "项目深挖",
    follow_up: "追问",
    job_fit: "岗位匹配",
  };
  return map[qt] ?? qt;
}

/** Map backend snake_case dimension key to Chinese label. */
export function dimensionLabel(key: string): string {
  const map: Record<string, string> = {
    technical_accuracy: "技术准确性",
    project_clarity: "项目表达清晰度",
    job_fit: "岗位匹配度",
    structure: "结构化表达",
    follow_up_handling: "追问应对",
    behavioral: "综合素质",
  };
  return map[key] ?? key;
}

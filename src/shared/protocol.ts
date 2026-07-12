import type { HomeworkItem, HomeworkStatus } from "./types";

export type ExtensionAction =
  | "connectPage"
  | "getAcademicYear"
  | "getExamList"
  | "getExamDetail"
  | "getSubjectLevelTrend"
  | "getHomeworkSubjects"
  | "getHomeworkList"
  | "getHomeworkResources";

export type ExamDetailType = "getReportMain" | "getLevelTrend" | string;

export type AcademicYear = {
  code?: string;
  name: string;
  beginTime: number | string;
  endTime: number | string;
  startTime?: number;
};

export type ExamListPayload = {
  pageIndex: number;
  academicYear: AcademicYear | null;
};

export type ExamDetailPayload = {
  examId: string;
  examDetailType: ExamDetailType;
  academicYear: AcademicYear | null;
};

export type SubjectLevelTrendPayload = {
  examId: string;
  paperId: string;
  academicYear: AcademicYear | null;
};

export type HomeworkListPayload = {
  status: HomeworkStatus;
  subjectCode: string;
  pageSize: number;
  createTime?: number;
};

export type HomeworkResourcesPayload = {
  homework: HomeworkItem;
};

export type RequestPayloadMap = {
  connectPage: undefined;
  getAcademicYear: undefined;
  getExamList: ExamListPayload;
  getExamDetail: ExamDetailPayload;
  getSubjectLevelTrend: SubjectLevelTrendPayload;
  getHomeworkSubjects: undefined;
  getHomeworkList: HomeworkListPayload;
  getHomeworkResources: HomeworkResourcesPayload;
};

export type ExtensionRequest<TPayload = unknown> = {
  requestId: string;
  action: ExtensionAction;
  payload?: TPayload;
};

export type ExtensionResponse<TData = unknown> = {
  requestId: string;
  success: boolean;
  data?: TData;
  error?: string;
  errorCode?: "AUTH_EXPIRED" | "HOMEWORK_REQUEST_FAILED";
};

export const OWL_REQUEST_CHANNEL = "OWL_INSIGHT_REQUEST";
export const OWL_RESPONSE_CHANNEL = "OWL_INSIGHT_RESPONSE";
export const OWL_SCRIPT_READY_CHANNEL = "OWL_INSIGHT_READY";
export const OWL_HOMEWORK_BACKGROUND_CHANNEL = "OWL_INSIGHT_HOMEWORK_BACKGROUND";
export const OWL_BACKGROUND_HEALTH_CHANNEL = "OWL_INSIGHT_BACKGROUND_HEALTH";

export type BackgroundHealthResponse = {
  ready: boolean;
  version: string;
  error?: string;
  errorCode?: "CORS_RULE_UNAVAILABLE" | "CORS_RULE_SETUP_FAILED";
};

export type HomeworkBackgroundRequest = {
  channel: typeof OWL_HOMEWORK_BACKGROUND_CHANNEL;
  request: ExtensionRequest;
  token: string;
  studentId: string;
};

export type WindowRequestMessage = {
  channel: typeof OWL_REQUEST_CHANNEL;
  request: ExtensionRequest;
};

export type WindowResponseMessage = {
  channel: typeof OWL_RESPONSE_CHANNEL;
  response: ExtensionResponse;
};

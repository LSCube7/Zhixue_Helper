export type ExamAction =
  | "getAcademicYear"
  | "getExamList"
  | "getExamDetail"
  | "getSubjectLevelTrend";

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

export type RequestPayloadMap = {
  getAcademicYear: undefined;
  getExamList: ExamListPayload;
  getExamDetail: ExamDetailPayload;
  getSubjectLevelTrend: SubjectLevelTrendPayload;
};

export type ExtensionRequest<TPayload = unknown> = {
  requestId: string;
  action: ExamAction;
  payload?: TPayload;
};

export type ExtensionResponse<TData = unknown> = {
  requestId: string;
  success: boolean;
  data?: TData;
  error?: string;
};

export const OWL_REQUEST_CHANNEL = "OWL_INSIGHT_REQUEST";
export const OWL_RESPONSE_CHANNEL = "OWL_INSIGHT_RESPONSE";
export const OWL_SCRIPT_READY_CHANNEL = "OWL_INSIGHT_READY";

export type WindowRequestMessage = {
  channel: typeof OWL_REQUEST_CHANNEL;
  request: ExtensionRequest;
};

export type WindowResponseMessage = {
  channel: typeof OWL_RESPONSE_CHANNEL;
  response: ExtensionResponse;
};

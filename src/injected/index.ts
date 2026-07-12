import {
  OWL_REQUEST_CHANNEL,
  OWL_RESPONSE_CHANNEL,
  OWL_SCRIPT_READY_CHANNEL,
  type AcademicYear,
  type ExamDetailPayload,
  type ExamListPayload,
  type ExtensionRequest,
  type ExtensionResponse,
  type SubjectLevelTrendPayload,
  type WindowRequestMessage
} from "../shared/protocol";
import type { ConnectionProfile } from "../shared/types";

const X_TOKEN_TTL_MS = 9 * 60 * 1000;

let xTokenCache: { value: string; expiresAt: number } | null = null;

window.postMessage({ channel: OWL_SCRIPT_READY_CHANNEL }, window.location.origin);

window.addEventListener("message", async (event: MessageEvent<WindowRequestMessage | { channel?: string }>) => {
  if (!isWindowRequestMessage(event.data) || event.source !== window) return;

  const request = event.data.request;
  const response = await handleRequest(request);
  window.postMessage({ channel: OWL_RESPONSE_CHANNEL, response }, window.location.origin);
});

function isWindowRequestMessage(data: unknown): data is WindowRequestMessage {
  return typeof data === "object" && data !== null && "channel" in data && data.channel === OWL_REQUEST_CHANNEL && "request" in data;
}

async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  try {
    switch (request.action) {
      case "connectPage":
        return success(request.requestId, await connectPage());
      case "getAcademicYear":
        return success(request.requestId, await getAcademicYear());
      case "getExamList":
        return success(request.requestId, await getExamList(request.payload as ExamListPayload));
      case "getExamDetail":
        return success(request.requestId, await getExamDetail(request.payload as ExamDetailPayload));
      case "getSubjectLevelTrend":
        return success(request.requestId, await getSubjectLevelTrend(request.payload as SubjectLevelTrendPayload));
      default:
        return failure(request.requestId, `未知的操作类型: ${request.action}`);
    }
  } catch (error) {
    return failure(request.requestId, error instanceof Error ? error.message : String(error));
  }
}

async function connectPage(): Promise<ConnectionProfile> {
  xTokenCache = null;
  const [profile] = await Promise.all([getStudentProfile(), getXToken(true)]);
  return profile;
}

async function getStudentProfile(): Promise<ConnectionProfile> {
  const response = await fetch(new URL("/container/container/student/account/", window.location.origin), {
    headers: { Accept: "application/json" },
    credentials: "include"
  });
  const body = await readJsonResponse(response, "学生信息");
  const student = isRecord(body.student) ? body.student : null;
  const clazz = student && isRecord(student.clazz) ? student.clazz : null;
  const division = clazz && isRecord(clazz.division) ? clazz.division : null;
  const school = division && isRecord(division.school) ? division.school : null;
  const grade = division && isRecord(division.grade) ? division.grade : null;

  if (!student || !clazz || !school) {
    throw new Error("未获取到学生资料，请确认所选页面已登录学生账号");
  }

  return {
    id: requiredString(student.id, "学生 ID"),
    code: optionalString(student.code),
    loginName: optionalString(student.loginName) ?? "未知账号",
    name: optionalString(student.name) ?? "未命名学生",
    avatar: normalizeOptionalUrl(optionalString(student.avatar)),
    school: { id: optionalString(school.id), name: optionalString(school.name) ?? "未知学校" },
    grade: grade ? { code: optionalString(grade.code), name: optionalString(grade.name) ?? "未知年级" } : undefined,
    class: { id: optionalString(clazz.id), name: optionalString(clazz.name) ?? "未知班级" }
  };
}

async function getAcademicYear(): Promise<unknown> {
  return fetchAuthenticatedJson("https://ali-bg.zhixue.com/zhixuebao/base/common/academicYear");
}

async function getExamList(payload: ExamListPayload): Promise<unknown> {
  const pageIndex = payload?.pageIndex || 1;
  const url = new URL("/zhixuebao/report/exam/getUserExamList", window.location.origin);
  url.searchParams.set("pageIndex", String(pageIndex));
  url.searchParams.set("pageSize", "10");
  appendAcademicYear(url, payload?.academicYear ?? null);
  return fetchAuthenticatedJson(url.toString());
}

async function getExamDetail(payload: ExamDetailPayload): Promise<unknown> {
  if (!payload?.examId || !payload.examDetailType) throw new Error("缺少考试 ID 或详情类型参数");
  const url = new URL(`/zhixuebao/report/exam/${payload.examDetailType}`, window.location.origin);
  url.searchParams.set("examId", payload.examId);
  appendAcademicYear(url, payload.academicYear);
  return fetchAuthenticatedJson(url.toString());
}

async function getSubjectLevelTrend(payload: SubjectLevelTrendPayload): Promise<unknown> {
  if (!payload?.examId || !payload.paperId) throw new Error("缺少考试 ID 或试卷 ID 参数");
  const url = new URL("/zhixuebao/report/paper/getLevelTrend", window.location.origin);
  url.searchParams.set("examId", payload.examId);
  url.searchParams.set("paperId", payload.paperId);
  appendAcademicYear(url, payload.academicYear);
  return fetchAuthenticatedJson(url.toString());
}

async function getXToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && xTokenCache && xTokenCache.expiresAt > Date.now()) return xTokenCache.value;

  const response = await fetch(new URL("/middleweb/newToken", window.location.origin), {
    headers: { Accept: "application/json" },
    credentials: "include"
  });
  const body = await readJsonResponse(response, "登录凭证");
  const result = body.result;
  const token = typeof result === "string" ? result : isRecord(result) ? optionalString(result.token) : undefined;
  if (!token) throw new Error("登录凭证获取失败，请重新登录智学网后再连接");
  xTokenCache = { value: token, expiresAt: Date.now() + X_TOKEN_TTL_MS };
  return token;
}

async function fetchAuthenticatedJson(url: string, retried = false): Promise<unknown> {
  const token = await getXToken(retried);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", XToken: token },
    credentials: "include"
  });
  if ((response.status === 401 || response.status === 403) && !retried) {
    xTokenCache = null;
    return fetchAuthenticatedJson(url, true);
  }
  return readJsonResponse(response, "智学网接口");
}

async function readJsonResponse(response: Response, moduleName: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${moduleName}请求失败（状态码 ${response.status}），请确认登录状态后重试`);
  if (!text.trim()) throw new Error(`${moduleName}返回空响应`);
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) throw new Error("not-object");
    return value;
  } catch {
    throw new Error(`${moduleName}返回了无法解析的数据`);
  }
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

function appendAcademicYear(url: URL, academicYear: AcademicYear | null): void {
  if (!academicYear) return;
  if (academicYear.beginTime !== undefined && academicYear.endTime !== undefined) {
    url.searchParams.set("startSchoolYear", String(academicYear.beginTime));
    url.searchParams.set("endSchoolYear", String(academicYear.endTime));
    return;
  }
  if (academicYear.startTime !== undefined && academicYear.endTime !== undefined) {
    url.searchParams.set("startSchoolYear", String(Math.floor(academicYear.startTime / 1000)));
    url.searchParams.set("endSchoolYear", String(Math.floor(Number(academicYear.endTime) / 1000)));
  }
}

function success(requestId: string, data: unknown): ExtensionResponse {
  return { requestId, success: true, data };
}

function failure(requestId: string, error: string): ExtensionResponse {
  return { requestId, success: false, error };
}

function requiredString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`${label}缺失`);
  return result;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

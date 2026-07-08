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

window.postMessage({ channel: OWL_SCRIPT_READY_CHANNEL }, window.location.origin);

window.addEventListener("message", async (event: MessageEvent<WindowRequestMessage | { channel?: string }>) => {
  if (!isWindowRequestMessage(event.data) || event.source !== window) {
    return;
  }

  const request = event.data.request;
  const response = await handleRequest(request);

  window.postMessage(
    {
      channel: OWL_RESPONSE_CHANNEL,
      response
    },
    window.location.origin
  );
});

function isWindowRequestMessage(data: unknown): data is WindowRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "channel" in data &&
    data.channel === OWL_REQUEST_CHANNEL &&
    "request" in data
  );
}

async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  try {
    switch (request.action) {
      case "getAcademicYear":
        return success(request.requestId, await getAcademicYear());
      case "getExamList":
        return success(request.requestId, await getExamList(request.payload as ExamListPayload));
      case "getExamDetail":
        return success(request.requestId, await getExamDetail(request.payload as ExamDetailPayload));
      case "getSubjectLevelTrend":
        return success(
          request.requestId,
          await getSubjectLevelTrend(request.payload as SubjectLevelTrendPayload)
        );
      default:
        return failure(request.requestId, `未知的操作类型: ${request.action}`);
    }
  } catch (error) {
    return failure(request.requestId, error instanceof Error ? error.message : String(error));
  }
}

async function getAcademicYear(): Promise<unknown> {
  return fetchZhixueJson("https://ali-bg.zhixue.com/zhixuebao/base/common/academicYear");
}

async function getExamList(payload: ExamListPayload): Promise<unknown> {
  const pageIndex = payload?.pageIndex || 1;
  const url = new URL("/zhixuebao/report/exam/getUserExamList", window.location.origin);
  url.searchParams.set("pageIndex", String(pageIndex));
  url.searchParams.set("pageSize", "10");
  appendAcademicYear(url, payload?.academicYear ?? null);

  return fetchZhixueJson(url.toString());
}

async function getExamDetail(payload: ExamDetailPayload): Promise<unknown> {
  if (!payload?.examId || !payload.examDetailType) {
    throw new Error("缺少考试ID或详情类型参数");
  }

  const url = new URL(`/zhixuebao/report/exam/${payload.examDetailType}`, window.location.origin);
  url.searchParams.set("examId", payload.examId);
  appendAcademicYear(url, payload.academicYear);

  return fetchZhixueJson(url.toString());
}

async function getSubjectLevelTrend(payload: SubjectLevelTrendPayload): Promise<unknown> {
  if (!payload?.examId || !payload.paperId) {
    throw new Error("缺少考试ID或试卷ID参数");
  }

  const url = new URL("/zhixuebao/report/paper/getLevelTrend", window.location.origin);
  url.searchParams.set("examId", payload.examId);
  url.searchParams.set("paperId", payload.paperId);
  appendAcademicYear(url, payload.academicYear);

  return fetchZhixueJson(url.toString());
}

async function fetchZhixueJson(url: string): Promise<unknown> {
  const xToken = localStorage.getItem("xToken");

  if (!xToken) {
    throw new Error("未找到 xToken，请确保已登录智学网");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      xtoken: xToken
    },
    credentials: "include"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `智学网接口请求失败: ${response.status} ${response.statusText}${detail ? ` - ${trimErrorDetail(detail)}` : ""}`
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error("智学网接口返回空响应");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`智学网接口返回非 JSON 内容: ${trimErrorDetail(body)}`);
  }
}

function appendAcademicYear(url: URL, academicYear: AcademicYear | null): void {
  if (!academicYear) {
    return;
  }

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
  return {
    requestId,
    success: true,
    data
  };
}

function failure(requestId: string, error: string): ExtensionResponse {
  return {
    requestId,
    success: false,
    error
  };
}

function trimErrorDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, 180);
}

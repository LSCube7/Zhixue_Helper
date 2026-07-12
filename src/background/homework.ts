import type {
  ExtensionResponse,
  ExtensionRequest,
  HomeworkListPayload,
  HomeworkResourcesPayload
} from "../shared/protocol";
import type {
  HomeworkItem,
  HomeworkListPage,
  HomeworkResource,
  HomeworkResourceCategory,
  HomeworkSubject
} from "../shared/types";

const HOMEWORK_ORIGIN = "https://mhw.zhixue.com";

export async function handleHomeworkRequest(request: ExtensionRequest, token: string, studentId: string): Promise<ExtensionResponse> {
  try {
    let data: HomeworkSubject[] | HomeworkListPage | HomeworkResource[];
    switch (request.action) {
      case "getHomeworkSubjects":
        data = await getHomeworkSubjects(token);
        break;
      case "getHomeworkList":
        data = await getHomeworkList(request.payload as HomeworkListPayload, token);
        break;
      case "getHomeworkResources":
        data = await getHomeworkResources(request.payload as HomeworkResourcesPayload, token, studentId);
        break;
      default:
        throw new Error("后台收到了未知作业操作");
    }
    return { requestId: request.requestId, success: true, data };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    return {
      requestId: request.requestId,
      success: false,
      error: messageText,
      errorCode: messageText.startsWith("AUTH_EXPIRED") ? "AUTH_EXPIRED" : "HOMEWORK_REQUEST_FAILED"
    };
  }
}

async function getHomeworkSubjects(token: string): Promise<HomeworkSubject[]> {
  const body = await fetchHomeworkJson("/hw/answer/homework/subjects", token, {
    method: "POST",
    body: JSON.stringify({ base: { appId: "APP" }, params: {} })
  });
  return (Array.isArray(body.result) ? body.result : [])
    .filter(isRecord)
    .map((item) => ({ code: optionalString(item.code) ?? "", name: optionalString(item.name) ?? "未知科目" }))
    .filter((item) => item.code);
}

async function getHomeworkList(payload: HomeworkListPayload, token: string): Promise<HomeworkListPage> {
  if (payload?.status !== 0 && payload?.status !== 1) throw new Error("作业状态参数无效");
  const url = new URL("/homework_middle_service/stuapp/getStudentHomeWorkList", HOMEWORK_ORIGIN);
  url.searchParams.set("completeStatus", String(payload.status));
  url.searchParams.set("createTime", String(payload.createTime ?? Date.now()));
  url.searchParams.set("pageIndex", "2");
  url.searchParams.set("pageSize", String(payload.pageSize || 20));
  url.searchParams.set("subjectCode", payload.subjectCode || "-1");
  url.searchParams.set("token", token);
  const body = await fetchHomeworkJson(url.toString(), token);
  const result = isRecord(body.result) ? body.result : {};
  const list = Array.isArray(result.list) ? result.list.filter(isRecord) : [];
  const items = list.map((item) => normalizeHomework(item, payload.status));
  return { items, hasMore: items.length >= (payload.pageSize || 20), nextCreateTime: items.at(-1)?.beginTime ?? null };
}

async function getHomeworkResources(payload: HomeworkResourcesPayload, token: string, studentId: string): Promise<HomeworkResource[]> {
  const homework = payload?.homework;
  if (!homework?.id) throw new Error("缺少作业信息");
  const requestBody = { base: { appId: "APP" }, params: { hwId: homework.id, stuHwId: homework.studentHomeworkId, studentId } };
  const resources: HomeworkResource[] = [];
  if (homework.typeCode === 102) {
    const detail = await fetchHomeworkJson("/hwreport/question/getStuReportDetail", token, { method: "POST", body: JSON.stringify(requestBody) });
    collectReportResources(isRecord(detail) ? detail.result : undefined, resources, homework.title);
  } else if (homework.typeCode === 105) {
    const [attachments, detail] = await Promise.all([
      fetchHomeworkJson("/hw/homework/attachment/list", token, { method: "POST", body: JSON.stringify(requestBody) }),
      fetchHomeworkJson("/hwreport/question/getStuReportDetail", token, { method: "POST", body: JSON.stringify(requestBody) }).catch(() => ({}))
    ]);
    if (Array.isArray(attachments.result)) attachments.result.forEach((item) => addResource(resources, item, "题目"));
    collectReportResources(isRecord(detail) ? detail.result : undefined, resources, homework.title);
  } else if (homework.typeCode === 107) {
    const detail = await fetchHomeworkJson("/hw/clock/answer/getClockHomeworkDetail", token, { method: "POST", body: JSON.stringify(requestBody) });
    collectClockResources(detail.result, resources, homework.title);
  } else {
    throw new Error(`暂不支持此作业类型（${homework.typeName || homework.typeCode}）`);
  }
  return dedupeResources(resources);
}

async function fetchHomeworkJson(pathOrUrl: string, token: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const endpoint = safeEndpointName(pathOrUrl);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json, text/plain, */*");
  headers.set("appName", "com.zhixue.student");
  headers.set("sucOriginAppKey", "zhixue_student");
  headers.set("sucUserToken", token);
  if (init.body) {
    headers.set("Authorization", token);
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : new URL(pathOrUrl, HOMEWORK_ORIGIN), { ...init, headers });
  } catch (error) {
    throw new Error(`作业接口网络请求失败（端点 ${endpoint}，原因 ${safeErrorMessage(error)}）`);
  }
  if (response.status === 401 || response.status === 403) throw new Error(`AUTH_EXPIRED: 登录状态已失效，请重新连接（端点 ${endpoint}，状态码 ${response.status}）`);
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new Error(`作业接口响应读取失败（端点 ${endpoint}，状态码 ${response.status}，原因 ${safeErrorMessage(error)}）`);
  }
  if (!response.ok) throw new Error(`作业接口请求失败（端点 ${endpoint}，状态码 ${response.status}）`);
  if (!text.trim()) throw new Error(`作业接口返回空响应（端点 ${endpoint}，状态码 ${response.status}）`);
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`作业接口返回非 JSON 数据（端点 ${endpoint}，状态码 ${response.status}，内容类型 ${response.headers.get("content-type") ?? "未知"}）`);
  }
  if (!isRecord(body)) throw new Error(`作业接口返回了无法解析的数据（端点 ${endpoint}）`);
  if ((typeof body.code === "number" && body.code !== 200 && body.code !== 0) || (typeof body.errorCode === "number" && body.errorCode !== 0)) {
    throw new Error(`作业接口返回错误（端点 ${endpoint}）：${optionalString(body.message) ?? optionalString(body.errorInfo) ?? "未知错误"}`);
  }
  return body;
}

function safeEndpointName(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl, HOMEWORK_ORIGIN).pathname;
  } catch {
    return "未知端点";
  }
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `；${error.cause.message}` : "";
  return `${error.name}: ${error.message}${cause}`;
}

function normalizeHomework(item: Record<string, unknown>, status: 0 | 1): HomeworkItem {
  const type = isRecord(item.homeWorkTypeDTO) ? item.homeWorkTypeDTO : {};
  return {
    id: requiredString(item.hwId, "作业 ID"), studentHomeworkId: optionalString(item.stuHwId) ?? "", classId: optionalString(item.classId),
    title: optionalString(item.hwTitle) ?? "未命名作业", subjectCode: optionalString(item.subjectCode) ?? "-1", subjectName: optionalString(item.subjectName) ?? "未知科目",
    typeCode: Number(type.typeCode ?? item.hwType ?? 0), typeName: optionalString(type.typeName) ?? optionalString(item.hwTypeName) ?? "未知类型",
    beginTime: Number(item.beginTime ?? 0), endTime: Number(item.endTime ?? 0), createTime: Number(item.createTime ?? 0), status, allowMakeup: Boolean(item.isAllowMakeup)
  };
}

function collectReportResources(value: unknown, resources: HomeworkResource[], title: string): void {
  if (!isRecord(value)) return;
  const description = optionalString(value.hwDescription);
  if (description) addResource(resources, { description, fileType: 5, name: `${title}_说明.txt` }, "说明");
  if (Array.isArray(value.answerAttachList)) value.answerAttachList.forEach((item) => addResource(resources, item, "答案"));
  if (!Array.isArray(value.mainTopics)) return;
  value.mainTopics.filter(isRecord).forEach((topic) => {
    addHtmlResources(resources, optionalString(topic.content), "题目");
    addHtmlResources(resources, optionalString(topic.answerHtml), "答案");
    addHtmlResources(resources, optionalString(topic.analysisHtml), "答案");
    if (Array.isArray(topic.subTopics)) topic.subTopics.filter(isRecord).forEach((subTopic) => {
      if (Array.isArray(subTopic.answerResList)) subTopic.answerResList.forEach((item) => addResource(resources, item, "提交"));
    });
  });
}

function collectClockResources(value: unknown, resources: HomeworkResource[], title: string): void {
  if (!isRecord(value)) return;
  const description = optionalString(value.description);
  if (description) addResource(resources, { description, fileType: 5, name: `${title}_说明.txt` }, "说明");
  if (Array.isArray(value.hwTopicAttachments)) value.hwTopicAttachments.forEach((item) => addResource(resources, item, "题目"));
  if (Array.isArray(value.hwAnswerAttachments)) value.hwAnswerAttachments.forEach((item) => addResource(resources, item, "答案"));
  const previews = Array.isArray(value.hwClockRecordPreviewResponses) ? value.hwClockRecordPreviewResponses.filter(isRecord) : [];
  previews.forEach((preview) => {
    if (Array.isArray(preview.teacherAnswerAttachments)) preview.teacherAnswerAttachments.forEach((item) => addResource(resources, item, "答案"));
    if (Array.isArray(preview.answerAttachments)) preview.answerAttachments.forEach((item) => addResource(resources, item, "提交"));
  });
}

function addHtmlResources(resources: HomeworkResource[], html: string | undefined, category: HomeworkResourceCategory): void {
  if (!html) return;
  for (const match of html.matchAll(/(?:bigger|src|href)=["']([^"']+)["']/gi)) addResource(resources, match[1], category);
}

function addResource(resources: HomeworkResource[], value: unknown, category: HomeworkResourceCategory): void {
  if (typeof value === "string") {
    if (!value.trim()) return;
    const url = normalizeResourceUrl(value);
    resources.push({ id: crypto.randomUUID(), name: fileNameFromUrl(url), category, url });
    return;
  }
  if (!isRecord(value)) return;
  if (Number(value.fileType) === 5 || (!value.path && value.description)) {
    const text = optionalString(value.description);
    if (text) resources.push({ id: crypto.randomUUID(), name: optionalString(value.name) ?? `${category}.txt`, category, text });
    return;
  }
  const rawUrl = optionalString(value.path) ?? optionalString(value.url);
  if (!rawUrl) return;
  const url = normalizeResourceUrl(rawUrl);
  resources.push({ id: crypto.randomUUID(), name: optionalString(value.name) ?? fileNameFromUrl(url), category, url });
}

function dedupeResources(resources: HomeworkResource[]): HomeworkResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => { const key = `${resource.category}::${resource.url ?? resource.text ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function normalizeResourceUrl(value: string): string { try { return new URL(value, HOMEWORK_ORIGIN).toString(); } catch { return value; } }
function fileNameFromUrl(url: string): string { try { return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "资源文件"); } catch { return "资源文件"; } }
function requiredString(value: unknown, label: string): string { const result = optionalString(value); if (!result) throw new Error(`${label}缺失`); return result; }
function optionalString(value: unknown): string | undefined { if (typeof value === "string" && value.trim()) return value.trim(); if (typeof value === "number") return String(value); return undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

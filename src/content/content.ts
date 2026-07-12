import {
  OWL_REQUEST_CHANNEL,
  OWL_RESPONSE_CHANNEL,
  OWL_SCRIPT_READY_CHANNEL,
  OWL_HOMEWORK_BACKGROUND_CHANNEL,
  type ExtensionRequest,
  type ExtensionResponse,
  type HomeworkBackgroundRequest,
  type WindowResponseMessage
} from "../shared/protocol";

const REQUEST_TIMEOUT_MS = 30000;
const injectedScriptPath = "assets/injected.js";
const pendingRequests = new Map<
  string,
  {
    resolve: (response: ExtensionResponse) => void;
    timeoutId: number;
  }
>();
let homeworkSessionCache: { token: string; studentId: string; expiresAt: number } | null = null;

injectPageScript();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPageRequest(message)) return false;
  const request = message;
  (isHomeworkAction(request.action) ? forwardHomeworkRequest(request) : forwardRequest(request))
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: isHomeworkAction(request.action) ? "HOMEWORK_REQUEST_FAILED" : undefined
      } satisfies ExtensionResponse);
    });

  return true;
});

function isPageRequest(message: unknown): message is ExtensionRequest {
  if (typeof message !== "object" || message === null || !("requestId" in message) || !("action" in message)) return false;
  const action = message.action;
  return action === "connectPage" || action === "getAcademicYear" || action === "getExamList" || action === "getExamDetail" || action === "getSubjectLevelTrend" || isHomeworkAction(action);
}

function isHomeworkAction(action: unknown): boolean {
  return action === "getHomeworkSubjects" || action === "getHomeworkList" || action === "getHomeworkResources";
}

async function forwardHomeworkRequest(request: ExtensionRequest, retried = false): Promise<ExtensionResponse> {
  const session = await getHomeworkSession(retried);
  const response = await chrome.runtime.sendMessage({
    channel: OWL_HOMEWORK_BACKGROUND_CHANNEL,
    request,
    token: session.token,
    studentId: session.studentId
  } satisfies HomeworkBackgroundRequest) as ExtensionResponse;
  if (response.errorCode === "AUTH_EXPIRED" && !retried) {
    homeworkSessionCache = null;
    return forwardHomeworkRequest(request, true);
  }
  return response;
}

async function getHomeworkSession(forceRefresh: boolean): Promise<{ token: string; studentId: string }> {
  if (!forceRefresh && homeworkSessionCache && homeworkSessionCache.expiresAt > Date.now()) return homeworkSessionCache;
  const [tokenResponse, profileResponse] = await Promise.all([
    fetch("/middleweb/newToken", { credentials: "include", headers: { Accept: "application/json" } }),
    fetch("/container/container/student/account/", { credentials: "include", headers: { Accept: "application/json" } })
  ]);
  if (!tokenResponse.ok || !profileResponse.ok) throw new Error(`作业会话验证失败（${tokenResponse.status}/${profileResponse.status}），请重新登录后连接`);
  const tokenBody = await tokenResponse.json() as { result?: string | { token?: string } };
  const profileBody = await profileResponse.json() as { student?: { id?: string } };
  const token = typeof tokenBody.result === "string" ? tokenBody.result : tokenBody.result?.token;
  const studentId = profileBody.student?.id;
  if (!token || !studentId) throw new Error("未获取到学生作业访问凭证，请重新登录后连接");
  homeworkSessionCache = { token, studentId, expiresAt: Date.now() + 9 * 60 * 1000 };
  return homeworkSessionCache;
}

window.addEventListener("message", (event: MessageEvent<WindowResponseMessage | { channel?: string }>) => {
  if (!isWindowResponseMessage(event.data) || event.source !== window) {
    return;
  }

  const response = event.data.response;
  const pending = pendingRequests.get(response.requestId);

  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeoutId);
  pendingRequests.delete(response.requestId);
  pending.resolve(response);
});

function isWindowResponseMessage(data: unknown): data is WindowResponseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "channel" in data &&
    data.channel === OWL_RESPONSE_CHANNEL &&
    "response" in data
  );
}

function forwardRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(request.requestId);
      resolve({
        requestId: request.requestId,
        success: false,
        error: "请求超时"
      });
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(request.requestId, { resolve, timeoutId });

    window.postMessage(
      {
        channel: OWL_REQUEST_CHANNEL,
        request
      },
      window.location.origin
    );
  });
}

function injectPageScript(): void {
  if (document.documentElement.dataset.owlInsightInjected === "true") {
    return;
  }

  document.documentElement.dataset.owlInsightInjected = "true";

  const script = document.createElement("script");
  script.type = "module";
  script.src = chrome.runtime.getURL(injectedScriptPath);
  script.onload = () => {
    script.remove();
  };
  script.onerror = () => {
    console.error("[Owl Insight] injected script failed to load");
    script.remove();
  };

  (document.head || document.documentElement).appendChild(script);
}

window.addEventListener("message", (event: MessageEvent<{ channel?: string }>) => {
  if (event.source === window && event.data?.channel === OWL_SCRIPT_READY_CHANNEL) {
    console.info("[Owl Insight] injected script is ready");
  }
});

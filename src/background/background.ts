import { handleHomeworkRequest } from "./homework";
import {
  OWL_BACKGROUND_HEALTH_CHANNEL,
  OWL_HOMEWORK_BACKGROUND_CHANNEL,
  type ExtensionResponse,
  type HomeworkBackgroundRequest
} from "../shared/protocol";

const HOMEWORK_CORS_RULE_ID = 2101;
const homeworkNetworkReady = installHomeworkCorsRule();

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isBackgroundHealthRequest(message)) {
    void homeworkNetworkReady
      .then(() => sendResponse({ ready: true, version: chrome.runtime.getManifest().version }))
      .catch((error: unknown) => sendResponse({
        ready: false,
        version: chrome.runtime.getManifest().version,
        error: `作业网络规则初始化失败：${getErrorMessage(error)}`,
        errorCode: isCorsApiUnavailableError(error) ? "CORS_RULE_UNAVAILABLE" : "CORS_RULE_SETUP_FAILED"
      }));
    return true;
  }

  if (!isHomeworkBackgroundRequest(message)) return false;

  if (!isTrustedZhixueSender(sender)) {
    sendResponse({
      requestId: message.request.requestId,
      success: false,
      error: "作业请求来源验证失败，请重新连接智学网页面",
      errorCode: "HOMEWORK_REQUEST_FAILED"
    } satisfies ExtensionResponse);
    return false;
  }

  void homeworkNetworkReady
    .then(() => handleHomeworkRequest(message.request, message.token, message.studentId))
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({
      requestId: message.request.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: "HOMEWORK_REQUEST_FAILED"
    } satisfies ExtensionResponse));
  return true;
});

async function installHomeworkCorsRule(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateSessionRules) {
    const error = new Error("当前浏览器未提供 declarativeNetRequest API，请确认扩展网络请求权限已生效");
    error.name = "CORS_RULE_UNAVAILABLE";
    throw error;
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [HOMEWORK_CORS_RULE_ID],
    addRules: [{
      id: HOMEWORK_CORS_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          {
            header: "access-control-allow-origin",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: `chrome-extension://${chrome.runtime.id}`
          },
          {
            header: "access-control-allow-methods",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "GET, POST, OPTIONS"
          },
          {
            header: "access-control-allow-headers",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "Authorization, Content-Type, appName, sucOriginAppKey, sucUserToken"
          }
        ]
      },
      condition: {
        requestDomains: ["mhw.zhixue.com"],
        initiatorDomains: [chrome.runtime.id],
        requestMethods: [
          chrome.declarativeNetRequest.RequestMethod.GET,
          chrome.declarativeNetRequest.RequestMethod.POST,
          chrome.declarativeNetRequest.RequestMethod.OPTIONS
        ],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
      }
    }]
  });
}

function isBackgroundHealthRequest(message: unknown): message is { channel: typeof OWL_BACKGROUND_HEALTH_CHANNEL } {
  return typeof message === "object"
    && message !== null
    && "channel" in message
    && message.channel === OWL_BACKGROUND_HEALTH_CHANNEL;
}

function isHomeworkBackgroundRequest(message: unknown): message is HomeworkBackgroundRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<HomeworkBackgroundRequest>;
  return candidate.channel === OWL_HOMEWORK_BACKGROUND_CHANNEL
    && typeof candidate.token === "string"
    && typeof candidate.studentId === "string"
    && typeof candidate.request?.requestId === "string"
    && (candidate.request.action === "getHomeworkSubjects"
      || candidate.request.action === "getHomeworkList"
      || candidate.request.action === "getHomeworkResources");
}

function isTrustedZhixueSender(sender: chrome.runtime.MessageSender): boolean {
  const sourceUrl = sender.url ?? sender.tab?.url;
  if (!sender.tab?.id || !sourceUrl) return false;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && url.hostname === "www.zhixue.com";
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCorsApiUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.name === "CORS_RULE_UNAVAILABLE";
}

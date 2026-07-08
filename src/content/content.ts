import {
  OWL_REQUEST_CHANNEL,
  OWL_RESPONSE_CHANNEL,
  OWL_SCRIPT_READY_CHANNEL,
  type ExtensionRequest,
  type ExtensionResponse,
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

injectPageScript();

chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
  forwardRequest(request)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } satisfies ExtensionResponse);
    });

  return true;
});

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

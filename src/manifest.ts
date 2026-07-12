const manifest = {
  manifest_version: 3,
  name: "__MSG_extensionName__",
  version: "2.2.0",
  description: "__MSG_extensionDescription__",
  default_locale: "zh_CN",
  permissions: ["activeTab", "storage", "tabs", "downloads", "scripting", "declarativeNetRequest"],
  host_permissions: ["https://www.zhixue.com/*", "https://ali-bg.zhixue.com/*", "https://mhw.zhixue.com/*"],
  action: {
    default_title: "__MSG_actionTitle__",
    default_icon: {
      "16": "icons/owl-insight-16.png",
      "48": "icons/owl-insight-48.png",
      "128": "icons/owl-insight-128.png"
    }
  },
  background: {
    service_worker: "src/background/background.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://www.zhixue.com/*"],
      js: ["src/content/content.ts"],
      run_at: "document_end"
    }
  ],
  web_accessible_resources: [
    {
      resources: ["assets/injected.js"],
      matches: ["https://www.zhixue.com/*"]
    }
  ],
  icons: {
    "16": "icons/owl-insight-16.png",
    "48": "icons/owl-insight-48.png",
    "128": "icons/owl-insight-128.png"
  }
} satisfies chrome.runtime.ManifestV3;

export default manifest;

const manifest = {
  manifest_version: 3,
  name: "Owl Insight",
  version: "2.0.0",
  description: "Owl Insight：提高智学网使用体验",
  permissions: ["activeTab", "storage", "tabs"],
  host_permissions: ["https://www.zhixue.com/*", "https://ali-bg.zhixue.com/*"],
  action: {
    default_title: "Owl Insight"
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
    "16": "icon.png",
    "48": "icon.png",
    "128": "icon.png"
  }
} satisfies chrome.runtime.ManifestV3;

export default manifest;

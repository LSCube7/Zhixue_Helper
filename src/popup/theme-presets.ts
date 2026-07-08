export type ColorMode = "light" | "dark" | "system";

export type ThemePreset = {
  id: string;
  name: string;
  seedColor: string;
  group: "standard" | "pride";
  prideFlag?: string;
};

export type OwlSettings = {
  themePreset: string;
  themeSeedColor: string;
  colorMode: ColorMode;
};

export const settingsKey = "owl-insight-settings";
export const defaultThemeSeed = "#4f7cff";
export const customThemePresetId = "custom";

export const defaultSettings: OwlSettings = {
  themePreset: "default-blue",
  themeSeedColor: defaultThemeSeed,
  colorMode: "system"
};

export const prideThemeFlags = [
  { id: "trans", name: "Trans" },
  { id: "non-binary", name: "Non-binary" },
  { id: "bisexual", name: "Bisexual" },
  { id: "pansexual", name: "Pansexual" },
  { id: "lesbian", name: "Lesbian" },
  { id: "gay", name: "Gay" },
  { id: "asexual", name: "Asexual" },
  { id: "aromantic", name: "Aromantic" }
] as const;

export const themePresets: ThemePreset[] = [
  { id: "default-blue", name: "鸮蓝", seedColor: defaultThemeSeed, group: "standard" },
  { id: "green", name: "森绿", seedColor: "#2f6f4e", group: "standard" },
  { id: "cyan", name: "青色", seedColor: "#006b5f", group: "standard" },
  { id: "orange", name: "橙色", seedColor: "#b65d00", group: "standard" },
  { id: "purple", name: "紫色", seedColor: "#7257b8", group: "standard" },
  { id: "graphite", name: "石墨", seedColor: "#5f6368", group: "standard" },
  { id: "trans-blue", name: "Trans 蓝", seedColor: "#5bcefa", group: "pride", prideFlag: "trans" },
  { id: "trans-pink", name: "Trans 粉", seedColor: "#f5a9b8", group: "pride", prideFlag: "trans" },
  { id: "non-binary-yellow", name: "Non-binary 黄", seedColor: "#fff430", group: "pride", prideFlag: "non-binary" },
  { id: "non-binary-purple", name: "Non-binary 紫", seedColor: "#9c59d1", group: "pride", prideFlag: "non-binary" },
  { id: "bisexual-pink", name: "Bisexual 粉", seedColor: "#d60270", group: "pride", prideFlag: "bisexual" },
  { id: "bisexual-blue", name: "Bisexual 蓝", seedColor: "#0038a8", group: "pride", prideFlag: "bisexual" },
  { id: "pansexual-magenta", name: "Pansexual 洋红", seedColor: "#ff218c", group: "pride", prideFlag: "pansexual" },
  { id: "pansexual-cyan", name: "Pansexual 青", seedColor: "#21b1ff", group: "pride", prideFlag: "pansexual" },
  { id: "lesbian-orange", name: "Lesbian 橙", seedColor: "#d52d00", group: "pride", prideFlag: "lesbian" },
  { id: "lesbian-rose", name: "Lesbian 玫红", seedColor: "#a30262", group: "pride", prideFlag: "lesbian" },
  { id: "gay-green", name: "Gay 绿", seedColor: "#00a170", group: "pride", prideFlag: "gay" },
  { id: "gay-teal", name: "Gay 蓝绿", seedColor: "#00b9b4", group: "pride", prideFlag: "gay" },
  { id: "asexual-purple", name: "Asexual 紫", seedColor: "#800080", group: "pride", prideFlag: "asexual" },
  { id: "aromantic-green", name: "Aromantic 绿", seedColor: "#3da542", group: "pride", prideFlag: "aromantic" }
];

export function isValidHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-fA-F]{6}$/.test(value));
}

export function normalizeHexColor(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

export function resolveThemeSeed(seedColor: string | undefined): string {
  return isValidHexColor(seedColor) ? seedColor : defaultThemeSeed;
}

export function inferThemePreset(seedColor: string | undefined): string {
  const seed = resolveThemeSeed(seedColor).toLowerCase();
  return themePresets.find((preset) => preset.seedColor.toLowerCase() === seed)?.id ?? customThemePresetId;
}

export function readSettings(): OwlSettings {
  try {
    const saved = localStorage.getItem(settingsKey);
    return saved ? { ...defaultSettings, ...(JSON.parse(saved) as Partial<OwlSettings>) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: OwlSettings): void {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

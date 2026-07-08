import { argbFromHex, hexFromArgb, themeFromSourceColor, type Scheme } from "@material/material-color-utilities";

import { defaultThemeSeed, readSettings, resolveThemeSeed, type ColorMode, type OwlSettings } from "./theme-presets";

const schemeColorRoles = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary"
] as const;

export function applyStoredTheme(): OwlSettings {
  const settings = readSettings();
  applyTheme(settings);
  return settings;
}

export function applyTheme(settings: Partial<OwlSettings>): void {
  const seed = resolveThemeSeed(settings.themeSeedColor || defaultThemeSeed);
  const mode = resolveMode(settings.colorMode);
  const root = document.documentElement;
  const theme = themeFromSourceColor(argbFromHex(seed));
  const scheme = mode === "dark" ? theme.schemes.dark : theme.schemes.light;

  root.dataset.theme = mode;
  root.style.setProperty("--md-source-color", seed);
  schemeColorRoles.forEach((role) => setSchemeColor(root, role, readSchemeColor(scheme, role)));
  applySurfaceContainers(root, scheme, mode);
}

function resolveMode(mode: ColorMode | undefined): "light" | "dark" {
  if (!mode || mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return mode;
}

function roleToCssName(role: string): string {
  return role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function readSchemeColor(scheme: Scheme, role: (typeof schemeColorRoles)[number]): string {
  return hexFromArgb(scheme.toJSON()[role]);
}

function setSchemeColor(root: HTMLElement, role: (typeof schemeColorRoles)[number], value: string): void {
  root.style.setProperty(`--md-sys-color-${roleToCssName(role)}`, value);
}

function applySurfaceContainers(root: HTMLElement, scheme: Scheme, mode: "light" | "dark"): void {
  const surface = readSchemeColor(scheme, "surface");
  const primaryContainer = readSchemeColor(scheme, "primaryContainer");
  const secondaryContainer = readSchemeColor(scheme, "secondaryContainer");
  const onSurface = readSchemeColor(scheme, "onSurface");

  if (mode === "dark") {
    root.style.setProperty("--md-sys-color-surface-dim", mixHex(surface, "#000000", 0.08));
    root.style.setProperty("--md-sys-color-surface-bright", mixHex(surface, primaryContainer, 0.18));
    root.style.setProperty("--md-sys-color-surface-container-lowest", mixHex(surface, "#000000", 0.22));
    root.style.setProperty("--md-sys-color-surface-container-low", mixHex(surface, primaryContainer, 0.08));
    root.style.setProperty("--md-sys-color-surface-container", mixHex(surface, primaryContainer, 0.12));
    root.style.setProperty("--md-sys-color-surface-container-high", mixHex(surface, secondaryContainer, 0.16));
    root.style.setProperty("--md-sys-color-surface-container-highest", mixHex(surface, secondaryContainer, 0.22));
    return;
  }

  root.style.setProperty("--md-sys-color-surface-dim", mixHex(surface, onSurface, 0.12));
  root.style.setProperty("--md-sys-color-surface-bright", surface);
  root.style.setProperty("--md-sys-color-surface-container-lowest", "#ffffff");
  root.style.setProperty("--md-sys-color-surface-container-low", mixHex(surface, primaryContainer, 0.2));
  root.style.setProperty("--md-sys-color-surface-container", mixHex(surface, primaryContainer, 0.28));
  root.style.setProperty("--md-sys-color-surface-container-high", mixHex(surface, secondaryContainer, 0.34));
  root.style.setProperty("--md-sys-color-surface-container-highest", mixHex(surface, secondaryContainer, 0.45));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (value: number) => value.toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixHex(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return rgbToHex({
    r: mix(start.r, end.r),
    g: mix(start.g, end.g),
    b: mix(start.b, end.b)
  });
}

import { useEffect } from "react";

/**
 * Telegram WebApp SDK wrapper：在 TG WebView 里 `window.Telegram.WebApp` 由
 * `telegram-web-app.js` 注入；非 TG 环境（本地 Vite 直连预览）下返回 null。
 * 组件里统一用 `getTelegram()` 取，null-safe 调用。
 */

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
  /** "light" | "dark"，由 TG 宿主按当前主题推断 */
  colorScheme?: "light" | "dark";
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  ready: () => void;
  expand: () => void;
  close?: () => void;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  showConfirm?: (msg: string, cb: (ok: boolean) => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    notificationOccurred: (kind: "success" | "warning" | "error") => void;
    impactOccurred: (kind: "light" | "medium" | "heavy") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** 获取 initData；非 TG 环境返回空字符串，后端 401 会自然拒绝 */
export function getInitData(): string {
  return getTelegram()?.initData ?? "";
}

/** 把当前 TG colorScheme 写到 `<html data-theme>`，HeroUI 主题跟着切。
 *  非 TG 环境（本地 Vite）落到系统偏好。 */
export function syncThemeFromTelegram(): void {
  if (typeof document === "undefined") return;
  const tg = getTelegram();
  const scheme =
    tg?.colorScheme ??
    (window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  document.documentElement.dataset.theme = scheme;
  document.documentElement.classList.toggle("dark", scheme === "dark");
}

/**
 * App 启动时调用一次：ready + expand + 主题。
 *
 * **注意不碰 BackButton**。BackButton 的显示状态由每个页面用 `useBackButton`
 * 自己声明。之前在这里无条件 hide 会和子页面的 show 冲突 —— React useEffect
 * 运行顺序是子先于父，父在 `__root` 里 hide 会把子组件 show 过的覆盖掉。
 */
export function initTelegramChrome(): void {
  const tg = getTelegram();
  syncThemeFromTelegram();
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.onEvent?.("themeChanged", syncThemeFromTelegram);
}

/**
 * 页面声明 BackButton 行为：
 *   useBackButton(url)        → 显示返回键，点击 location.href = url
 *   useBackButton(undefined)  → 隐藏返回键（根页面）
 *
 * 每个页面调用一次，卸载时自动 hide + 摘 handler。
 */
export function useBackButton(targetUrl: string | undefined): void {
  useEffect(() => {
    const tg = getTelegram();
    const bb = tg?.BackButton;
    if (!bb) return;
    if (!targetUrl) {
      bb.hide();
      return;
    }
    const handler = () => {
      window.location.href = targetUrl;
    };
    bb.show();
    bb.onClick(handler);
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, [targetUrl]);
}

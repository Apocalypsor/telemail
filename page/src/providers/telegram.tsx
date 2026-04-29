import {
  disableVerticalSwipes,
  expandViewport,
  init,
  isFullscreen,
  isTMA,
  miniAppReady,
  mountBackButton,
  mountMainButton,
  mountMiniAppSync,
  mountSecondaryButton,
  mountSettingsButton,
  mountSwipeBehavior,
  mountThemeParamsSync,
  mountViewport,
  requestFullscreen,
  retrieveLaunchParams,
  retrieveRawInitData,
  setMiniAppBackgroundColor,
  setMiniAppBottomBarColor,
  setMiniAppHeaderColor,
} from "@telegram-apps/sdk-react";
import { type ReactNode, useEffect } from "react";
import { THEME_COLORS } from "@/styles/theme";

/** Raw initData 头给 ky 用（`api/client.ts` 注入到 `X-Telegram-Init-Data`）。
 *  非 TG 环境下 SDK 抛 `LaunchParamsRetrieveError`，吞掉返回空串。 */
export function getInitData(): string {
  try {
    return retrieveRawInitData() ?? "";
  } catch {
    return "";
  }
}

function isMobilePlatform(): boolean {
  try {
    const p = retrieveLaunchParams().tgWebAppPlatform;
    return p === "ios" || p === "android" || p === "android_x";
  } catch {
    return false;
  }
}

/**
 * 挂根部一次。`isTMA()` 同步嗅探当前环境是不是 TG WebApp（看 launch params /
 * window.Telegram）—— 浏览器里直接打开 web 路由（`/mail/:id` 等）会走这里但不
 * 在 TG，跳过所有 SDK 操作。
 *
 * Bot API 版本和功能可用性由各自 `xxx.isAvailable()` 在 SDK 内部判断；调用前不
 * 必再手写 `isVersionAtLeast`。
 *
 * Mini App 永远走 zinc/emerald 固定深色（和 web 一致），不跟 TG 客户端的
 * light/dark，所以直接 `setMiniAppHeaderColor(THEME_COLORS.bg)` 等覆盖。
 *
 * 移动端（iOS / Android）请求 Bot API 8.0 的 `requestFullscreen()`：手机屏幕小，
 * 多挤出 ~50px 给内容用。`app.css` 通过 `--tg-safe-area-inset-*` +
 * `--tg-content-safe-area-inset-*` 双 inset 给 body 加 padding 避开浮动 chrome。
 */
export function TelegramProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isTMA()) return;

    const cleanup = init();

    // 顺序：mount* 全部跑完再 ready / 设色 / 全屏。每步 isAvailable 兜底，
    // 老客户端没有的功能 SDK 会标记 unsupported，调用前过滤掉避免抛错。
    if (mountMiniAppSync.isAvailable()) mountMiniAppSync();
    if (mountThemeParamsSync.isAvailable()) mountThemeParamsSync();
    if (mountViewport.isAvailable()) mountViewport();
    if (mountBackButton.isAvailable()) mountBackButton();
    if (mountMainButton.isAvailable()) mountMainButton();
    if (mountSecondaryButton.isAvailable()) mountSecondaryButton();
    if (mountSettingsButton.isAvailable()) mountSettingsButton();
    if (mountSwipeBehavior.isAvailable()) mountSwipeBehavior();

    if (miniAppReady.isAvailable()) miniAppReady();
    if (expandViewport.isAvailable()) expandViewport();
    if (disableVerticalSwipes.isAvailable()) disableVerticalSwipes();

    if (setMiniAppHeaderColor.isAvailable())
      setMiniAppHeaderColor(THEME_COLORS.bg);
    if (setMiniAppBackgroundColor.isAvailable())
      setMiniAppBackgroundColor(THEME_COLORS.bg);
    if (setMiniAppBottomBarColor.isAvailable())
      setMiniAppBottomBarColor(THEME_COLORS.bg);

    if (
      isMobilePlatform() &&
      requestFullscreen.isAvailable() &&
      !isFullscreen()
    ) {
      requestFullscreen().catch(() => {
        // 手机不支持 / 用户拒绝 / TG 已经全屏 —— 都吞掉
      });
    }

    return cleanup;
  }, []);

  return <>{children}</>;
}

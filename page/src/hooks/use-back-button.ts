import { useRouter } from "@tanstack/react-router";
import {
  hideBackButton,
  offBackButtonClick,
  onBackButtonClick,
  showBackButton,
} from "@telegram-apps/sdk-react";
import { useEffect } from "react";

// useBackButton(url)        → 显示 BackButton，点击 SPA 跳转到 url
// useBackButton(undefined)  → 隐藏（根页面）
//
// 全屏时不要 showBackButton —— TG 客户端在浮动 pill 里自己渲染了 ✕ 关闭按钮，
// 我们的 ← 会盖在同一位置把那个 ✕ 顶掉。根页保持 hide 让用户用 TG 原生 ✕ 关闭。
//
// 跳转用 TSR 的 history.push 走 SPA 路由 —— 之前用 window.location.href 做硬刷新，
// 跟 cleanup 的 hideBackButton() postMessage 跑赢比赛：返回后新页 TG 状态卡在
// "BackButton shown" 不下来。SPA 导航 JS 上下文不销毁，cleanup 干净跑完。
//
// 非 TG 环境 / 老客户端：SDK 自身的 isAvailable 兜底，全部 no-op。
export function useBackButton(targetUrl: string | undefined): void {
  const router = useRouter();

  useEffect(() => {
    if (!targetUrl) {
      if (hideBackButton.isAvailable()) hideBackButton();
      return;
    }
    const handler = () => {
      router.history.push(targetUrl);
    };
    if (showBackButton.isAvailable()) showBackButton();
    if (onBackButtonClick.isAvailable()) onBackButtonClick(handler);
    return () => {
      if (offBackButtonClick.isAvailable()) offBackButtonClick(handler);
      if (hideBackButton.isAvailable()) hideBackButton();
    };
  }, [targetUrl, router]);
}

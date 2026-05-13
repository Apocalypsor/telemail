import {
  useMainButton,
  useSecondaryButton,
  useSettingsButton,
} from "@page/hooks/use-bottom-button";
import { type MailAction, useMailActions } from "@page/hooks/use-mail-actions";
import { THEME_COLORS } from "@page/styles/theme";
import {
  alertPopup,
  closeMiniAppSafe,
  confirmPopup,
  notifyHaptic,
  openTgLink,
} from "@page/utils/tg";
import {
  type ShowPopupOptionsButton,
  showPopup,
  showSettingsButton,
} from "@telegram-apps/sdk-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 邮件预览页的操作入口 —— 用 TG 原生 MainButton + SecondaryButton +
 * SettingsButton + showPopup 做，**不渲染任何 DOM**。
 *
 *   MainButton "⚡ 操作"     → popup: 星标 / 归档 / 标垃圾（按邮件状态）
 *   SecondaryButton          → 设置提醒 + 分享 + 跳 TG 原消息
 *     多项 → "🔗 更多" popup
 *     单项 → 按钮直接做
 *     无   → 隐藏
 *   SettingsButton (右上角 ⋮) → 刷新邮件 / 切 CORS 图片代理；老客户端无此
 *                              按钮 → 退化到 SecondaryButton extras 末位
 *
 * popup 有 3 按钮硬上限，所以邮件状态动作和工具操作拆到两个原生按钮里。
 *
 * 成功后：HapticFeedback + onChanged() refetch 数据 + 原生 popup；
 * terminal 动作（归档/删除/标垃圾/移出归档/移回）成功后先显示短暂完成态，
 * 再隐藏 MainButton，SecondaryButton 保持（分享一封已归档的邮件仍有意义）。
 * 失败：alertPopup(error) 弹原生 popup。
 */
export const MailFab = ({
  emailMessageId,
  accountId,
  token,
  starred: initialStarred,
  inJunk,
  inArchive,
  canArchive,
  folder,
  subject,
  webMailUrl,
  tgMessageLink,
  useProxy,
  onRefresh,
  onToggleProxy,
  onSetReminder,
  onChanged,
}: MailFabProps) => {
  const [status, setStatus] = useState<ActionStatus | null>(null);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(
      () => setStatus(null),
      status.terminal ? TERMINAL_STATUS_DURATION_MS : STATUS_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [status]);

  // 设置菜单走 TG SettingsButton（右上角 ⋮）。Bot API 7.0+；不可用 → 回落到
  // SecondaryButton extras 末位。注：还需 @BotFather 把 bot menu button 配为
  // "settings" 才会显示 —— 部署时检查。
  const hasSettingsButton = showSettingsButton.isAvailable();
  const refreshMail = useCallback(async () => {
    if (!onRefresh) return;
    try {
      await onRefresh();
      notifyHaptic("success");
    } catch (err) {
      notifyHaptic("error");
      await alertPopup(
        err instanceof Error ? err.message : "刷新失败，请稍后再试",
      );
    }
  }, [onRefresh]);
  // 点 SettingsButton 弹设置 popup。popup 不可用 → 退化到刷新邮件（没有刷新
  // 回调时再退回到图片代理 toggle）。
  const onSettingsClick = useCallback(async () => {
    if (!showPopup.isAvailable()) {
      if (onRefresh) {
        await refreshMail();
      } else {
        onToggleProxy();
      }
      return;
    }
    const id = await showPopup({
      title: "设置",
      message: useProxy
        ? "图片代理：🟢 开启\n外部图片走代理加载，绕过防盗链"
        : "图片代理：⚪️ 关闭\n直接加载外部图片，部分可能显示破损",
      buttons: [
        ...(onRefresh
          ? [
              {
                id: "refresh",
                type: "default",
                text: "🔄 刷新邮件",
              } satisfies ShowPopupOptionsButton,
            ]
          : []),
        {
          id: "toggle-proxy",
          type: "default",
          text: useProxy ? "🚫 关闭代理" : "✅ 开启代理",
        },
      ],
    });
    if (id === "refresh") await refreshMail();
    if (id === "toggle-proxy") onToggleProxy();
  }, [useProxy, onRefresh, refreshMail, onToggleProxy]);
  useSettingsButton(hasSettingsButton ? onSettingsClick : undefined);
  const { starred, done, pending, run } = useMailActions({
    emailMessageId,
    accountId,
    token,
    initialStarred,
    folder,
    onChanged,
  });

  // ─── 邮件状态动作（MainButton） ────────────────────────────────────────

  const actions = useMemo<ActionDef[]>(() => {
    if (inArchive) {
      return [
        {
          id: "unarchive",
          label: "📥 移出归档",
          type: "default",
          terminal: true,
          doneLabel: "✓ 已移出归档",
        },
      ];
    }
    if (inJunk) {
      return [
        {
          id: "toggle-star",
          label: starred ? "✅ 取消星标" : "⭐ 星标",
          type: "default",
          terminal: false,
        },
        {
          id: "move-to-inbox",
          label: "📥 移到收件箱",
          type: "default",
          terminal: true,
          doneLabel: "✓ 已移回收件箱",
        },
        {
          id: "trash",
          label: "🗑 删除邮件",
          type: "destructive",
          terminal: true,
          confirmText: "删除这封邮件？此操作可能不可撤销。",
          doneLabel: "✓ 已删除",
        },
      ];
    }
    // Inbox 默认
    const list: ActionDef[] = [
      {
        id: "toggle-star",
        label: starred ? "✅ 取消星标" : "⭐ 星标",
        type: "default",
        terminal: false,
      },
    ];
    if (canArchive) {
      list.push({
        id: "archive",
        label: "📥 归档",
        type: "default",
        terminal: true,
        doneLabel: "✓ 已归档",
      });
    }
    list.push({
      id: "mark-as-junk",
      label: "🚫 标记为垃圾",
      type: "destructive",
      terminal: true,
      confirmText: "把这封邮件标记为垃圾邮件？它会从当前收件箱视图移出。",
      doneLabel: "✓ 已标垃圾",
    });
    return list;
  }, [inArchive, inJunk, canArchive, starred]);

  /**
   * 跑一个动作，处理 TG 端的 Haptic + 错误 alert。useMailActions 的 hook
   * 已经管 starred/done/pending 状态和 onChanged 回调，这里只负责 TG 特有的
   * 反馈 UI。toggle-star 用 hook 当前 starred 计算下一态。
   */
  const runWithFeedback = useCallback(
    async (action: MailAction) => {
      if (pending || done) return;
      const actionDef = actions.find((x) => x.id === action);
      if (
        actionDef?.confirmText &&
        !(await confirmPopup(actionDef.confirmText))
      ) {
        return;
      }

      setStatus(null);
      const starredNext = action === "toggle-star" ? !starred : undefined;
      const r = await run(action, starredNext);
      if (r.ok) {
        const message = r.message ?? "操作成功";
        setStatus({
          kind: "ok",
          terminal: actionDef?.terminal === true,
          doneLabel: actionDef?.doneLabel,
        });
        notifyHaptic("success");
        await alertPopup(message);
      } else {
        const message = r.error ?? "操作失败";
        notifyHaptic("error");
        await alertPopup(message);
      }
    },
    [actions, done, pending, run, starred],
  );

  const handleMainButtonClick = useCallback(async () => {
    if (pending || done || actions.length === 0) return;
    if (actions.length === 1) {
      // 单动作：MainButton 直接执行，不走 popup
      runWithFeedback(actions[0].id);
      return;
    }
    if (!showPopup.isAvailable()) {
      // 兜底（极老的 TG 客户端没 showPopup）：直接跑第一个动作
      runWithFeedback(actions[0].id);
      return;
    }
    // title + message 都不能为空：TG 客户端对 message 校验严格，
    // 空串会让 popup 静默不弹
    const id = await showPopup({
      title: "邮件操作",
      message: "选择要执行的操作",
      buttons: actions.map<ShowPopupOptionsButton>((a) => ({
        id: a.id,
        type: a.type,
        text: a.label,
      })),
    });
    if (!id) return;
    const a = actions.find((x) => x.id === id);
    if (a) runWithFeedback(a.id);
  }, [actions, done, pending, runWithFeedback]);

  const mainButtonText =
    done && status?.kind === "ok"
      ? (status.doneLabel ?? "✓ 已处理")
      : done
        ? undefined
        : actions.length === 1
          ? actions[0].label
          : "⚡ 操作";

  useMainButton({
    text: mainButtonText,
    onClick: handleMainButtonClick,
    loading: pending,
    disabled: pending || done,
    // Main 用 emerald accent（和 web / miniapp UI 主色一致），
    // 和 Secondary 的中性灰拉开差距
    color: THEME_COLORS.accent,
    textColor: THEME_COLORS.accentOn,
  });

  // ─── 分享 / 跳 TG 原消息（SecondaryButton） ──────────────────────────────

  const doShare = useCallback(() => {
    if (!webMailUrl) return;
    const shareText = subject ? `📧 ${subject}` : "";
    const shareLink =
      `https://t.me/share/url?url=${encodeURIComponent(webMailUrl)}` +
      `&text=${encodeURIComponent(shareText)}`;
    openTgLink(shareLink);
  }, [webMailUrl, subject]);

  const doOpenTg = useCallback(() => {
    if (!tgMessageLink) return;
    openTgLink(tgMessageLink);
    // 某些 TG 客户端 openTelegramLink 跳转后不自动关 Mini App —— 兜底显式 close
    setTimeout(closeMiniAppSafe, 50);
  }, [tgMessageLink]);

  const extras = useMemo<ExtraDef[]>(() => {
    const list: ExtraDef[] = [];
    // 提醒在最前 —— 用户最常用；刷新/图片代理走 SettingsButton（右上角 ⋮），
    // 不挤 popup 三槽位。老 TG 客户端无 SettingsButton → 回落到 extras 末位。
    // label 尽量短（≤ 6 字符）—— TG Desktop popup 按总文本宽度决定排列，
    // 长 label 会让 3 项强制换成竖排 + 右对齐，跟 Main 的横排不一致。
    if (onSetReminder)
      list.push({ id: "reminder", label: "⏰ 设置提醒", run: onSetReminder });
    if (webMailUrl) list.push({ id: "share", label: "📤 分享", run: doShare });
    if (tgMessageLink)
      list.push({ id: "tg-link", label: "💬 原消息", run: doOpenTg });
    if (!hasSettingsButton && onRefresh) {
      list.push({
        id: "refresh",
        label: "🔄 刷新",
        run: refreshMail,
      });
    }
    if (!hasSettingsButton) {
      list.push({
        id: "toggle-proxy",
        label: useProxy ? "🖼 关图片代理" : "🖼 开图片代理",
        run: onToggleProxy,
      });
    }
    return list;
  }, [
    onSetReminder,
    webMailUrl,
    tgMessageLink,
    hasSettingsButton,
    onRefresh,
    refreshMail,
    useProxy,
    doShare,
    doOpenTg,
    onToggleProxy,
  ]);

  const handleSecondaryButtonClick = useCallback(async () => {
    if (extras.length === 0) return;
    if (extras.length === 1) {
      extras[0].run();
      return;
    }
    if (!showPopup.isAvailable()) {
      extras[0].run();
      return;
    }
    const id = await showPopup({
      title: "更多",
      message: "选择要执行的操作",
      buttons: extras.map<ShowPopupOptionsButton>((e) => ({
        id: e.id,
        type: "default",
        text: e.label,
      })),
    });
    if (!id) return;
    const e = extras.find((x) => x.id === id);
    if (e) e.run();
  }, [extras]);

  const secondaryButtonText =
    extras.length === 0
      ? undefined
      : extras.length === 1
        ? extras[0].label
        : "🔗 更多";

  useSecondaryButton({
    text: secondaryButtonText,
    onClick: handleSecondaryButtonClick,
    // position 'right' 表示 Secondary 放右边 → Main 自然在左边
    position: "right",
    // Secondary 用 zinc 中性填充，跟 Main 的 emerald 拉开差距
    color: THEME_COLORS.neutral,
    textColor: THEME_COLORS.neutralOn,
  });

  return null;
};
export interface MailFabProps {
  emailMessageId: string;
  accountId: number;
  token: string;
  starred: boolean;
  inJunk: boolean;
  inArchive: boolean;
  canArchive: boolean;
  /** 邮件当前所在 folder —— toggle-star 透传给后端，IMAP 用以选对 mailbox */
  folder?: "inbox" | "junk" | "archive";
  /** 邮件主题；用于分享时的预设文字 */
  subject?: string | null;
  /** 浏览器打开邮件的 URL；用作分享链接。缺失 → 不显示分享入口 */
  webMailUrl?: string | null;
  /** 跳到 TG 原消息的 deep link。缺失 → 不显示跳转入口 */
  tgMessageLink?: string | null;
  /** 当前 CORS 图片代理是否开启 —— 决定 SettingsButton/extras 里 toggle 文案 */
  useProxy: boolean;
  /** 重新拉取当前邮件预览；点 TG SettingsButton（或老版本退化的 extras 项）调用 */
  onRefresh?: () => Promise<void>;
  /** 切换 CORS 图片代理；点 TG SettingsButton（或老版本退化的 extras 项）调用 */
  onToggleProxy: () => void;
  /** 跳到提醒页（带 back URL）；undefined → 隐藏 ⏰ 入口 */
  onSetReminder?: () => void;
  /** FAB 动作成功后通知父组件 refetch 预览数据；交给 caller 处理 */
  onChanged?: () => void;
}

interface ActionDef {
  id: MailAction;
  label: string;
  type: "default" | "destructive";
  /** 执行后邮件就离开当前视图了（归档 / 垃圾 / 删除等），之后 MainButton 隐藏 */
  terminal: boolean;
  /** 破坏性动作执行前的确认提示 */
  confirmText?: string;
  /** terminal 动作完成后 MainButton 的短暂完成态文案 */
  doneLabel?: string;
}

type ExtraId = "reminder" | "share" | "tg-link" | "refresh" | "toggle-proxy";

interface ExtraDef {
  id: ExtraId;
  label: string;
  run: () => unknown;
}

interface ActionStatus {
  kind: "ok";
  terminal: boolean;
  doneLabel?: string;
}

const STATUS_DURATION_MS = 2400;
const TERMINAL_STATUS_DURATION_MS = 3600;

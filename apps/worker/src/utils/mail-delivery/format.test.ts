import type { Account } from "@worker/types";
import { measureTelegramRichHtml } from "@worker/utils/mail/telegram-rich-html";
import { describe, expect, it, vi } from "vitest";
import {
  buildTelegramEmailHtml,
  editMessageWithAnalysis,
  prepareEmailContent,
} from "./format";

const { analyzeEmailMock, editRichMessageMock } = vi.hoisted(() => ({
  analyzeEmailMock: vi.fn(),
  editRichMessageMock: vi.fn(),
}));

vi.mock("@worker/clients/llm", () => ({
  LLMClient: class {
    analyzeEmail = analyzeEmailMock;
  },
}));
vi.mock("@worker/clients/telegram", () => ({
  TelegramClient: class {
    editRichMessage = editRichMessageMock;
  },
}));

describe("format", () => {
  it("renders only an AI generating status before analysis", () => {
    const header = "<p><b>From:</b> sender@example.com</p>";

    expect(buildTelegramEmailHtml(header, null, true)).toBe(
      `${header}<p>🤖 AI 生成中，请点击下方按钮查看原文</p>`,
    );
  });

  it("keeps the verification code above the AI generating status", () => {
    const result = buildTelegramEmailHtml("<p>Header</p>", "482913", true);

    expect(result).toBe(
      "<p>Header</p><p><b>🔒 验证码:</b> <code>482913</code></p><p>&#160;</p><p>🤖 AI 生成中，请点击下方按钮查看原文</p>",
    );
  });

  it("omits the AI status when analysis will not run", () => {
    expect(buildTelegramEmailHtml("<p>Header</p>", "482913", false)).toBe(
      "<p>Header</p><p><b>🔒 验证码:</b> <code>482913</code></p>",
    );
  });

  it("bounds oversized header fields", () => {
    const content = prepareEmailContent(
      {
        subject: "x".repeat(40_000),
        from: { name: "Sender", address: "sender@example.com" },
        to: [{ address: "user@example.com" }],
        text: "Body",
      },
      { id: 1, chat_id: "42" } as Account,
    );
    const result = buildTelegramEmailHtml(content.header, null, true);

    expect(measureTelegramRichHtml(result).textCharacters).toBeLessThanOrEqual(
      32_768,
    );
    expect(content.header).toContain(
      "…</b></p><details><summary>Sender &lt;sender@example.com&gt;</summary>",
    );
  });

  it("renders a localized Telegram time and a detected verification code", () => {
    const content = prepareEmailContent(
      {
        subject: "Your verification code is 482913",
        from: { name: "Example", address: "security@example.com" },
        to: [{ address: "user@example.com" }],
        text: "Use verification code 482913 to sign in.",
      },
      {
        id: 1,
        email: "account@example.com",
        chat_id: "42",
      } as Account,
    );
    const result = buildTelegramEmailHtml(
      content.header,
      content.verificationCode,
      true,
    );

    expect(content.verificationCode).toBe("482913");
    expect(content.header).toMatch(
      /^<p><b>Your verification code is 482913<\/b><\/p><details><summary>Example &lt;security@example.com&gt;<\/summary><p><b>[\s\S]*<\/b><\/p><\/details>$/,
    );
    expect(content.header).not.toContain("<h6>");
    expect(content.header).not.toContain("<hr/>");
    expect(content.header).not.toContain("📤 发件人:");
    expect(content.header).toContain(
      "<p><b>📥 收件人: user@example.com<br>📧 账号: account@example.com<br>🕒 时间: ",
    );
    expect(result).toMatch(
      /🕒 时间: <tg-time unix="\d+" format="wDT">[^<]+<\/tg-time>/,
    );
    expect(result).toContain(
      "</details><p><b>🔒 验证码:</b> <code>482913</code></p><p>&#160;</p><p>🤖 AI 生成中，请点击下方按钮查看原文</p>",
    );
    expect(result).not.toContain("邮件正文");
    expect(result.match(/<details>/g)).toHaveLength(1);
  });

  it("does not add a blank paragraph between a code and an AI summary", async () => {
    analyzeEmailMock.mockResolvedValueOnce({
      summary: "• Use the verification code to sign in",
      shortSummary: "Verification code",
      tags: ["Security"],
      isJunk: false,
      junkConfidence: 0,
    });

    await editMessageWithAnalysis(
      {} as never,
      "42",
      7,
      "<h6>Header</h6><hr/>",
      "Verification code",
      "Use code 482913",
      { inline_keyboard: [] },
      "482913",
    );

    expect(editRichMessageMock).toHaveBeenCalledWith(
      "42",
      7,
      expect.stringContaining(
        "<code>482913</code></p><p><b>🤖 AI 摘要</b></p>",
      ),
      { inline_keyboard: [] },
    );
    expect(editRichMessageMock.mock.calls[0][2]).not.toContain(
      "<code>482913</code></p><p>&#160;</p><p><b>🤖 AI 摘要</b></p>",
    );
    expect(editRichMessageMock.mock.calls[0][2]).toContain(
      "<p>&#160;</p><footer>#Security</footer>",
    );
  });

  it("bounds untrusted LLM summary blocks and tag lengths", async () => {
    analyzeEmailMock.mockResolvedValueOnce({
      summary: Array.from(
        { length: 600 },
        (_, index) => `- Summary item ${index}`,
      ).join("\n"),
      shortSummary: "Summary",
      tags: ["x".repeat(1_000)],
      isJunk: false,
      junkConfidence: 0,
    });

    await editMessageWithAnalysis(
      {} as never,
      "42",
      8,
      "<h6>Header</h6><hr/>",
      "Subject",
      "Body",
      { inline_keyboard: [] },
      null,
    );

    const html = editRichMessageMock.mock.calls.at(-1)?.[2] as string;
    expect(measureTelegramRichHtml(html).blocks).toBeLessThanOrEqual(500);
    expect(measureTelegramRichHtml(html).textCharacters).toBeLessThanOrEqual(
      32_768,
    );
    expect(html).toContain("<p>&#160;</p><footer>#");
    expect(html).not.toContain("x".repeat(81));
  });
});

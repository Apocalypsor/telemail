import { describe, expect, it } from "vitest";
import {
  measureTelegramRichHtml,
  toTelegramRichHtml,
  truncateMarkdown,
  truncateMarkdownBlocks,
} from "./telegram-rich-html";

describe("telegram-rich-html", () => {
  it("truncates at a complete block without charging for a link target", () => {
    const target = `https://action.example/open?token=${"x".repeat(500)}`;
    const markdown = `Intro\n\n[Open order](${target})\n\nTrailing details`;

    expect(truncateMarkdown(markdown, 18)).toEqual({
      markdown: `Intro\n\n[Open order](${target})`,
      truncated: true,
    });
  });

  it("preserves complete lines when the first block exceeds the budget", () => {
    expect(truncateMarkdown("Row one\nRow two\nRow three", 15)).toEqual({
      markdown: "Row one\nRow two",
      truncated: true,
    });
  });

  it("renders standard Markdown as escaped Telegram Rich HTML", () => {
    expect(
      toTelegramRichHtml(
        "## Offer\n\n**Save 50%** & use `CODE`\n\n[Order](https://example.com?a=1&b=2)",
      ),
    ).toBe(
      "<h2>Offer</h2><p><b>Save 50%</b> &amp; use <code>CODE</code></p>" +
        '<p><a href="https://example.com?a=1&amp;b=2">Order</a></p>',
    );
  });

  it("preserves private-use characters used internally by the renderer", () => {
    expect(toTelegramRichHtml("a\uE0000\uE001b")).toBe(
      "<p>a\uE0000\uE001b</p>",
    );
  });

  it("preserves links with balanced parentheses", () => {
    expect(toTelegramRichHtml("[Wiki](https://example.com/a_(b))")).toBe(
      '<p><a href="https://example.com/a_(b)">Wiki</a></p>',
    );
  });

  it("does not split an emoji surrogate pair while truncating", () => {
    expect(truncateMarkdown("😀x", 1)).toEqual({
      markdown: "😀",
      truncated: true,
    });
  });

  it("truncates oversized lists by complete lines to fit the block budget", () => {
    const list = Array.from(
      { length: 600 },
      (_, index) => `- Item ${index}`,
    ).join("\n");
    const truncated = truncateMarkdownBlocks(list, 450);

    expect(truncated.truncated).toBe(true);
    expect(
      measureTelegramRichHtml(toTelegramRichHtml(truncated.markdown)).blocks,
    ).toBeLessThanOrEqual(450);
    expect(truncated.markdown).toContain("- Item 0");
  });

  it("removes Markdown horizontal rules from the email body", () => {
    expect(
      toTelegramRichHtml(
        "First section\n\n---\n\nSecond section\n\n***\n\n___",
      ),
    ).toBe("<p>First section</p><p>Second section</p>");
  });
});

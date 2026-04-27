// Sticky comment with deploy / preview URLs.
//
// Called from `.github/workflows/ci.yml` by both `preview-comment` (PR) and
// `deploy-comment` (main commit) jobs via `actions/github-script`. Switches
// API + body content based on env `MODE`:
//   MODE=preview → PR comment via `issues.{list,create,update}Comment`
//   MODE=deploy  → commit comment via `repos.{listCommentsForCommit,createCommitComment,updateCommitComment}`
//
// Sticky 行为：每 mode 一个 HTML 注释 marker，找到旧 comment 就 update，
// 没有就 create —— 同一个 PR / commit 反复触发不会刷屏。
//
// 输入（env）：
//   MODE   : "preview" | "deploy"
//   NEEDS  : JSON.stringify(needs)，由 workflow 用 ${{ toJSON(needs) }} 注入
//
// 用法（workflow 里）：
//   - uses: actions/checkout@v6        # 需要 checkout 才能 require 这个文件
//   - uses: actions/github-script@v8
//     env:
//       MODE: preview
//       NEEDS: ${{ toJSON(needs) }}
//     with:
//       script: |
//         const fn = require(`${process.env.GITHUB_WORKSPACE}/.github/scripts/post-comment.cjs`);
//         await fn({ github, context });

module.exports = async ({ github, context }) => {
  const mode = process.env.MODE;
  const needs = JSON.parse(process.env.NEEDS);

  if (mode === "preview") return postPreview({ github, context, needs });
  if (mode === "deploy") return postDeploy({ github, context, needs });
  throw new Error(`Unknown MODE: ${mode}`);
};

const fmt = (job, url) => {
  if (!job || job.result === "skipped") return "_(unchanged)_";
  if (job.result === "failure") return "❌ failed";
  if (job.result === "cancelled") return "⏹ cancelled";
  if (!url) return job.result === "success" ? "✅ done" : `⚠️ ${job.result}`;
  return url;
};

async function postPreview({ github, context, needs }) {
  const MARKER = "<!-- preview-deploys -->";
  const sha = context.payload.pull_request.head.sha.slice(0, 7);

  const dockerStatus = (() => {
    const j = needs["docker-middleware"];
    if (!j || j.result === "skipped") return "_(unchanged)_";
    if (j.result === "failure") return "❌ build failed";
    if (j.result === "success") return "✅ build OK (no push on PR)";
    return j.result;
  })();

  const body = [
    MARKER,
    "## 🚀 Preview deploys",
    "",
    "| Resource | URL / Status |",
    "| --- | --- |",
    `| 🔧 Worker version | ${fmt(needs["preview-worker"], needs["preview-worker"]?.outputs?.url)} |`,
    `| 📄 Pages preview  | ${fmt(needs["preview-page"], needs["preview-page"]?.outputs?.url)} |`,
    `| 📄 Pages alias    | ${fmt(needs["preview-page"], needs["preview-page"]?.outputs?.alias_url)} |`,
    `| 🐳 Middleware     | ${dockerStatus} |`,
    "",
    `_Last updated: \`${sha}\` · [Workflow run](${context.payload.repository.html_url}/actions/runs/${context.runId})_`,
  ].join("\n");

  const issueArgs = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  };
  const { data: comments } = await github.rest.issues.listComments({
    ...issueArgs,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.startsWith(MARKER));
  if (existing) {
    await github.rest.issues.updateComment({
      ...issueArgs,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({ ...issueArgs, body });
  }
}

async function postDeploy({ github, context, needs }) {
  const MARKER = "<!-- deploy-results -->";

  const dockerStatus = (() => {
    const j = needs["docker-middleware"];
    if (!j || j.result === "skipped") return "_(unchanged)_";
    if (j.result === "failure") return "❌ build/push failed";
    if (j.result !== "success") return j.result;
    const owner = context.repo.owner.toLowerCase();
    const sha = context.sha.slice(0, 7);
    return `\`ghcr.io/${owner}/telemail-middleware:latest\` + \`:sha-${sha}\``;
  })();

  const body = [
    MARKER,
    "## ✅ Deployed to production",
    "",
    "| Resource | URL / Image |",
    "| --- | --- |",
    `| 🔧 Worker | ${fmt(needs["deploy-worker"], needs["deploy-worker"]?.outputs?.url)} |`,
    `| 📄 Pages  | ${fmt(needs["deploy-page"], needs["deploy-page"]?.outputs?.url)} |`,
    `| 📄 Pages alias | ${fmt(needs["deploy-page"], needs["deploy-page"]?.outputs?.alias_url)} |`,
    `| 🐳 Middleware | ${dockerStatus} |`,
    "",
    `_[Workflow run](${context.payload.repository.html_url}/actions/runs/${context.runId})_`,
  ].join("\n");

  const repoArgs = { owner: context.repo.owner, repo: context.repo.repo };
  const { data: comments } = await github.rest.repos.listCommentsForCommit({
    ...repoArgs,
    commit_sha: context.sha,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.startsWith(MARKER));
  if (existing) {
    await github.rest.repos.updateCommitComment({
      ...repoArgs,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.repos.createCommitComment({
      ...repoArgs,
      commit_sha: context.sha,
      body,
    });
  }
}

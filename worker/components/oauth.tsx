import { Card, Layout } from "@components/layout";

export function OAuthSetupPage({
  startUrl,
  callbackUrl,
  accountEmail,
}: {
  startUrl: string;
  callbackUrl: string;
  accountEmail: string;
}) {
  return (
    <Layout title="OAuth 授权">
      <Card>
        <h1>OAuth 授权</h1>
        <p>
          为账号 <code>{accountEmail}</code> 授权邮箱访问权限。回调成功后{" "}
          <code>refresh_token</code> 会自动保存到 D1 数据库。
        </p>
        <ol class="steps">
          <li>
            在 OAuth 应用的 <strong>Redirect URIs</strong> 添加：
            <code>{callbackUrl}</code>
          </li>
          <li>点击下方按钮完成授权。</li>
          <li>
            <strong>请确认登录的是 {accountEmail}</strong>
            ，回调成功后 refresh_token 会自动保存。
          </li>
        </ol>
        <a class="btn" href={startUrl}>
          开始授权
        </a>
      </Card>
    </Layout>
  );
}

const copyScript = `
var btn = document.getElementById('copy');
var input = document.getElementById('token');
if (btn && input) {
  btn.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制 Token'; }, 1200);
    } catch {
      btn.textContent = '复制失败';
    }
  });
}`;

export function OAuthCallbackPage({
  refreshToken,
  scope,
  expiresIn,
  accountEmail,
}: {
  refreshToken: string | undefined;
  scope: string;
  expiresIn: number | undefined;
  accountEmail: string;
}) {
  const title = refreshToken ? "OAuth 授权成功" : "本次未返回 Refresh Token";
  const statusText = refreshToken
    ? `已为 ${accountEmail} 保存 refresh_token 到数据库，后续会自动使用。Watch 已自动续订。`
    : "Google 返回成功，但没有 refresh_token。通常是同一账号已授权过且未强制重新授权。";

  return (
    <Layout title={title}>
      <Card>
        <h1 class={refreshToken ? "title-ok" : "title-warn"}>{title}</h1>
        <p>{statusText}</p>
        {refreshToken ? (
          <div>
            <textarea id="token" readonly class="token-input">
              {refreshToken}
            </textarea>
            <button type="button" id="copy" class="btn">
              复制 Token
            </button>
          </div>
        ) : (
          <p class="text-warn">
            请重新执行授权流程，并确认登录的是 {accountEmail}。
          </p>
        )}
        <p>
          返回 scope: <code>{scope}</code>
          {typeof expiresIn === "number" &&
            `，access_token 有效期约 ${expiresIn} 秒`}
          。
        </p>
      </Card>
      <script dangerouslySetInnerHTML={{ __html: copyScript }} />
    </Layout>
  );
}

export function OAuthErrorPage({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <Layout title={title}>
      <Card>
        <h1 class="title-err">{title}</h1>
        <pre class="error">{detail}</pre>
      </Card>
    </Layout>
  );
}

import { Button, Card, Skeleton, Spinner } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { z } from "zod";
import { api, extractErrorMessage } from "@/api/client";
import { ROUTE_MINI_APP_API_MAIL } from "@/api/routes";
import { mailPreviewResponseSchema, okResponseSchema } from "@/api/schemas";
import { MailBodyFrame } from "@/components/mail-body-frame";

const searchSchema = z.object({
  accountId: z.coerce.number(),
  t: z.string(),
  folder: z.string().optional(),
});

export const Route = createFileRoute("/mail/$id")({
  component: WebMailPage,
  validateSearch: zodValidator(searchSchema),
});

type Action =
  | "toggle-star"
  | "archive"
  | "unarchive"
  | "trash"
  | "mark-as-junk"
  | "move-to-inbox";

function WebMailPage() {
  const { id: emailMessageId } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const queryKey = [
    "web-mail-preview",
    emailMessageId,
    search.accountId,
    search.folder,
  ];

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const url = ROUTE_MINI_APP_API_MAIL.replace(
        ":id",
        encodeURIComponent(emailMessageId),
      ).replace(/^\//, "");
      const searchParams: Record<string, string> = {
        accountId: String(search.accountId),
        t: search.t,
      };
      if (search.folder) searchParams.folder = search.folder;
      const data = await api.get(url, { searchParams }).json();
      return mailPreviewResponseSchema.parse(data);
    },
    retry: false,
  });

  if (q.isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="m-4 p-4 space-y-2">
          <Skeleton className="h-6 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/3 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </Card>
        <div className="px-4 py-4 space-y-3">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <Skeleton className="h-4 w-10/12 rounded-md" />
          <Skeleton className="h-4 w-9/12 rounded-md" />
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Card className="max-w-md mx-auto mt-10 p-6 text-center">
        <div className="text-[color:var(--danger)]">邮件加载失败</div>
      </Card>
    );
  }

  const d = q.data;
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-[color:var(--surface)] text-[color:var(--surface-foreground)] border-b border-[color:var(--surface-secondary)] px-4 py-3 text-[13px] leading-7">
        {d.meta.subject && (
          <div className="text-[22px] font-semibold break-words text-[color:var(--accent)] mb-1.5">
            {d.meta.subject}
          </div>
        )}
        {d.meta.from && (
          <div>
            <span className="text-[color:var(--muted)]">From:</span>{" "}
            {d.meta.from}
          </div>
        )}
        {d.meta.to && (
          <div>
            <span className="text-[color:var(--muted)]">To:</span> {d.meta.to}
          </div>
        )}
        {d.accountEmail && (
          <div>
            <span className="text-[color:var(--muted)]">Account:</span>{" "}
            {d.accountEmail}
          </div>
        )}
        {d.meta.date && (
          <div>
            <span className="text-[color:var(--muted)]">Date:</span>{" "}
            {d.meta.date}
          </div>
        )}
      </div>

      <WebMailToolbar
        emailMessageId={emailMessageId}
        accountId={search.accountId}
        token={search.t}
        starred={d.starred}
        inJunk={d.inJunk}
        inArchive={d.inArchive}
        canArchive={d.canArchive}
        onChanged={() => qc.invalidateQueries({ queryKey })}
      />

      <div className="px-4 py-4">
        <MailBodyFrame bodyHtml={d.bodyHtml} />
      </div>
    </div>
  );
}

interface ToolbarProps {
  emailMessageId: string;
  accountId: number;
  token: string;
  starred: boolean;
  inJunk: boolean;
  inArchive: boolean;
  canArchive: boolean;
  onChanged: () => void;
}

function WebMailToolbar(props: ToolbarProps) {
  const [starred, setStarred] = useState(props.starred);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(
    null,
  );

  const mut = useMutation({
    mutationFn: async ({
      action,
      starredNext,
    }: {
      action: Action;
      starredNext?: boolean;
    }) => {
      const body: Record<string, unknown> = {
        accountId: props.accountId,
        token: props.token,
      };
      if (starredNext !== undefined) body.starred = starredNext;
      const raw = await api
        .post(
          `api/mail/${encodeURIComponent(props.emailMessageId)}/${action}`,
          { json: body },
        )
        .json();
      return { action, starredNext, res: okResponseSchema.parse(raw) };
    },
    onSuccess: ({ action, starredNext, res }) => {
      if (!res.ok) {
        setMsg({ text: res.error ?? "操作失败", kind: "error" });
        return;
      }
      setMsg({ text: res.message ?? "", kind: "ok" });
      if (action === "toggle-star" && starredNext !== undefined) {
        setStarred(starredNext);
      } else {
        setDone(true);
      }
      props.onChanged();
    },
    onError: async (err) => {
      setMsg({ text: await extractErrorMessage(err), kind: "error" });
    },
  });

  function run(action: Action, starredNext?: boolean) {
    setMsg(null);
    mut.mutate({ action, starredNext });
  }

  const disabled = done || mut.isPending;

  return (
    <div className="sticky top-0 z-10 bg-[color:var(--surface)] border-b border-[color:var(--surface-secondary)] px-4 py-2 flex flex-wrap gap-2 items-center">
      {!props.inArchive && (
        <Button
          size="sm"
          variant={starred ? "primary" : "outline"}
          isDisabled={disabled}
          onClick={() => run("toggle-star", !starred)}
        >
          {starred ? "✅ 已星标" : "⭐ 星标"}
        </Button>
      )}
      {props.inJunk ? (
        <>
          <Button
            size="sm"
            variant="primary"
            isDisabled={disabled}
            onClick={() => run("move-to-inbox")}
          >
            📥 移到收件箱
          </Button>
          <Button
            size="sm"
            variant="danger"
            isDisabled={disabled}
            onClick={() => run("trash")}
          >
            🗑 删除
          </Button>
        </>
      ) : props.inArchive ? (
        <Button
          size="sm"
          variant="primary"
          isDisabled={disabled}
          onClick={() => run("unarchive")}
        >
          📥 移出归档
        </Button>
      ) : (
        <>
          {props.canArchive && (
            <Button
              size="sm"
              variant="outline"
              isDisabled={disabled}
              onClick={() => run("archive")}
            >
              📥 归档
            </Button>
          )}
          <Button
            size="sm"
            variant="danger-soft"
            isDisabled={disabled}
            onClick={() => run("mark-as-junk")}
          >
            🚫 标记为垃圾
          </Button>
        </>
      )}
      {mut.isPending && <Spinner size="sm" />}
      {msg && (
        <span
          className={`text-sm ${
            msg.kind === "error"
              ? "text-[color:var(--danger)]"
              : "text-[color:var(--success)]"
          }`}
        >
          {msg.kind === "ok" ? "✅" : "❌"} {msg.text}
        </span>
      )}
    </div>
  );
}

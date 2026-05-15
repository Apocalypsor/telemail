import { validateSearch } from "@page/api/utils";
import { Type as t } from "@sinclair/typebox";
import { createFileRoute } from "@tanstack/react-router";
import { ComposePage } from "./-components/compose-page";

const Search = t.Object({
  accountId: t.Optional(t.Number()),
  to: t.Optional(t.String()),
  subject: t.Optional(t.String()),
  replyEmailMessageId: t.Optional(t.String()),
  token: t.Optional(t.String()),
  folder: t.Optional(
    t.Union([t.Literal("inbox"), t.Literal("junk"), t.Literal("archive")]),
  ),
  back: t.Optional(t.String()),
});
const validateComposeSearch = validateSearch(Search);

const ComposeRoute = () => {
  const search = Route.useSearch();
  const key = [
    search.accountId ?? "",
    search.replyEmailMessageId ?? "",
    search.to ?? "",
    search.subject ?? "",
    search.token ?? "",
    search.folder ?? "",
    search.back ?? "",
  ].join(":");
  return <ComposePage key={key} search={search} />;
};

export const Route = createFileRoute("/telegram-app/compose/")({
  component: ComposeRoute,
  validateSearch: validateComposeSearch,
});

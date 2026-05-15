import { validateSearch } from "@page/api/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ComposePage } from "./-components/compose-page";
import { ComposeSearchSchema } from "./-types";

const validateComposeSearch = validateSearch(ComposeSearchSchema);

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

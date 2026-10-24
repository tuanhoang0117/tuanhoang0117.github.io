import { Link } from "react-router";
import { PageHeader } from "../components/ui/PageHeader";
import { pagePrompts } from "../content/site";

export function NotFound() {
  return (
    <PageHeader title="404" prompt={pagePrompts.notFound}>
      <Link
        to="/"
        className="label-mono mt-6 inline-block underline decoration-2 underline-offset-4"
      >
        ← Back home
      </Link>
    </PageHeader>
  );
}

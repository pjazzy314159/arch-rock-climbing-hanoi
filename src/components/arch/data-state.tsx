import { CloudOff, Info, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Resource } from "@/services/arch";

/**
 * Banner shown when a page is rendering sample data because the ARCH backend
 * could not be reached.
 *
 * The sample data is never presented as live information, so the banner states
 * plainly what is happening and what to do about it.
 */
export function SampleDataBanner({ resource }: { resource: { source: string; error?: string } }) {
  if (resource.source === "api") return null;
  return (
    <p className="data-banner" role="status">
      <CloudOff size={16} />
      <span>
        <strong>Showing sample data.</strong>{" "}
        {resource.error ?? "The ARCH service is not reachable right now."} Nothing on this page
        should be treated as confirmed ARCH information.
      </span>
    </p>
  );
}

/**
 * Notice shown when the backend answered but the collection has no entries
 * yet — for example, the price list before ARCH publishes it.
 */
export function EmptyNotice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Info size={26} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

/** Small label that marks content as sample data inside a page. */
export function SampleBadge({ children }: { children: ReactNode }) {
  return <span className="sample-badge">{children}</span>;
}

/** Placeholder shown while a route's data is still loading. */
export function RouteLoading() {
  return (
    <main className="page-main" aria-busy="true">
      <div className="loading-block">
        <Loader2 className="loading-spinner" size={22} />
        <p>Loading…</p>
      </div>
    </main>
  );
}

/** Helper for the "live vs sample" label used in page headings. */
export function sourceLabel(resource: Resource<unknown>): string {
  return resource.source === "api" ? "Live from ARCH" : "Sample data";
}

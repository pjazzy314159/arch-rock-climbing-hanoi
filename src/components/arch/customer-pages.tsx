import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Shield, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminApi, ApiError, ApiUnavailableError } from "@/services/api";
import { useSession } from "@/services/session";
import type { ApiAdminCustomer, ApiAdminCustomerDetail } from "@/services/types";
import { EmptyNotice } from "./data-state";
import { MemberShell } from "./member-shell";
import { PageHeading, TextLink } from "./shared";

const PAGE_SIZE = 20;

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiUnavailableError) {
    return "The ARCH service is not reachable right now. Please try again in a moment.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 401) return "Your session has expired. Please sign in again.";
    if (caught.status === 403) return "You do not have permission to view customer records.";
    if (caught.status === 404) return "That customer record does not exist.";
    return caught.message;
  }
  return fallback;
}

function dateLabel(value: string | null): string {
  return value ? value.slice(0, 10) : "Not recorded";
}

function dateTimeLabel(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isDemoCustomer(customer: { email: string }): boolean {
  return customer.email.toLowerCase().endsWith("@example.com");
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function AdminOnlyNotice() {
  return (
    <div className="empty-state">
      <Shield size={26} />
      <h3>You need an administrator account to see this</h3>
      <p>The ARCH backend checks the role of your account on every request.</p>
      <TextLink to="/admin">Back to operations</TextLink>
    </div>
  );
}

function AgreementBadge({ status }: { status: string | null }) {
  if (!status) return <span className="muted-note">Not recorded</span>;
  return (
    <span className={status === "signed" ? "status-sent" : "status-project"}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export type CustomerDirectoryProps = {
  items: ApiAdminCustomer[];
  total: number;
  loading: boolean;
  error: string | null;
  search: string;
  role: string;
  offset: number;
  limit: number;
  onSearch: (value: string) => void;
  onRole: (value: string) => void;
  onPage: (offset: number) => void;
  onRetry: () => void;
};

/** The customer table and its search/paging controls, without data fetching. */
export function CustomerDirectory({
  items,
  total,
  loading,
  error,
  search,
  role,
  offset,
  limit,
  onSearch,
  onRole,
  onPage,
  onRetry,
}: CustomerDirectoryProps) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search customers"
            placeholder="Search name, email or phone…"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <label className="admin-filter-select">
          <span>Role</span>
          <select
            aria-label="Filter by role"
            value={role}
            onChange={(event) => onRole(event.target.value)}
          >
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="staff">Staff</option>
            <option value="admin">Administrators</option>
          </select>
        </label>
      </div>

      <div className="result-count">
        <strong>
          {total} customer{total === 1 ? "" : "s"}
        </strong>
        <span>Search and paging run on the ARCH backend.</span>
      </div>

      {loading ? (
        <div className="loading-block" aria-busy="true">
          <p>Loading customers…</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <Users size={26} />
          <h3>Customers could not be loaded</h3>
          <p>{error}</p>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyNotice
          title="No customers match this search"
          description="Try a different name, email, phone number or role."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Role</th>
                <th>Account</th>
                <th>Membership</th>
                <th>Agreement</th>
                <th>Sends</th>
                <th>Last climb</th>
              </tr>
            </thead>
            <tbody>
              {items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>
                      <Link
                        to="/admin/customers/$customerId"
                        params={{ customerId: String(customer.id) }}
                      >
                        {customer.full_name}
                      </Link>
                    </strong>
                    <small>{customer.email}</small>
                    {isDemoCustomer(customer) && (
                      <span className="sample-badge" aria-label="Demo account">
                        Demo
                      </span>
                    )}
                  </td>
                  <td>{roleLabel(customer.role)}</td>
                  <td>
                    <span className={customer.is_active ? "status-sent" : "status-project"}>
                      {customer.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {customer.membership_tier ?? "Not recorded"}
                    {customer.membership_status && <small>{customer.membership_status}</small>}
                  </td>
                  <td>
                    <AgreementBadge status={customer.agreement_status} />
                  </td>
                  <td>{customer.total_sends}</td>
                  <td>{dateLabel(customer.last_climb_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination">
        <Button
          variant="outline"
          onClick={() => onPage(Math.max(0, offset - limit))}
          disabled={offset === 0 || loading}
        >
          <ChevronLeft /> Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          onClick={() => onPage(offset + limit)}
          disabled={offset + limit >= total || loading}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </>
  );
}

/** Server-backed customer directory in the operations workspace. */
export function CustomersDirectoryPanel() {
  const { status, user } = useSession();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [offset, setOffset] = useState(0);
  const isAdmin = status === "authenticated" && user?.role === "admin";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const customers = useQuery({
    queryKey: ["admin", "customers", debouncedSearch, role, offset],
    queryFn: () =>
      adminApi.customers({
        search: debouncedSearch || undefined,
        role: role || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: isAdmin,
    retry: false,
  });

  if (status === "loading") {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Checking your session…</p>
      </div>
    );
  }
  if (!isAdmin) return <AdminOnlyNotice />;

  return (
    <CustomerDirectory
      items={customers.data?.items ?? []}
      total={customers.data?.total ?? 0}
      loading={customers.isPending}
      error={
        customers.isError
          ? errorMessage(customers.error, "The customer directory could not be loaded.")
          : null
      }
      search={search}
      role={role}
      offset={offset}
      limit={PAGE_SIZE}
      onSearch={setSearch}
      onRole={(value) => {
        setRole(value);
        setOffset(0);
      }}
      onPage={setOffset}
      onRetry={() => void customers.refetch()}
    />
  );
}

export type CustomerDetailViewProps = {
  customer: ApiAdminCustomerDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

/** The read-only customer detail content, without data fetching. */
export function CustomerDetailView({ customer, loading, error, onRetry }: CustomerDetailViewProps) {
  if (loading) {
    return (
      <div className="loading-block" aria-busy="true">
        <p>Loading the customer record…</p>
      </div>
    );
  }
  if (error || !customer) {
    return (
      <div className="empty-state">
        <Users size={26} />
        <h3>Customer record unavailable</h3>
        <p>{error ?? "That customer record could not be found."}</p>
        <div className="dashboard-empty-actions">
          <Button onClick={onRetry}>Try again</Button>
          <Button asChild variant="outline">
            <Link to="/admin">Back to customers</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="customer-detail-heading">
        <div>
          <h2>{customer.full_name}</h2>
          <p>{customer.email}</p>
        </div>
        <div className="customer-detail-badges">
          <span className={customer.is_active ? "status-sent" : "status-project"}>
            {customer.is_active ? "Active account" : "Inactive account"}
          </span>
          <span className="route-type-tag">{roleLabel(customer.role)}</span>
          {isDemoCustomer(customer) && (
            <span className="sample-badge" aria-label="Demo account">
              Demo account
            </span>
          )}
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="rules-panel">
          <h2>Account</h2>
          <dl className="customer-detail-list">
            <dt>Email</dt>
            <dd>{customer.email}</dd>
            <dt>Phone</dt>
            <dd>{customer.phone ?? "Not recorded"}</dd>
            <dt>Membership</dt>
            <dd>
              {customer.membership_tier ?? "Not recorded"}
              {customer.membership_status ? ` · ${customer.membership_status}` : ""}
            </dd>
            <dt>Joined</dt>
            <dd>{dateLabel(customer.joined_on)}</dd>
            <dt>Account created</dt>
            <dd>{dateTimeLabel(customer.created_at)}</dd>
            <dt>Climbing level</dt>
            <dd>{customer.climbing_level > 0 ? `V${customer.climbing_level}` : "Not recorded"}</dd>
          </dl>
        </section>

        <section className="rules-panel">
          <h2>Safety agreement</h2>
          {customer.agreement ? (
            <dl className="customer-detail-list">
              <dt>Status</dt>
              <dd>
                <AgreementBadge status={customer.agreement.status} />
              </dd>
              <dt>Version</dt>
              <dd>{customer.agreement.version}</dd>
              <dt>Method</dt>
              <dd>{customer.agreement.method ?? "Not recorded"}</dd>
              <dt>Signed</dt>
              <dd>{dateTimeLabel(customer.agreement.signed_at)}</dd>
              <dt>Signed name</dt>
              <dd>{customer.agreement.signed_name ?? "Not recorded"}</dd>
              {customer.agreement.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{customer.agreement.notes}</dd>
                </>
              )}
            </dl>
          ) : (
            <p>No safety agreement record is stored for this account.</p>
          )}
          <p className="muted-note">
            The signing workflow and legal wording still need confirmation from ARCH.
          </p>
        </section>
      </div>

      <section className="rules-panel">
        <h2>Climbing activity</h2>
        <div className="metric-grid">
          <div className="metric">
            <span>Sends</span>
            <strong>{customer.activity.sends}</strong>
            <small>Logged sends</small>
          </div>
          <div className="metric">
            <span>Flashes</span>
            <strong>{customer.activity.flashes}</strong>
            <small>Included in sends</small>
          </div>
          <div className="metric">
            <span>Projects</span>
            <strong>{customer.activity.projects}</strong>
            <small>Still in progress</small>
          </div>
          <div className="metric">
            <span>Attempts</span>
            <strong>{customer.activity.attempts}</strong>
            <small>Across all climbs</small>
          </div>
        </div>
        <p className="muted-note">
          {customer.activity.total_climbs === 0
            ? "No climbs are recorded for this account."
            : `Last climb: ${dateLabel(customer.last_climb_on)}. Flashes are a subset of sends.`}
        </p>
      </section>

      <section className="rules-panel">
        <h2>Recent climbs</h2>
        {customer.recent_attempts.length === 0 ? (
          <p>No climbs recorded. This is different from a failed request or a hidden record.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Grade</th>
                  <th>Result</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {customer.recent_attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{dateLabel(attempt.climbed_on)}</td>
                    <td>
                      {attempt.route_id ? (
                        <Link to="/routes/$routeId" params={{ routeId: String(attempt.route_id) }}>
                          {attempt.route_name}
                        </Link>
                      ) : (
                        attempt.route_name
                      )}
                    </td>
                    <td>{attempt.grade}</td>
                    <td>
                      <span
                        className={attempt.result === "sent" ? "status-sent" : "status-project"}
                      >
                        {attempt.result}
                      </span>
                    </td>
                    <td>{attempt.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-note">Showing the 10 most recent climbs.</p>
      </section>

      <section className="rules-panel">
        <h2>Contact history</h2>
        <p className="muted-note">{customer.contact_history_note}</p>
        {customer.recent_contact_messages.length === 0 ? (
          <p>No contact messages use this email address.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Subject</th>
                  <th>Handled</th>
                </tr>
              </thead>
              <tbody>
                {customer.recent_contact_messages.map((message) => (
                  <tr key={message.id}>
                    <td>{dateTimeLabel(message.created_at)}</td>
                    <td>{message.subject}</td>
                    <td>
                      <span className={message.handled ? "status-sent" : "status-project"}>
                        {message.handled ? "Handled" : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-note">Showing at most five recent messages.</p>
      </section>

      <p className="muted-note">
        This record is read-only. Profile edits, account deactivation and membership changes require
        a confirmed ARCH policy before they are enabled.{" "}
        <TextLink to="/admin">Back to the customer directory</TextLink>
      </p>
    </>
  );
}

/** The standalone detail route, including the operations shell. */
export function CustomerDetailPage({ customerId }: { customerId: number }) {
  const { status, user } = useSession();
  const isAdmin = status === "authenticated" && user?.role === "admin";
  const validId = Number.isFinite(customerId) && customerId > 0;
  const customer = useQuery({
    queryKey: ["admin", "customer", customerId],
    queryFn: () => adminApi.customer(customerId),
    enabled: isAdmin && validId,
    retry: false,
  });
  const hydrated = useHydrated();

  return (
    <MemberShell admin>
      <PageHeading
        eyebrow="ARCH OPERATIONS"
        title="Customer record."
        description="Account, safety agreement and climbing activity, read from the ARCH database."
      />
      <p className="muted-note">
        <Link to="/admin">
          <ArrowLeft size={14} /> Back to all customers
        </Link>
      </p>
      {status === "loading" ? (
        <div className="loading-block" aria-busy="true">
          <p>Checking your session…</p>
        </div>
      ) : !isAdmin ? (
        <AdminOnlyNotice />
      ) : !validId ? (
        <CustomerDetailView
          customer={null}
          loading={false}
          error="That customer address is not valid."
          onRetry={() => undefined}
        />
      ) : (
        <CustomerDetailView
          customer={customer.data ?? null}
          loading={customer.isPending}
          error={
            customer.isError
              ? errorMessage(customer.error, "The customer record could not be loaded.")
              : null
          }
          onRetry={() => void customer.refetch()}
        />
      )}
      {hydrated && null}
    </MemberShell>
  );
}

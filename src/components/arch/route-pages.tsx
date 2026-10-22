import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Mountain,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Minus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { api, memberApi, ApiError, ApiUnavailableError } from "@/services/api";
import { useSession } from "@/services/session";
import { EmptyNotice, SampleDataBanner } from "./data-state";
import { PageHeading, RouteCard, TextLink } from "./shared";
import { leaderboardQuery, routeQuery, toClimbRoute, type Resource } from "@/services/arch";
import type { ApiVoteTally, ApiRouteSummary } from "@/services/types";

const VOTE_OPTIONS = [
  { value: "easier", label: "Easier", icon: ThumbsDown },
  { value: "as_set", label: "As set", icon: Minus },
  { value: "harder", label: "Harder", icon: ThumbsUp },
] as const;

/**
 * A single route, with the community's difficulty feedback.
 *
 * The official grade and the community's perceived grade are kept apart: the
 * gym sets the grade, the community only reports how the route felt.
 */
export function RouteDetailPage({ routeId }: { routeId: string }) {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const signedIn = status === "authenticated";
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const route = useQuery({
    queryKey: ["arch", "route", routeId],
    queryFn: async () => {
      const found = await api.route(routeId);
      return { data: found, source: "api" as const };
    },
    retry: false,
  });

  const tally = useQuery({
    queryKey: ["arch", "route-tally", routeId],
    queryFn: async () => {
      const found = await api.routeTally(routeId);
      return { data: found, source: "api" as const };
    },
    retry: false,
  });

  const myVote = useQuery({
    queryKey: ["member", "vote", routeId],
    queryFn: () => memberApi.myVote(routeId),
    enabled: signedIn,
    retry: false,
  });

  if (route.isPending) {
    return (
      <main className="page-main">
        <div className="loading-block">
          <p>Loading the route…</p>
        </div>
      </main>
    );
  }

  if (route.isError || !route.data?.data) {
    return (
      <main className="page-main">
        <EmptyNotice
          title="That route is not available."
          description="It may have been archived by the setters. Have a look at the rest of the collection."
        >
          <Button asChild>
            <Link to="/routes">
              Back to the routes <ArrowUpRight />
            </Link>
          </Button>
        </EmptyNotice>
      </main>
    );
  }

  const found = route.data.data as ApiRouteSummary;
  const card = toClimbRoute(found);
  const tallies = tally.data?.data as ApiVoteTally | undefined;
  const myVoteValue = myVote.data?.value ?? null;

  async function vote(value: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await memberApi.castVote(routeId, { value });
      await queryClient.invalidateQueries({ queryKey: ["member", "vote", routeId] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "route-tally", routeId] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "route", routeId] });
      setMessage("Thanks — your vote has been recorded.");
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof ApiUnavailableError
          ? caught.message
          : "Your vote could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await memberApi.withdrawVote(routeId);
      await queryClient.invalidateQueries({ queryKey: ["member", "vote", routeId] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "route-tally", routeId] });
      await queryClient.invalidateQueries({ queryKey: ["arch", "route", routeId] });
      setMessage("Your vote has been withdrawn.");
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof ApiUnavailableError
          ? caught.message
          : "Your vote could not be withdrawn.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-main">
      <div className="breadcrumb">
        <Link to="/routes">Routes</Link>
        <ChevronRight size={14} />
        {found.name}
      </div>
      <PageHeading eyebrow={card.wall.toUpperCase()} title={found.name} description={found.style}>
        <span className="sample-badge">
          {route.data.source === "api" ? "LIVE ROUTE" : "SAMPLE ROUTE"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={route.data as Resource<unknown>} />

      <div className="route-detail">
        <RouteCard route={card} />
        <div className="route-detail-body">
          <div className="grade-block">
            <div>
              <span>Official grade</span>
              <strong>{found.grade}</strong>
              <small>Set by {found.setter}</small>
            </div>
            <div>
              <span>Community says</span>
              <strong>{tallies?.perceived_grade ?? "Not enough votes"}</strong>
              <small>
                {tallies
                  ? `${tallies.total} vote${tallies.total === 1 ? "" : "s"} from climbers`
                  : "Three votes are needed before a perceived grade appears"}
              </small>
            </div>
          </div>

          {tallies && tallies.total > 0 && (
            <div className="vote-bars">
              <div>
                <span>Easier</span>
                <div className="vote-bar">
                  <div style={{ width: `${(tallies.easier / tallies.total) * 100}%` }} />
                </div>
                <strong>{tallies.easier}</strong>
              </div>
              <div>
                <span>As set</span>
                <div className="vote-bar">
                  <div style={{ width: `${(tallies.as_set / tallies.total) * 100}%` }} />
                </div>
                <strong>{tallies.as_set}</strong>
              </div>
              <div>
                <span>Harder</span>
                <div className="vote-bar">
                  <div style={{ width: `${(tallies.harder / tallies.total) * 100}%` }} />
                </div>
                <strong>{tallies.harder}</strong>
              </div>
            </div>
          )}

          <section className="vote-panel">
            <h2>How did it feel?</h2>
            <p>
              Tell us whether the route felt easier, exactly as set, or harder than its grade. The
              gym's grade is never changed by these votes.
            </p>
            {!signedIn ? (
              <>
                <EmptyNotice
                  title="Sign in to vote."
                  description="Voting keeps the community feedback honest, and it needs an account so one person cannot vote twice."
                >
                  <Button asChild>
                    <Link to="/signin">
                      Sign in to vote <ArrowUpRight />
                    </Link>
                  </Button>
                </EmptyNotice>
              </>
            ) : (
              <div className="vote-options">
                {VOTE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={myVoteValue === option.value ? "default" : "outline"}
                    disabled={!hydrated || pending}
                    aria-pressed={myVoteValue === option.value}
                    onClick={() => vote(option.value)}
                  >
                    <option.icon />
                    {option.label}
                  </Button>
                ))}
                {myVoteValue && (
                  <Button variant="ghost" disabled={pending} onClick={withdraw}>
                    Withdraw my vote
                  </Button>
                )}
              </div>
            )}
            {message && (
              <p className="feedback" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
          </section>

          <div className="section-title">
            <h2>Keep climbing</h2>
            <TextLink to="/routes">All routes</TextLink>
          </div>
          <div className="session-band">
            <Mountain />
            <div>
              <h3>Beta and progression</h3>
              <p>Look at the route beta, then log the climb in your logbook.</p>
            </div>
            <Button asChild>
              <Link to="/member/beta" search={{ route: String(found.id) }}>
                Explore beta <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** The community leaderboard. */
export function LeaderboardPage() {
  // A suspense query, like the other content pages: the loader prefetches the
  // data on the server, and the client waits for the same data rather than
  // rendering a different first frame.
  const { data } = useSuspenseQuery(leaderboardQuery);

  return (
    <main className="page-main">
      <PageHeading
        eyebrow="THE LEADERBOARD"
        title="Who has been sending what."
        description="Every logged send counts. A send is worth one point per grade step, so harder problems score more."
      >
        <span className="sample-badge">
          {data?.source === "api" ? "LIVE FROM ARCH" : "SAMPLE DATA"}
        </span>
      </PageHeading>
      <SampleDataBanner resource={data ?? { source: "api" }} />
      {(data?.data?.length ?? 0) === 0 ? (
        <EmptyNotice
          title="Nobody has logged a send yet."
          description="The leaderboard fills up as members log their climbs. Be the first."
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Climber</th>
                <th>Sends</th>
                <th>Best grade</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.map((entry, index) => (
                <tr key={`${entry.rank}-${entry.displayName}-${index}`}>
                  <td>
                    <span className="leaderboard-rank">
                      {entry.rank === 1 ? <Trophy size={16} /> : `#${entry.rank}`}
                    </span>
                  </td>
                  <td>
                    <strong>{entry.displayName}</strong>
                  </td>
                  <td>{entry.totalSends}</td>
                  <td>{entry.bestGrade ?? "—"}</td>
                  <td>{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted-note">
        Only logged sends count. Ties are broken by the number of sends, then the best grade, then
        the date of the first send.
      </p>
      <div className="section-title">
        <h2>Log your own climbs</h2>
        <TextLink to="/member/logbook">Open logbook</TextLink>
      </div>
      <div className="session-band">
        <Check size={20} />
        <div>
          <h3>Every attempt counts.</h3>
          <p>Your logbook feeds the leaderboard and your own progress.</p>
        </div>
        <Button asChild>
          <Link to="/member/logbook">
            Log a climb <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </main>
  );
}

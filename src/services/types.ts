/**
 * Wire types: the exact JSON the ARCH backend returns.
 *
 * The frontend works with the camelCase shapes in `src/services/arch.ts`; the
 * mapping between the two happens once, in that module.
 */

export type ApiOpeningHour = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  note: string;
  is_closed: boolean;
};

export type ApiGym = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  map_url: string;
  about: string;
  surface_area_m2: number | null;
  route_count: number | null;
  opening_note: string;
  opening_hours: ApiOpeningHour[];
  is_placeholder: boolean;
};

export type ApiPrice = {
  id: number;
  category: string;
  name: string;
  description: string;
  amount_vnd: number;
  unit: string;
  sort_order: number;
};

export type ApiService = {
  id: number;
  title: string;
  summary: string;
  icon: string;
  sort_order: number;
};

export type ApiCourse = {
  id: number;
  title: string;
  level: string;
  summary: string;
  description: string;
  instructor: string;
  schedule: string;
  duration_weeks: number | null;
  capacity: number | null;
  price_vnd: number | null;
};

export type ApiEvent = {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number | null;
  is_public: boolean;
};

/** A wall the route directory can be filtered by. */
export type ApiRouteFilterWall = {
  id: number;
  name: string;
  image_url: string | null;
};

/**
 * The values the route directory can be filtered by.
 *
 * They come from the routes that exist, so the interface never offers a
 * filter the gym does not use.
 */
export type ApiRouteFilterOptions = {
  grades: string[];
  walls: ApiRouteFilterWall[];
  wall_types: string[];
  statuses: string[];
};

export type ApiRule = {
  id: number;
  title: string;
  body: string;
  category: string;
  sort_order: number;
  is_confirmed: boolean;
};

export type ApiFaqEntry = {
  id: number;
  question: string;
  answer: string;
  category: string;
  keywords: string;
};

export type ApiCatalogProduct = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  fit: string;
  price_vnd: number;
  description: string;
  image_url: string | null;
  stock: number;
  is_active: boolean;
};

export type ApiRouteSummary = {
  id: number;
  name: string;
  grade: string;
  /** The name of the wall the route is set on. */
  wall: string;
  wall_id: number | null;
  /** The photograph of the wall, when the gym has published one. */
  wall_image_url: string | null;
  wall_type: "slab" | "vertical" | "overhang" | "roof" | "boulder";
  color: string;
  style: string;
  setter: string;
  status: string;
  set_at: string | null;
  beta: string | null;
  image_url: string | null;
  sends: number;
  vote_count: number;
  easier_votes: number;
  as_set_votes: number;
  harder_votes: number;
  perceived_grade: string | null;
  is_fresh: boolean;
};

/** A wall in the gym. */
export type ApiWall = {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

/** A member's difficulty vote for a route. */
export type ApiVote = {
  id: number;
  route_id: number;
  value: "easier" | "as_set" | "harder";
  comment: string | null;
  created_at: string;
};

export type ApiVoteTally = {
  route_id: number;
  total: number;
  easier: number;
  as_set: number;
  harder: number;
  perceived_grade: string | null;
  official_grade: string;
};

export type ApiLeaderboardEntry = {
  rank: number;
  display_name: string;
  total_sends: number;
  best_grade: string | null;
  score: number;
};

/** The ranking's own explanation, as the backend applies it. */
export type ApiLeaderboardRules = {
  scoring_rule: string;
  percentile_rule: string;
};

export type ApiAssistantStatus = {
  provider: string | null;
  model: string | null;
  live_model_enabled: boolean;
  mode: string;
};

export type ApiAssistantAnswer = {
  answer: string;
  mode: string;
  sources: { id: number; question: string; category: string }[];
  provider: string | null;
  model: string | null;
  created_at: string;
  disclaimer: string;
};

/** A message sent through the public contact form. */
export type ApiContactMessage = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  handled: boolean;
  created_at: string;
};

/** A checklist entry on a staff task. */
export type ApiChecklistItem = {
  id: number;
  task_id: number;
  label: string;
  position: number;
  is_done: boolean;
  done_at: string | null;
  done_by_id: number | null;
};

/** A task assigned to a member of staff. */
export type ApiTask = {
  id: number;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "normal" | "high";
  due_at: string | null;
  completed_at: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  created_by_id: number | null;
  created_by_name: string | null;
  event_id: number | null;
  event_title: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  created_at: string;
  checklist: ApiChecklistItem[];
};

/** A scheduled shift for a member of staff. */
export type ApiShift = {
  id: number;
  staff_id: number;
  staff_name: string | null;
  starts_at: string;
  ends_at: string;
  role: string;
  notes: string;
};

/** The headline numbers of the operations dashboard. */
export type ApiAdminSummary = {
  members: number;
  staff: number;
  active_routes: number;
  archived_routes: number;
  upcoming_events: number;
  open_tasks: number;
  pending_agreements: number;
  products: number;
};

/** The minimum identity fields for an assignable staff member or administrator. */
export type ApiAdminAssignee = {
  id: number;
  full_name: string;
  email: string;
  role: "staff" | "admin";
};

/** A customer record, as the administrator sees it. */
export type ApiAdminMember = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  membership_tier: string | null;
  membership_status: string | null;
  joined_on: string | null;
  agreement_status: string | null;
  total_sends: number;
};

/** A safe customer row in the administrator directory. */
export type ApiAdminCustomer = ApiAdminMember & {
  created_at: string;
  last_climb_on: string | null;
};

export type ApiAdminCustomerPage = {
  items: ApiAdminCustomer[];
  total: number;
  limit: number;
  offset: number;
};

export type ApiAdminCustomerAgreement = {
  id: number;
  version: string;
  status: string;
  method: string | null;
  signed_at: string | null;
  signed_name: string | null;
  notes: string | null;
};

export type ApiAdminCustomerAttempt = {
  id: number;
  route_id: number | null;
  route_name: string;
  grade: string;
  result: "sent" | "project";
  attempts: number;
  climbed_on: string;
  created_at: string;
};

export type ApiAdminCustomerContact = {
  id: number;
  subject: string;
  handled: boolean;
  created_at: string;
};

export type ApiAdminCustomerActivity = {
  sends: number;
  flashes: number;
  projects: number;
  attempts: number;
  total_climbs: number;
};

export type ApiAdminCustomerDetail = ApiAdminCustomer & {
  phone: string | null;
  climbing_level: number;
  agreement: ApiAdminCustomerAgreement | null;
  activity: ApiAdminCustomerActivity;
  recent_attempts: ApiAdminCustomerAttempt[];
  recent_contact_messages: ApiAdminCustomerContact[];
  contact_history_note: string;
};

/** A member account, as the backend returns it. */
export type ApiUser = {
  id: number;
  email: string;
  full_name: string;
  role: "customer" | "staff" | "admin";
  is_active: boolean;
  phone: string | null;
  membership_tier: string | null;
  membership_status: string | null;
  joined_on: string | null;
  climbing_level: number;
};

export type ApiToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: ApiUser;
};

/** A customer's safety agreement record. */
export type ApiAgreement = {
  id: number;
  user_id: number;
  version: string;
  status: "pending" | "signed" | "waived" | "expired";
  method: string | null;
  signed_at: string | null;
  signed_name: string | null;
  notes: string | null;
  created_at: string;
};

/** How the member's logged climbs break down. */
export type ApiOutcomeCounts = {
  sends: number;
  /** The sends that were climbed on the first attempt. A subset of `sends`. */
  flashes: number;
  projects: number;
  attempts: number;
};

/** One grade in the member's own record. */
export type ApiGradeStat = {
  grade: string;
  sends: number;
  flashes: number;
  projects: number;
};

/** Where the member stands, together with the rule that produced it. */
export type ApiRanking = {
  /** `null` when the member is not ranked, which is not the same as rank 0. */
  rank: number | null;
  ranked_count: number;
  ahead: number;
  /** `null` when the member is not ranked. */
  percentile: number | null;
  score: number;
  total_sends: number;
  best_grade: string | null;
  /** The scoring rule in words, as the backend applied it. */
  scoring_rule: string;
  /** How the percentile is worked out, in words. */
  percentile_rule: string;
};

/** One of the member's most recent logged climbs. */
export type ApiRecentAttempt = {
  id: number;
  route_id: number | null;
  route_name: string;
  grade: string;
  result: "sent" | "project";
  attempts: number;
  climbed_on: string;
  /** True when the climb was a send on the first attempt. */
  is_flash: boolean;
};

/**
 * The signed-in member's climbing statistics.
 *
 * A value that is not available is `null`, never zero: a member who has never
 * climbed has no best grade, and is not ranked.
 */
export type ApiDashboard = {
  /** How many routes are on the wall at the gym right now. */
  active_routes: number;
  total_sends: number;
  total_sessions: number;
  best_grade: string | null;
  active_projects: number;
  outcomes: ApiOutcomeCounts;
  by_grade: ApiGradeStat[];
  ranking: ApiRanking;
  recent_attempts: ApiRecentAttempt[];
  /** False for a member who has never logged a climb. */
  has_activity: boolean;
  first_climb: string | null;
  last_climb: string | null;
  agreement_status: string | null;
};

/** A climb recorded in the signed-in member's logbook. */
export type ApiAchievement = {
  id: number;
  route_id: number | null;
  route_name: string;
  grade: string;
  result: "sent" | "project";
  attempts: number;
  climbed_on: string;
  notes: string | null;
  created_at: string;
};

/** The short route shape the staff picker receives. */
export type ApiStaffRouteOption = {
  id: number;
  name: string;
  grade: string;
  wall_id: number | null;
  status: string;
};

/** A hand-drawn hold box on a wall photograph, in normalised image space. */
export type ApiWallHold = {
  id: number;
  wall_id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
};

export type ApiHoldRole = "start" | "middle" | "finish";

/** One hold in a route's ordered sequence. */
export type ApiRouteHold = {
  id: number;
  wall_hold_id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  position: number;
  role: ApiHoldRole;
};

export type ApiRouteHoldSet = {
  id: number;
  route_id: number;
  status: "draft" | "published" | "superseded";
  wall_image_url: string | null;
  published_at: string | null;
  updated_at: string;
  holds: ApiRouteHold[];
};

export type ApiRouteHoldSetState = {
  route_id: number;
  draft: ApiRouteHoldSet | null;
  published: ApiRouteHoldSet | null;
};

export type ApiPublicRouteHolds = {
  route_id: number;
  image_url: string | null;
  published: boolean;
  holds: ApiRouteHold[];
};

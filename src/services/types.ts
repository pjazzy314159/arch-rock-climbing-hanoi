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
  event_id: number | null;
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

/** The signed-in member's climbing statistics. */
export type ApiDashboard = {
  total_sends: number;
  total_sessions: number;
  best_grade: string | null;
  active_projects: number;
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

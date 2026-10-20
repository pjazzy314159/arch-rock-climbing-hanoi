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
  zone: string;
  color: string;
  style: string;
  setter: string;
  status: string;
  set_at: string | null;
  beta: string | null;
  sends: number;
  vote_count: number;
  easier_votes: number;
  as_set_votes: number;
  harder_votes: number;
  perceived_grade: string | null;
  is_fresh: boolean;
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
  user_id: number;
  display_name: string;
  total_sends: number;
  best_grade: string | null;
  score: number;
  climbing_level: number;
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

/**
 * only the fields sensei uses from the public fpl api. some numbers arrive as
 * strings, so the types follow what the api actually sends.
 */

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  finished: boolean;
}

export interface FplTeam {
  id: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

/** id maps to position: 1 gk, 2 def, 3 mid, 4 fwd */
export interface FplElementType {
  id: number;
  singular_name_short: string;
}

export interface FplElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  cost_change_event: number;
  cost_change_start: number;
  selected_by_percent: string;
  form: string;
  ep_next: string;
  ep_this: string;
  total_points: number;
  transfers_in_event: number;
  transfers_out_event: number;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  status: string;
  news: string;
}

export interface FplBootstrapStatic {
  events: FplEvent[];
  teams: FplTeam[];
  element_types: FplElementType[];
  elements: FplElement[];
}

export interface FplFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  finished: boolean;
  kickoff_time: string | null;
}

/** league_type "s" is an fpl system league, "x" is one the manager joined */
export interface FplClassicLeague {
  id: number;
  name: string;
  league_type: string;
  rank_count: number;
  entry_rank: number;
  entry_last_rank: number;
}

export interface FplEntry {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
  summary_overall_points: number;
  summary_overall_rank: number;
  current_event: number;
  last_deadline_bank: number;
  last_deadline_value: number;
  leagues: {
    classic: FplClassicLeague[];
  };
}

export interface FplPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface FplEntryPicksResponse {
  picks: FplPick[];
  entry_history: {
    event: number;
    points: number;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
  };
}

export interface FplEntryHistoryChip {
  name: string;
  event: number;
}

export interface FplEntryHistoryResponse {
  current: Array<{
    event: number;
    points: number;
    total_points: number;
    rank: number;
    overall_rank: number;
    event_transfers: number;
    event_transfers_cost: number;
  }>;
  chips: FplEntryHistoryChip[];
}

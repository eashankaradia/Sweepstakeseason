export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          is_admin: boolean
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          is_admin?: boolean
          avatar_url?: string | null
        }
        Update: {
          display_name?: string | null
          is_admin?: boolean
          avatar_url?: string | null
        }
      }
      sweepstake_leagues: {
        Row: {
          id: string
          name: string
          season: string
          status: 'setup' | 'active' | 'completed'
          draft_locked: boolean
          draft_locked_at: string | null
          access_code: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          season: string
          status?: 'setup' | 'active' | 'completed'
          draft_locked?: boolean
          access_code?: string | null
          created_by?: string | null
        }
        Update: {
          name?: string
          season?: string
          status?: 'setup' | 'active' | 'completed'
          draft_locked?: boolean
          draft_locked_at?: string | null
          access_code?: string | null
        }
      }
      players: {
        Row: {
          id: string
          league_id: string
          user_id: string | null
          name: string
          email: string | null
          color: string
          position: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          league_id: string
          user_id?: string | null
          name: string
          email?: string | null
          color?: string
          position?: number | null
        }
        Update: {
          user_id?: string | null
          name?: string
          email?: string | null
          color?: string
          position?: number | null
        }
      }
      competitions: {
        Row: {
          id: string
          league_id: string
          name: string
          short_name: string
          competition_type: 'domestic_league' | 'european' | 'domestic_cup'
          country: string | null
          enabled: boolean
          display_order: number
          espn_slug: string | null
          created_at: string
        }
        Insert: {
          league_id: string
          name: string
          short_name: string
          competition_type: 'domestic_league' | 'european' | 'domestic_cup'
          country?: string | null
          enabled?: boolean
          display_order?: number
          espn_slug?: string | null
        }
        Update: {
          name?: string
          short_name?: string
          enabled?: boolean
          display_order?: number
          espn_slug?: string | null
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          short_name: string | null
          country: string
          tier: number
          primary_color: string
          secondary_color: string
          logo_url: string | null
          league_position: number | null
          espn_team_id: string | null
          created_at: string
        }
        Insert: {
          name: string
          short_name?: string | null
          country: string
          tier?: number
          primary_color?: string
          secondary_color?: string
          logo_url?: string | null
          league_position?: number | null
          espn_team_id?: string | null
        }
        Update: {
          name?: string
          short_name?: string | null
          country?: string
          tier?: number
          primary_color?: string
          secondary_color?: string
          logo_url?: string | null
          league_position?: number | null
          espn_team_id?: string | null
        }
      }
      team_competitions: {
        Row: {
          id: string
          league_id: string
          team_id: string
          competition_id: string
        }
        Insert: {
          league_id: string
          team_id: string
          competition_id: string
        }
        Update: Record<string, never>
      }
      player_team_assignments: {
        Row: {
          id: string
          league_id: string
          player_id: string
          team_id: string
          draft_run_id: string | null
          assigned_at: string
        }
        Insert: {
          league_id: string
          player_id: string
          team_id: string
          draft_run_id?: string | null
        }
        Update: {
          player_id?: string
          team_id?: string
        }
      }
      draft_runs: {
        Row: {
          id: string
          league_id: string
          run_number: number
          generated_by: string | null
          generated_at: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          allocation_snapshot: Json | null
        }
        Insert: {
          league_id: string
          run_number?: number
          generated_by?: string | null
          notes?: string | null
          allocation_snapshot?: Json | null
        }
        Update: {
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
        }
      }
      fixtures: {
        Row: {
          id: string
          league_id: string
          competition_id: string
          home_team_id: string
          away_team_id: string
          kickoff_time: string | null
          status: 'scheduled' | 'live' | 'completed' | 'postponed'
          home_score: number | null
          away_score: number | null
          round: string | null
          matchday: number | null
          external_id: string | null
          home_odds: number | null
          draw_odds: number | null
          away_odds: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          league_id: string
          competition_id: string
          home_team_id: string
          away_team_id: string
          kickoff_time?: string | null
          status?: 'scheduled' | 'live' | 'completed' | 'postponed'
          home_score?: number | null
          away_score?: number | null
          round?: string | null
          matchday?: number | null
          external_id?: string | null
          home_odds?: number | null
          draw_odds?: number | null
          away_odds?: number | null
        }
        Update: {
          kickoff_time?: string | null
          status?: 'scheduled' | 'live' | 'completed' | 'postponed'
          home_score?: number | null
          away_score?: number | null
          round?: string | null
          matchday?: number | null
          home_odds?: number | null
          draw_odds?: number | null
          away_odds?: number | null
        }
      }
      scoring_rules: {
        Row: {
          id: string
          league_id: string
          rule_key: string
          rule_name: string
          description: string | null
          points: number
          enabled: boolean
        }
        Insert: {
          league_id: string
          rule_key: string
          rule_name: string
          description?: string | null
          points: number
          enabled?: boolean
        }
        Update: {
          rule_name?: string
          description?: string | null
          points?: number
          enabled?: boolean
        }
      }
      player_scores: {
        Row: {
          id: string
          league_id: string
          player_id: string
          total_points: number
          wins: number
          draws: number
          losses: number
          matches_played: number
          last_calculated_at: string
        }
        Insert: {
          league_id: string
          player_id: string
          total_points?: number
          wins?: number
          draws?: number
          losses?: number
          matches_played?: number
        }
        Update: {
          total_points?: number
          wins?: number
          draws?: number
          losses?: number
          matches_played?: number
          last_calculated_at?: string
        }
      }
      team_scores: {
        Row: {
          id: string
          league_id: string
          team_id: string
          competition_id: string | null
          total_points: number
          wins: number
          draws: number
          losses: number
          goals_for: number
          goals_against: number
          matches_played: number
          last_calculated_at: string
        }
        Insert: {
          league_id: string
          team_id: string
          competition_id?: string | null
          total_points?: number
          wins?: number
          draws?: number
          losses?: number
          goals_for?: number
          goals_against?: number
          matches_played?: number
        }
        Update: {
          total_points?: number
          wins?: number
          draws?: number
          losses?: number
          goals_for?: number
          goals_against?: number
          matches_played?: number
          last_calculated_at?: string
        }
      }
      admin_settings: {
        Row: {
          id: string
          league_id: string
          setting_key: string
          setting_value: Json | null
          updated_at: string
        }
        Insert: {
          league_id: string
          setting_key: string
          setting_value?: Json | null
        }
        Update: {
          setting_value?: Json | null
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type League = Database['public']['Tables']['sweepstake_leagues']['Row']
export type Player = Database['public']['Tables']['players']['Row']
export type Competition = Database['public']['Tables']['competitions']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type TeamCompetition = Database['public']['Tables']['team_competitions']['Row']
export type PlayerTeamAssignment = Database['public']['Tables']['player_team_assignments']['Row']
export type DraftRun = Database['public']['Tables']['draft_runs']['Row']
export type Fixture = Database['public']['Tables']['fixtures']['Row']
export type ScoringRule = Database['public']['Tables']['scoring_rules']['Row']
export type PlayerScore = Database['public']['Tables']['player_scores']['Row']
export type TeamScore = Database['public']['Tables']['team_scores']['Row']

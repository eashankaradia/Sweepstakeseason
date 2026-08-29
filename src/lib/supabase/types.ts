export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          body: string | null
          created_at: string
          event_type: string
          fixture_id: string | null
          id: string
          league_id: string
          metadata: Json | null
          player_id: string | null
          points_delta: number | null
          team_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type: string
          fixture_id?: string | null
          id?: string
          league_id: string
          metadata?: Json | null
          player_id?: string | null
          points_delta?: number | null
          team_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string
          fixture_id?: string | null
          id?: string
          league_id?: string
          metadata?: Json | null
          player_id?: string | null
          points_delta?: number | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reactions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          league_id: string
          player_id: string
          reaction_type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          league_id: string
          player_id: string
          reaction_type: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          league_id?: string
          player_id?: string
          reaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          id: string
          league_id: string
          setting_key: string
          setting_value: Json | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          league_id: string
          setting_key: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          league_id?: string
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          competition_type: string
          country: string | null
          created_at: string | null
          display_order: number | null
          enabled: boolean | null
          espn_slug: string | null
          id: string
          league_id: string
          name: string
          short_name: string
        }
        Insert: {
          competition_type: string
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          enabled?: boolean | null
          espn_slug?: string | null
          id?: string
          league_id: string
          name: string
          short_name: string
        }
        Update: {
          competition_type?: string
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          enabled?: boolean | null
          espn_slug?: string | null
          id?: string
          league_id?: string
          name?: string
          short_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_runs: {
        Row: {
          allocation_snapshot: Json | null
          generated_at: string | null
          generated_by: string | null
          id: string
          league_id: string
          locked: boolean | null
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          run_number: number
        }
        Insert: {
          allocation_snapshot?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          league_id: string
          locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          run_number?: number
        }
        Update: {
          allocation_snapshot?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          league_id?: string
          locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          run_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_runs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          away_odds: number | null
          away_score: number | null
          away_team_id: string
          competition_id: string
          created_at: string | null
          draw_odds: number | null
          external_id: string | null
          home_odds: number | null
          home_score: number | null
          home_team_id: string
          id: string
          kickoff_time: string | null
          league_id: string
          matchday: number | null
          round: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          away_odds?: number | null
          away_score?: number | null
          away_team_id: string
          competition_id: string
          created_at?: string | null
          draw_odds?: number | null
          external_id?: string | null
          home_odds?: number | null
          home_score?: number | null
          home_team_id: string
          id?: string
          kickoff_time?: string | null
          league_id: string
          matchday?: number | null
          round?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          away_odds?: number | null
          away_score?: number | null
          away_team_id?: string
          competition_id?: string
          created_at?: string | null
          draw_odds?: number | null
          external_id?: string | null
          home_odds?: number | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          kickoff_time?: string | null
          league_id?: string
          matchday?: number | null
          round?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_memberships: {
        Row: {
          id: string
          joined_at: string | null
          league_id: string
          player_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          league_id: string
          player_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          league_id?: string
          player_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_scores: {
        Row: {
          bonus_points: number
          draws: number | null
          id: string
          last_calculated_at: string | null
          league_id: string
          losses: number | null
          matches_played: number | null
          player_id: string
          total_points: number | null
          wins: number | null
        }
        Insert: {
          bonus_points?: number
          draws?: number | null
          id?: string
          last_calculated_at?: string | null
          league_id: string
          losses?: number | null
          matches_played?: number | null
          player_id: string
          total_points?: number | null
          wins?: number | null
        }
        Update: {
          bonus_points?: number
          draws?: number | null
          id?: string
          last_calculated_at?: string | null
          league_id?: string
          losses?: number | null
          matches_played?: number | null
          player_id?: string
          total_points?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_team_assignments: {
        Row: {
          assigned_at: string | null
          draft_run_id: string | null
          id: string
          league_id: string
          player_id: string
          team_id: string
        }
        Insert: {
          assigned_at?: string | null
          draft_run_id?: string | null
          id?: string
          league_id: string
          player_id: string
          team_id: string
        }
        Update: {
          assigned_at?: string | null
          draft_run_id?: string | null
          id?: string
          league_id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_team_assignments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_user_id: string | null
          color: string | null
          created_at: string | null
          email: string | null
          id: string
          league_id: string
          name: string
          position: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          league_id: string
          name: string
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          league_id?: string
          name?: string
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      power_up_activations: {
        Row: {
          activated_at: string
          fixture_id: string | null
          id: string
          league_id: string
          player_id: string
          points_delta: number | null
          power_up_type: string
          result: string | null
          season_month: string | null
          status: string
          target_player_id: string | null
          team_id: string | null
        }
        Insert: {
          activated_at?: string
          fixture_id?: string | null
          id?: string
          league_id: string
          player_id: string
          points_delta?: number | null
          power_up_type: string
          result?: string | null
          season_month?: string | null
          status?: string
          target_player_id?: string | null
          team_id?: string | null
        }
        Update: {
          activated_at?: string
          fixture_id?: string | null
          id?: string
          league_id?: string
          player_id?: string
          points_delta?: number | null
          power_up_type?: string
          result?: string | null
          season_month?: string | null
          status?: string
          target_player_id?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "power_up_activations_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_up_activations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_up_activations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_up_activations_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_up_activations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          is_admin: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          is_admin?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_admin?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scoring_rules: {
        Row: {
          description: string | null
          enabled: boolean | null
          id: string
          league_id: string
          points: number
          rule_key: string
          rule_name: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean | null
          id?: string
          league_id: string
          points?: number
          rule_key: string
          rule_name: string
        }
        Update: {
          description?: string | null
          enabled?: boolean | null
          id?: string
          league_id?: string
          points?: number
          rule_key?: string
          rule_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      sweepstake_leagues: {
        Row: {
          access_code: string | null
          created_at: string | null
          created_by: string | null
          draft_locked: boolean | null
          draft_locked_at: string | null
          id: string
          name: string
          public_readonly: boolean
          season: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          access_code?: string | null
          created_at?: string | null
          created_by?: string | null
          draft_locked?: boolean | null
          draft_locked_at?: string | null
          id?: string
          name: string
          public_readonly?: boolean
          season: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_code?: string | null
          created_at?: string | null
          created_by?: string | null
          draft_locked?: boolean | null
          draft_locked_at?: string | null
          id?: string
          name?: string
          public_readonly?: boolean
          season?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_competitions: {
        Row: {
          competition_id: string
          id: string
          league_id: string
          team_id: string
        }
        Insert: {
          competition_id: string
          id?: string
          league_id: string
          team_id: string
        }
        Update: {
          competition_id?: string
          id?: string
          league_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_competitions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_scores: {
        Row: {
          competition_id: string | null
          draws: number | null
          goals_against: number | null
          goals_for: number | null
          id: string
          last_calculated_at: string | null
          league_id: string
          losses: number | null
          matches_played: number | null
          team_id: string
          total_points: number | null
          wins: number | null
        }
        Insert: {
          competition_id?: string | null
          draws?: number | null
          goals_against?: number | null
          goals_for?: number | null
          id?: string
          last_calculated_at?: string | null
          league_id: string
          losses?: number | null
          matches_played?: number | null
          team_id: string
          total_points?: number | null
          wins?: number | null
        }
        Update: {
          competition_id?: string | null
          draws?: number | null
          goals_against?: number | null
          goals_for?: number | null
          id?: string
          last_calculated_at?: string | null
          league_id?: string
          losses?: number | null
          matches_played?: number | null
          team_id?: string
          total_points?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_scores_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "sweepstake_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          country: string
          created_at: string | null
          espn_team_id: string | null
          id: string
          league_position: number | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          short_name: string | null
          tier: number | null
        }
        Insert: {
          country: string
          created_at?: string | null
          espn_team_id?: string | null
          id?: string
          league_position?: number | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          tier?: number | null
        }
        Update: {
          country?: string
          created_at?: string | null
          espn_team_id?: string | null
          id?: string
          league_position?: number | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          tier?: number | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id: string
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_monthly_standings: {
        Args: { p_league_id: string }
        Returns: {
          month: string
          monthly_draws: number
          monthly_losses: number
          monthly_played: number
          monthly_points: number
          monthly_wins: number
          player_color: string
          player_id: string
          player_name: string
        }[]
      }
      is_current_user_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ─── Convenience row-type aliases used throughout the app ─────────────────
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
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type LeagueMembership = Database['public']['Tables']['league_memberships']['Row']
export type AdminSetting = Database['public']['Tables']['admin_settings']['Row']
export type PowerUpActivation = Database['public']['Tables']['power_up_activations']['Row']

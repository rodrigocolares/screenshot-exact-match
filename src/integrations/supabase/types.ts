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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          org_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          org_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "log_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analyses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_occurrences: {
        Row: {
          event_count: number
          id: string
          is_demo: boolean
          message: string
          org_id: string
          rule_id: string | null
          status: string
          triggered_at: string
        }
        Insert: {
          event_count: number
          id?: string
          is_demo?: boolean
          message: string
          org_id: string
          rule_id?: string | null
          status?: string
          triggered_at?: string
        }
        Update: {
          event_count?: number
          id?: string
          is_demo?: boolean
          message?: string
          org_id?: string
          rule_id?: string | null
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_occurrences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_occurrences_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          alert_severity: string
          created_at: string
          description: string | null
          enabled: boolean
          http_status_min: number | null
          id: string
          message_contains: string | null
          min_severity: string
          name: string
          org_id: string
          source_type: string | null
          threshold: number
          window_minutes: number
        }
        Insert: {
          alert_severity?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          http_status_min?: number | null
          id?: string
          message_contains?: string | null
          min_severity?: string
          name: string
          org_id: string
          source_type?: string | null
          threshold?: number
          window_minutes?: number
        }
        Update: {
          alert_severity?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          http_status_min?: number | null
          id?: string
          message_contains?: string | null
          min_severity?: string
          name?: string
          org_id?: string
          source_type?: string | null
          threshold?: number
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_audit: {
        Row: {
          action: string
          actor_id: string | null
          collector_id: string | null
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          collector_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collector_audit_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "collectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collector_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collectors: {
        Row: {
          api_key_id: string
          created_at: string
          created_by: string | null
          events_total: number
          id: string
          last_delivery_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_event_at: string | null
          last_heartbeat_at: string | null
          last_http_status: number | null
          name: string
          org_id: string
          server_id: string
          sources: Json
          version: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          created_by?: string | null
          events_total?: number
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_http_status?: number | null
          name: string
          org_id: string
          server_id: string
          sources?: Json
          version?: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          created_by?: string | null
          events_total?: number
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_http_status?: number | null
          name?: string
          org_id?: string
          server_id?: string
          sources?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "collectors_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "ingestion_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectors_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          rate_limit_per_minute: number
          revoked_at: string | null
          rotated_from: string | null
          scopes: string[]
          server_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          server_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_api_keys_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_api_requests: {
        Row: {
          api_key_id: string | null
          collector_id: string | null
          created_at: string
          endpoint: string
          error: string | null
          events: number
          id: string
          org_id: string | null
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          collector_id?: string | null
          created_at?: string
          endpoint: string
          error?: string | null
          events?: number
          id?: string
          org_id?: string | null
          status_code: number
        }
        Update: {
          api_key_id?: string | null
          collector_id?: string | null
          created_at?: string
          endpoint?: string
          error?: string | null
          events?: number
          id?: string
          org_id?: string | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_api_requests_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "ingestion_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_api_requests_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "collectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_api_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_batches: {
        Row: {
          api_key_id: string | null
          collector_id: string | null
          created_at: string
          errors: Json
          events_accepted: number
          events_duplicated: number
          events_received: number
          events_rejected: number
          external_batch_id: string | null
          id: string
          org_id: string
          server_id: string | null
          source_type: string
          status: string
        }
        Insert: {
          api_key_id?: string | null
          collector_id?: string | null
          created_at?: string
          errors?: Json
          events_accepted?: number
          events_duplicated?: number
          events_received?: number
          events_rejected?: number
          external_batch_id?: string | null
          id?: string
          org_id: string
          server_id?: string | null
          source_type: string
          status?: string
        }
        Update: {
          api_key_id?: string | null
          collector_id?: string | null
          created_at?: string
          errors?: Json
          events_accepted?: number
          events_duplicated?: number
          events_received?: number
          events_rejected?: number
          external_batch_id?: string | null
          id?: string
          org_id?: string
          server_id?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_batches_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "ingestion_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_batches_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "collectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_batches_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          errors: Json
          file_hash: string | null
          file_name: string
          id: string
          is_demo: boolean
          lines_duplicated: number
          lines_imported: number
          lines_rejected: number
          lines_total: number
          log_type: string
          org_id: string
          server_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_hash?: string | null
          file_name: string
          id?: string
          is_demo?: boolean
          lines_duplicated?: number
          lines_imported?: number
          lines_rejected?: number
          lines_total?: number
          log_type: string
          org_id: string
          server_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_hash?: string | null
          file_name?: string
          id?: string
          is_demo?: boolean
          lines_duplicated?: number
          lines_imported?: number
          lines_rejected?: number
          lines_total?: number
          log_type?: string
          org_id?: string
          server_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      log_events: {
        Row: {
          attributes: Json
          client_ip: string | null
          correlation_id: string | null
          dedup_hash: string
          environment: string | null
          event_category: string | null
          hostname: string | null
          http_method: string | null
          http_status: number | null
          id: string
          is_demo: boolean
          job_id: string | null
          message: string
          observed_timestamp: string
          operating_system: string | null
          org_id: string
          raw_message: string | null
          request_path: string | null
          response_time: number | null
          server_id: string | null
          service_name: string | null
          severity: string
          source_type: string
          timestamp: string
          trace_id: string | null
          user_agent: string | null
          username: string | null
        }
        Insert: {
          attributes?: Json
          client_ip?: string | null
          correlation_id?: string | null
          dedup_hash: string
          environment?: string | null
          event_category?: string | null
          hostname?: string | null
          http_method?: string | null
          http_status?: number | null
          id?: string
          is_demo?: boolean
          job_id?: string | null
          message: string
          observed_timestamp?: string
          operating_system?: string | null
          org_id: string
          raw_message?: string | null
          request_path?: string | null
          response_time?: number | null
          server_id?: string | null
          service_name?: string | null
          severity?: string
          source_type: string
          timestamp: string
          trace_id?: string | null
          user_agent?: string | null
          username?: string | null
        }
        Update: {
          attributes?: Json
          client_ip?: string | null
          correlation_id?: string | null
          dedup_hash?: string
          environment?: string | null
          event_category?: string | null
          hostname?: string | null
          http_method?: string | null
          http_status?: number | null
          id?: string
          is_demo?: boolean
          job_id?: string | null
          message?: string
          observed_timestamp?: string
          operating_system?: string | null
          org_id?: string
          raw_message?: string | null
          request_path?: string | null
          response_time?: number | null
          server_id?: string | null
          service_name?: string | null
          severity?: string
          source_type?: string
          timestamp?: string
          trace_id?: string | null
          user_agent?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_events_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_org_id: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          default_org_id?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          default_org_id?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      saved_queries: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_queries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          address: string | null
          agent_status: string
          applications: string[]
          created_at: string
          environment: string
          hostname: string
          id: string
          is_demo: boolean
          last_seen_at: string | null
          org_id: string
          os: string
          os_version: string | null
          owner: string | null
          services: string[]
          tags: string[]
        }
        Insert: {
          address?: string | null
          agent_status?: string
          applications?: string[]
          created_at?: string
          environment?: string
          hostname: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          org_id: string
          os: string
          os_version?: string | null
          owner?: string | null
          services?: string[]
          tags?: string[]
        }
        Update: {
          address?: string | null
          agent_status?: string
          applications?: string[]
          created_at?: string
          environment?: string
          hostname?: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          org_id?: string
          os?: string
          os_version?: string | null
          owner?: string | null
          services?: string[]
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "servers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_org: { Args: { _org: string }; Returns: boolean }
      clear_demo_data: { Args: { _org: string }; Returns: undefined }
      collector_hourly: {
        Args: { _collector: string; _org: string }
        Returns: Json
      }
      dashboard_stats: {
        Args: { _bucket?: string; _org: string; _since: string }
        Returns: Json
      }
      evaluate_alerts: { Args: { _org: string }; Returns: number }
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      load_demo_data: { Args: { _org: string }; Returns: number }
      record_collector_delivery: {
        Args: {
          _accepted: number
          _error?: string
          _event_at: string
          _heartbeat: boolean
          _id: string
          _status: number
        }
        Returns: undefined
      }
    }
    Enums: {
      org_role: "admin" | "analyst" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      org_role: ["admin", "analyst", "viewer"],
    },
  },
} as const

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          at: string | null
          id: number
          meta: Json | null
          target: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string | null
          id?: number
          meta?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string | null
          id?: number
          meta?: Json | null
          target?: string | null
        }
        Relationships: []
      }
      cron_job_history: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: number
          items_synced: number | null
          job_name: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: number
          items_synced?: number | null
          job_name: string
          status: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: number
          items_synced?: number | null
          job_name?: string
          status?: string
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          id: number
          idx: number
          image_url: string
          post_id: number
        }
        Insert: {
          id?: number
          idx: number
          image_url: string
          post_id: number
        }
        Update: {
          id?: number
          idx?: number
          image_url?: string
          post_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "gallery_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_posts: {
        Row: {
          created_at: string | null
          created_by: string
          description_md: string | null
          gif_url: string | null
          id: number
          location: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description_md?: string | null
          gif_url?: string | null
          id?: number
          location?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description_md?: string | null
          gif_url?: string | null
          id?: number
          location?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_users_30d"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          body_md: string
          created_at: string | null
          id: number
          image_url: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body_md: string
          created_at?: string | null
          id?: number
          image_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body_md?: string
          created_at?: string | null
          id?: number
          image_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_users_30d"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          category: string
          content_md: string | null
          created_at: string | null
          excerpt: string | null
          hash: string
          id: number
          image_url: string | null
          published_at: string
          source: Json
          source_url: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          content_md?: string | null
          created_at?: string | null
          excerpt?: string | null
          hash: string
          id?: number
          image_url?: string | null
          published_at: string
          source?: Json
          source_url: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content_md?: string | null
          created_at?: string | null
          excerpt?: string | null
          hash?: string
          id?: number
          image_url?: string | null
          published_at?: string
          source?: Json
          source_url?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          bio_md: string | null
          created_at: string | null
          display_name: string
          handle: string
          id: string
          stats: Json | null
          updated_at: string | null
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          bio_md?: string | null
          created_at?: string | null
          display_name: string
          handle: string
          id: string
          stats?: Json | null
          updated_at?: string | null
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          bio_md?: string | null
          created_at?: string | null
          display_name?: string
          handle?: string
          id?: string
          stats?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      server_status: {
        Row: {
          category: string
          content_md: string | null
          created_at: string | null
          excerpt: string | null
          hash: string
          id: number
          image_url: string | null
          published_at: string
          severity: string
          source: Json
          source_url: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content_md?: string | null
          created_at?: string | null
          excerpt?: string | null
          hash: string
          id?: never
          image_url?: string | null
          published_at: string
          severity?: string
          source?: Json
          source_url: string
          status: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content_md?: string | null
          created_at?: string | null
          excerpt?: string | null
          hash?: string
          id?: never
          image_url?: string | null
          published_at?: string
          severity?: string
          source?: Json
          source_url?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ships: {
        Row: {
          armament: Json | null
          beam_m: number | null
          cargo_scu: number | null
          crew_max: number | null
          crew_min: number | null
          flight_ready_since: string | null
          hash: string
          height_m: number | null
          id: number
          image_url: string | null
          length_m: number | null
          manufacturer: string | null
          max_speed: number | null
          model_glb_url: string | null
          name: string
          patch: string | null
          prices: Json | null
          production_status: string | null
          role: string | null
          scm_speed: number | null
          size: string | null
          slug: string
          source: Json
          systems: Json | null
          updated_at: string | null
        }
        Insert: {
          armament?: Json | null
          beam_m?: number | null
          cargo_scu?: number | null
          crew_max?: number | null
          crew_min?: number | null
          flight_ready_since?: string | null
          hash: string
          height_m?: number | null
          id?: number
          image_url?: string | null
          length_m?: number | null
          manufacturer?: string | null
          max_speed?: number | null
          model_glb_url?: string | null
          name: string
          patch?: string | null
          prices?: Json | null
          production_status?: string | null
          role?: string | null
          scm_speed?: number | null
          size?: string | null
          slug: string
          source: Json
          systems?: Json | null
          updated_at?: string | null
        }
        Update: {
          armament?: Json | null
          beam_m?: number | null
          cargo_scu?: number | null
          crew_max?: number | null
          crew_min?: number | null
          flight_ready_since?: string | null
          hash?: string
          height_m?: number | null
          id?: number
          image_url?: string | null
          length_m?: number | null
          manufacturer?: string | null
          max_speed?: number | null
          model_glb_url?: string | null
          name?: string
          patch?: string | null
          prices?: Json | null
          production_status?: string | null
          role?: string | null
          scm_speed?: number | null
          size?: string | null
          slug?: string
          source?: Json
          systems?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_users_30d: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          handle: string | null
          id: string | null
          last_post: string | null
          posts_30d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_user: { Args: { target_user_id: string }; Returns: undefined }
      delete_old_news: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_active_users_30d: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin"
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
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const

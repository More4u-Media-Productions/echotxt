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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      call_participants: {
        Row: {
          call_id: string
          invited_at: string
          joined_at: string | null
          left_at: string | null
          state: string
          user_id: string
        }
        Insert: {
          call_id: string
          invited_at?: string
          joined_at?: string | null
          left_at?: string | null
          state?: string
          user_id: string
        }
        Update: {
          call_id?: string
          invited_at?: string
          joined_at?: string | null
          left_at?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          from_user: string
          id: string
          kind: string
          payload: Json
          to_user: string
        }
        Insert: {
          call_id: string
          created_at?: string
          from_user: string
          id?: string
          kind: string
          payload?: Json
          to_user: string
        }
        Update: {
          call_id?: string
          created_at?: string
          from_user?: string
          id?: string
          kind?: string
          payload?: Json
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          caller_id: string
          conversation_id: string
          duration_seconds: number
          ended_at: string | null
          id: string
          media: Database["public"]["Enums"]["call_media"]
          started_at: string
          status: Database["public"]["Enums"]["call_status"]
          voicemail_transcript: string | null
        }
        Insert: {
          caller_id: string
          conversation_id: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          media?: Database["public"]["Enums"]["call_media"]
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          voicemail_transcript?: string | null
        }
        Update: {
          caller_id?: string
          conversation_id?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          media?: Database["public"]["Enums"]["call_media"]
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          voicemail_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          accepted: boolean
          archived: boolean
          conversation_id: string
          invited_at: string
          invited_by: string | null
          joined_at: string
          last_read_at: string
          muted: boolean
          pinned: boolean
          role: string
          user_id: string
        }
        Insert: {
          accepted?: boolean
          archived?: boolean
          conversation_id: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          pinned?: boolean
          role?: string
          user_id: string
        }
        Update: {
          accepted?: boolean
          archived?: boolean
          conversation_id?: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          pinned?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_color: string
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          created_by: string
          description: string | null
          dm_key: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string
          only_admins_invite: boolean
          only_admins_post: boolean
          title: string | null
        }
        Insert: {
          avatar_color?: string
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          dm_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string
          only_admins_invite?: boolean
          only_admins_post?: boolean
          title?: string | null
        }
        Update: {
          avatar_color?: string
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          dm_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string
          only_admins_invite?: boolean
          only_admins_post?: boolean
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          blocked_by: string | null
          created_at: string
          id: string
          note: string | null
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          requester_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          requester_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_bookmarks: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_bookmarks_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_hides: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_hides_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_hides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          metadata: Json
          pinned: boolean
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          pinned?: boolean
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          metadata?: Json
          pinned?: boolean
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          created_at: string
          friends_enabled: boolean
          groups_enabled: boolean
          mentions_enabled: boolean
          messages_enabled: boolean
          push_enabled: boolean
          quiet_end: number
          quiet_hours_enabled: boolean
          quiet_start: number
          updated_at: string
          user_id: string
          utc_offset_minutes: number
        }
        Insert: {
          created_at?: string
          friends_enabled?: boolean
          groups_enabled?: boolean
          mentions_enabled?: boolean
          messages_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: number
          quiet_hours_enabled?: boolean
          quiet_start?: number
          updated_at?: string
          user_id: string
          utc_offset_minutes?: number
        }
        Update: {
          created_at?: string
          friends_enabled?: boolean
          groups_enabled?: boolean
          mentions_enabled?: boolean
          messages_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: number
          quiet_hours_enabled?: boolean
          quiet_start?: number
          updated_at?: string
          user_id?: string
          utc_offset_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          conversation_id: string | null
          created_at: string
          detail: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          appear_offline: boolean
          avatar_color: string
          avatar_url: string | null
          banner_url: string | null
          bio: string
          created_at: string
          display_name: string
          id: string
          last_seen: string
          last_seen_visibility: string
          presence: Database["public"]["Enums"]["presence_state"]
          presence_visibility: string
          privacy_settings: Json
          pronouns: string | null
          status_emoji: string | null
          status_text: string
          updated_at: string
          username: string
        }
        Insert: {
          appear_offline?: boolean
          avatar_color?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          id: string
          last_seen?: string
          last_seen_visibility?: string
          presence?: Database["public"]["Enums"]["presence_state"]
          presence_visibility?: string
          privacy_settings?: Json
          pronouns?: string | null
          status_emoji?: string | null
          status_text?: string
          updated_at?: string
          username: string
        }
        Update: {
          appear_offline?: boolean
          avatar_color?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          id?: string
          last_seen?: string
          last_seen_visibility?: string
          presence?: Database["public"]["Enums"]["presence_state"]
          presence_visibility?: string
          privacy_settings?: Json
          pronouns?: string | null
          status_emoji?: string | null
          status_text?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_members: {
        Args: { _cid: string; _ids: string[] }
        Returns: number
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      conversation_role: {
        Args: { _cid: string; _uid: string }
        Returns: string
      }
      create_group: {
        Args: {
          _avatar_color?: string
          _description?: string
          _member_ids?: string[]
          _title: string
        }
        Returns: string
      }
      decline_call: { Args: { _call: string }; Returns: undefined }
      delete_conversation: { Args: { _cid: string }; Returns: undefined }
      delete_message_for_everyone: {
        Args: { _mid: string }
        Returns: undefined
      }
      end_call: { Args: { _call: string }; Returns: undefined }
      friendship_state: {
        Args: { _other: string }
        Returns: {
          blocked_by: string
          friendship_id: string
          incoming: boolean
          status: string
        }[]
      }
      group_members: {
        Args: { _cid: string }
        Returns: {
          accepted: boolean
          avatar_color: string
          avatar_url: string
          display_name: string
          invited_by: string
          joined_at: string
          presence: Database["public"]["Enums"]["presence_state"]
          role: string
          status_emoji: string
          status_text: string
          user_id: string
          username: string
        }[]
      }
      is_blocked_with: { Args: { _other: string }; Returns: boolean }
      is_conversation_admin: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      is_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      join_call: { Args: { _call: string }; Returns: undefined }
      leave_call: { Args: { _call: string }; Returns: undefined }
      leave_group: { Args: { _cid: string }; Returns: undefined }
      post_system_message: {
        Args: { _actor: string; _body: string; _cid: string }
        Returns: undefined
      }
      public_profile: {
        Args: { _id: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          banner_url: string
          bio: string
          blocked_by: string
          display_name: string
          friendship_id: string
          friendship_status: string
          id: string
          incoming: boolean
          last_seen: string
          presence: Database["public"]["Enums"]["presence_state"]
          pronouns: string
          status_emoji: string
          status_text: string
          username: string
        }[]
      }
      purge_conversation: { Args: { _cid: string }; Returns: undefined }
      remove_group_member: {
        Args: { _cid: string; _uid: string }
        Returns: undefined
      }
      respond_group_invite: {
        Args: { _accept: boolean; _cid: string }
        Returns: undefined
      }
      safe_uuid: { Args: { _t: string }; Returns: string }
      search_conversations: {
        Args: { _limit?: number; _term: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string
          match_reason: string
          member_count: number
          title: string
        }[]
      }
      search_messages: {
        Args: {
          _conversation?: string
          _from?: string
          _limit?: number
          _media?: string
          _offset?: number
          _sender?: string
          _term: string
          _to?: string
        }
        Returns: {
          attachment_name: string
          attachment_size: number
          attachment_type: string
          attachment_url: string
          body: string
          conversation_avatar_url: string
          conversation_color: string
          conversation_id: string
          conversation_kind: Database["public"]["Enums"]["conversation_kind"]
          conversation_title: string
          created_at: string
          kind: Database["public"]["Enums"]["message_kind"]
          message_id: string
          sender_avatar_url: string
          sender_color: string
          sender_id: string
          sender_name: string
          sender_username: string
          total_count: number
        }[]
      }
      search_profiles: {
        Args: { _limit?: number; _term: string }
        Returns: {
          avatar_color: string
          avatar_url: string
          banner_url: string
          bio: string
          display_name: string
          friendship_id: string
          friendship_status: string
          id: string
          incoming: boolean
          presence: Database["public"]["Enums"]["presence_state"]
          pronouns: string
          status_emoji: string
          status_text: string
          username: string
        }[]
      }
      set_group_role: {
        Args: { _cid: string; _role: string; _uid: string }
        Returns: undefined
      }
      set_message_pinned: {
        Args: { _mid: string; _pinned: boolean }
        Returns: undefined
      }
      start_call: {
        Args: {
          _cid: string
          _media: Database["public"]["Enums"]["call_media"]
        }
        Returns: string
      }
      start_dm: { Args: { _other: string }; Returns: string }
      update_group: {
        Args: {
          _avatar_color?: string
          _cid: string
          _description?: string
          _only_admins_invite?: boolean
          _only_admins_post?: boolean
          _title?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      call_media: "voice" | "video"
      call_status: "ringing" | "answered" | "missed" | "declined" | "voicemail"
      conversation_kind: "dm" | "group"
      friendship_status: "pending" | "accepted" | "blocked" | "declined"
      message_kind:
        | "text"
        | "image"
        | "voice"
        | "file"
        | "poll"
        | "voicemail"
        | "event"
        | "system"
      presence_state: "online" | "away" | "offline"
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
      call_media: ["voice", "video"],
      call_status: ["ringing", "answered", "missed", "declined", "voicemail"],
      conversation_kind: ["dm", "group"],
      friendship_status: ["pending", "accepted", "blocked", "declined"],
      message_kind: [
        "text",
        "image",
        "voice",
        "file",
        "poll",
        "voicemail",
        "event",
        "system",
      ],
      presence_state: ["online", "away", "offline"],
    },
  },
} as const

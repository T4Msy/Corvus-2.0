import type { SupabaseClient } from "@supabase/supabase-js";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ConversationRow = {
  id: string;
  usuario_id: string;
  titulo: string | null;
  session_id: string | null;
  created_at?: string | null;
  updated_at: string | null;
};

export type MessageRow = {
  id?: string;
  conversa_id: string;
  role: string;
  texto: string;
  created_at: string | null;
};

export type UserProfileRow = {
  id: string;
  nome: string | null;
  nome_interno: string | null;
  cargo: string | null;
  sigla_cargo: string | null;
  tipo: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export interface Database {
  public: {
    Tables: {
      msy_usuarios: {
        Row: UserProfileRow;
        Insert: Partial<UserProfileRow> & { id: string };
        Update: Partial<UserProfileRow>;
        Relationships: [];
      };
      msy_conversas: {
        Row: ConversationRow;
        Insert: {
          id: string;
          usuario_id: string;
          titulo?: string | null;
          session_id?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      msy_mensagens: {
        Row: MessageRow;
        Insert: {
          conversa_id: string;
          role: string;
          texto: string;
          created_at?: string | null;
        };
        Update: Partial<MessageRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type CorvusSupabaseClient = SupabaseClient<Database>;

export type SupabaseRuntimeStatus = {
  configured: boolean;
  urlPresent: boolean;
  anonKeyPresent: boolean;
  serviceRolePresent?: boolean;
  missing: string[];
};

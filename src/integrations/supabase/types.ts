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
      escalas: {
        Row: {
          created_at: string
          data: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          ilha_id: string | null
          modalidade: string
          pessoa_id: string
          programa_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          data: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          ilha_id?: string | null
          modalidade?: string
          pessoa_id: string
          programa_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          data?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          ilha_id?: string | null
          modalidade?: string
          pessoa_id?: string
          programa_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_ilha_id_fkey"
            columns: ["ilha_id"]
            isOneToOne: false
            referencedRelation: "ilhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          dias_abono: number
          dias_gozo: number | null
          id: string
          observacao: string | null
          periodo_aquisitivo_fim: string | null
          periodo_aquisitivo_inicio: string | null
          pessoa_id: string
          status: string
          tipo_programacao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          dias_abono?: number
          dias_gozo?: number | null
          id?: string
          observacao?: string | null
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          pessoa_id: string
          status?: string
          tipo_programacao?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias_abono?: number
          dias_gozo?: number | null
          id?: string
          observacao?: string | null
          periodo_aquisitivo_fim?: string | null
          periodo_aquisitivo_inicio?: string | null
          pessoa_id?: string
          status?: string
          tipo_programacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      funcoes: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      ilhas: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      licencas: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          observacao: string | null
          pessoa_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          observacao?: string | null
          pessoa_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          observacao?: string | null
          pessoa_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencias: {
        Row: {
          created_at: string
          data: string
          descricao: string
          id: string
          pessoa_id: string
          status: string
          tipo: string
          valor_encontrado: string | null
          valor_exigido: string | null
        }
        Insert: {
          created_at?: string
          data: string
          descricao: string
          id?: string
          pessoa_id: string
          status?: string
          tipo: string
          valor_encontrado?: string | null
          valor_exigido?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          pessoa_id?: string
          status?: string
          tipo?: string
          valor_encontrado?: string | null
          valor_exigido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencias_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_records: {
        Row: {
          created_at: string
          data: string
          id: string
          nota_artistico: number | null
          nota_comportamento: number | null
          nota_tecnico: number | null
          observacao: string | null
          pessoa_id: string
          recognition_tag: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          nota_artistico?: number | null
          nota_comportamento?: number | null
          nota_tecnico?: number | null
          observacao?: string | null
          pessoa_id: string
          recognition_tag?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nota_artistico?: number | null
          nota_comportamento?: number | null
          nota_tecnico?: number | null
          observacao?: string | null
          pessoa_id?: string
          recognition_tag?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_records_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          contato_emergencia: string | null
          created_at: string
          data_contratacao: string | null
          email_corporativo: string | null
          email_pessoal: string | null
          endereco: string | null
          funcao_id: string | null
          id: string
          jornada_padrao: string | null
          matricula: string | null
          nome: string
          ordem: number
          overdue_vacation_days: number
          pending_vacation_days: number
          position: string | null
          status: string
          telefone: string | null
          tipo_conteudo_id: string | null
          vacation_control_start: string | null
          vacation_setup_notes: string | null
          vacation_status: string | null
        }
        Insert: {
          contato_emergencia?: string | null
          created_at?: string
          data_contratacao?: string | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          endereco?: string | null
          funcao_id?: string | null
          id?: string
          jornada_padrao?: string | null
          matricula?: string | null
          nome: string
          ordem?: number
          overdue_vacation_days?: number
          pending_vacation_days?: number
          position?: string | null
          status?: string
          telefone?: string | null
          tipo_conteudo_id?: string | null
          vacation_control_start?: string | null
          vacation_setup_notes?: string | null
          vacation_status?: string | null
        }
        Update: {
          contato_emergencia?: string | null
          created_at?: string
          data_contratacao?: string | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          endereco?: string | null
          funcao_id?: string | null
          id?: string
          jornada_padrao?: string | null
          matricula?: string | null
          nome?: string
          ordem?: number
          overdue_vacation_days?: number
          pending_vacation_days?: number
          position?: string | null
          status?: string
          telefone?: string | null
          tipo_conteudo_id?: string | null
          vacation_control_start?: string | null
          vacation_setup_notes?: string | null
          vacation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_tipo_conteudo_id_fkey"
            columns: ["tipo_conteudo_id"]
            isOneToOne: false
            referencedRelation: "tipos_conteudo"
            referencedColumns: ["id"]
          },
        ]
      }
      programa_necessidades: {
        Row: {
          created_at: string
          dia_semana: number
          id: string
          programa_id: string
          quantidade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dia_semana: number
          id?: string
          programa_id: string
          quantidade?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dia_semana?: number
          id?: string
          programa_id?: string
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programa_necessidades_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      programas: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          sigla: string | null
          tipo_conteudo_id: string | null
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          sigla?: string | null
          tipo_conteudo_id?: string | null
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          sigla?: string | null
          tipo_conteudo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programas_tipo_conteudo_id_fkey"
            columns: ["tipo_conteudo_id"]
            isOneToOne: false
            referencedRelation: "tipos_conteudo"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_conteudo: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

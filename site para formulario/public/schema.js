// Schema do banco embutido (gerado automaticamente).
window.SCHEMA = {
 "activities": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "title",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "description",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "assigned_to",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "assigned_by",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "deadline",
    "udt": "date",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "opens_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "closes_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "extended_deadline",
    "udt": "date",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "status",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "priority",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "activity_responses": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "activity_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "user_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "text",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "file_url",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "file_name",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "is_late",
    "udt": "bool",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "biblioteca_conteudos": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "titulo",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "descricao",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "link",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "categoria",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "criado_por",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "comunicados": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "title",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "content",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "author_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "category",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "pinned",
    "udt": "bool",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "events": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "title",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "description",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "event_date",
    "udt": "date",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "event_time",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "type",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "mandatory",
    "udt": "bool",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "created_by",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "meeting_minutes": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "title",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "type",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "meeting_date",
    "udt": "date",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "content",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "document_url",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "document_name",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_by",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_chats": {
  "columns": [
   {
    "name": "id",
    "udt": "int8",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "usuario_id",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "session_id",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "titulo",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "mensagens",
    "udt": "jsonb",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "criado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "atualizado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_conversas": {
  "columns": [
   {
    "name": "id",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "usuario_id",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "titulo",
    "udt": "text",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "session_id",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "pinned",
    "udt": "bool",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "favorite",
    "udt": "bool",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "tags",
    "udt": "_text",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "summary",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "archived",
    "udt": "bool",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_decision_log": {
  "columns": [
   {
    "name": "id",
    "udt": "int4",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "descricao",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "tipo",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "area",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "modo",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "usuario_id",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "session_id",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "criado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_documents": {
  "columns": [
   {
    "name": "id",
    "udt": "int8",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "content",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "metadata",
    "udt": "jsonb",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "embedding",
    "udt": "vector",
    "nullable": true,
    "hasDefault": false
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_knowledge": {
  "columns": [
   {
    "name": "id",
    "udt": "int8",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "categoria",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "titulo",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "conteudo",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "tags",
    "udt": "_text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "ativo",
    "udt": "bool",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "embedding",
    "udt": "vector",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "criado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "atualizado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_memoria_chat": {
  "columns": [
   {
    "name": "id",
    "udt": "int8",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "session_id",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "message",
    "udt": "jsonb",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_mensagens": {
  "columns": [
   {
    "name": "id",
    "udt": "int8",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "conversa_id",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "role",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "texto",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "attachments",
    "udt": "jsonb",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "msy_usuarios": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "nome",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "nome_interno",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "cargo",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "sigla_cargo",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "tipo",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "ativo",
    "udt": "bool",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "criado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "atualizado_em",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "avatar_url",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "theme_preference",
    "udt": "text",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "preferences",
    "udt": "jsonb",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": true,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "notifications": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "user_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "message",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "type",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "icon",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "read",
    "udt": "bool",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "link",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "premiacao_vencedores": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "premiacao_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "membro_id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "periodo",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "observacao",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "concedido_por",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "premiacoes": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "titulo",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "descricao",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "importancia",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "imagem_url",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "icone",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "ativo",
    "udt": "bool",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "criado_por",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "profiles": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "name",
    "udt": "text",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "role",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "tier",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "initials",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "color",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "status",
    "udt": "text",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "join_date",
    "udt": "date",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "avatar_url",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "bio",
    "udt": "text",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "updated_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 },
 "staffing_ai_chat_memory": {
  "columns": [
   {
    "name": "id",
    "udt": "int4",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "session_id",
    "udt": "varchar",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "message",
    "udt": "jsonb",
    "nullable": false,
    "hasDefault": false
   }
  ],
  "pk": [
   "id"
  ]
 },
 "weekly_rankings": {
  "columns": [
   {
    "name": "id",
    "udt": "uuid",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "week_start",
    "udt": "date",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "week_end",
    "udt": "date",
    "nullable": false,
    "hasDefault": false
   },
   {
    "name": "entries",
    "udt": "jsonb",
    "nullable": false,
    "hasDefault": true
   },
   {
    "name": "created_by",
    "udt": "uuid",
    "nullable": true,
    "hasDefault": false
   },
   {
    "name": "created_at",
    "udt": "timestamptz",
    "nullable": false,
    "hasDefault": true
   }
  ],
  "pk": [
   "id"
  ]
 }
};

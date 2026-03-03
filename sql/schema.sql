[
  {
    "data": {
      "enums": [],
      "views": [
        {
          "name": "bom_summary",
          "definition": " SELECT doc_id,\n    canonical_key,\n    max(canonical_name) AS canonical_name,\n    unit,\n    sum(quantity) AS total_qty,\n    count(*) AS fact_count,\n    array_agg(DISTINCT block_id) AS source_block_ids,\n    bool_and(user_verified) AS all_verified\n   FROM material_facts mf\n  WHERE (canonical_key IS NOT NULL)\n  GROUP BY doc_id, canonical_key, unit;"
        }
      ],
      "schema": "public",
      "tables": [
        {
          "name": "doc_blocks",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "page_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "block_uid",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "block_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "content",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "has_table",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "has_error",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "error_text",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "section_title",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "doc_pages",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "page_no",
              "type": "integer",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "sheet_label",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "sheet_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "documents",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "user_id",
              "type": "text",
              "default": "'anonymous'::text",
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "filename",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "storage_path",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "stamp_text",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "status",
              "type": "text",
              "default": "'uploaded'::text",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "error_blocks_count",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "page_count",
              "type": "integer",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "block_count",
              "type": "integer",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "error_message",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "raw_md",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "project_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "section_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "model_used",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "material_facts",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "block_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "raw_name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "canonical_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "canonical_key",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "quantity",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "mark",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "gost",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "note",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_snippet",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "table_category",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "confidence",
              "type": "real",
              "default": "1.0",
              "nullable": false,
              "position": 15,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "user_verified",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "projects",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "sections",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "sort_order",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "statement_items",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "statement_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "canonical_key",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "canonical_name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_qty",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fact_count",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "source_block_ids",
              "type": "_uuid",
              "default": "'{}'::uuid[]",
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "user_verified",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "statements",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": "gen_random_uuid()",
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "model_used",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "item_count",
              "type": "integer",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "project_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "section_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        }
      ],
      "indexes": [
        {
          "name": "doc_blocks_doc_id_block_uid_key",
          "definition": "CREATE UNIQUE INDEX doc_blocks_doc_id_block_uid_key ON public.doc_blocks USING btree (doc_id, block_uid)",
          "table_name": "doc_blocks"
        },
        {
          "name": "doc_blocks_pkey",
          "definition": "CREATE UNIQUE INDEX doc_blocks_pkey ON public.doc_blocks USING btree (id)",
          "table_name": "doc_blocks"
        },
        {
          "name": "idx_doc_blocks_doc_id",
          "definition": "CREATE INDEX idx_doc_blocks_doc_id ON public.doc_blocks USING btree (doc_id)",
          "table_name": "doc_blocks"
        },
        {
          "name": "idx_doc_blocks_page_id",
          "definition": "CREATE INDEX idx_doc_blocks_page_id ON public.doc_blocks USING btree (page_id)",
          "table_name": "doc_blocks"
        },
        {
          "name": "doc_pages_doc_id_page_no_key",
          "definition": "CREATE UNIQUE INDEX doc_pages_doc_id_page_no_key ON public.doc_pages USING btree (doc_id, page_no)",
          "table_name": "doc_pages"
        },
        {
          "name": "doc_pages_pkey",
          "definition": "CREATE UNIQUE INDEX doc_pages_pkey ON public.doc_pages USING btree (id)",
          "table_name": "doc_pages"
        },
        {
          "name": "idx_doc_pages_doc_id",
          "definition": "CREATE INDEX idx_doc_pages_doc_id ON public.doc_pages USING btree (doc_id)",
          "table_name": "doc_pages"
        },
        {
          "name": "documents_pkey",
          "definition": "CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id)",
          "table_name": "documents"
        },
        {
          "name": "idx_material_facts_block_id",
          "definition": "CREATE INDEX idx_material_facts_block_id ON public.material_facts USING btree (block_id)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_canonical_key",
          "definition": "CREATE INDEX idx_material_facts_canonical_key ON public.material_facts USING btree (canonical_key)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_doc_id",
          "definition": "CREATE INDEX idx_material_facts_doc_id ON public.material_facts USING btree (doc_id)",
          "table_name": "material_facts"
        },
        {
          "name": "material_facts_pkey",
          "definition": "CREATE UNIQUE INDEX material_facts_pkey ON public.material_facts USING btree (id)",
          "table_name": "material_facts"
        },
        {
          "name": "projects_pkey",
          "definition": "CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id)",
          "table_name": "projects"
        },
        {
          "name": "sections_code_key",
          "definition": "CREATE UNIQUE INDEX sections_code_key ON public.sections USING btree (code)",
          "table_name": "sections"
        },
        {
          "name": "sections_pkey",
          "definition": "CREATE UNIQUE INDEX sections_pkey ON public.sections USING btree (id)",
          "table_name": "sections"
        },
        {
          "name": "idx_statement_items_statement_id",
          "definition": "CREATE INDEX idx_statement_items_statement_id ON public.statement_items USING btree (statement_id)",
          "table_name": "statement_items"
        },
        {
          "name": "statement_items_pkey",
          "definition": "CREATE UNIQUE INDEX statement_items_pkey ON public.statement_items USING btree (id)",
          "table_name": "statement_items"
        },
        {
          "name": "idx_statements_created_at",
          "definition": "CREATE INDEX idx_statements_created_at ON public.statements USING btree (created_at DESC)",
          "table_name": "statements"
        },
        {
          "name": "statements_pkey",
          "definition": "CREATE UNIQUE INDEX statements_pkey ON public.statements USING btree (id)",
          "table_name": "statements"
        }
      ],
      "policies": [],
      "triggers": [],
      "functions": [],
      "sequences": [],
      "foreign_keys": [
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "doc_blocks",
          "constraint_name": "doc_blocks_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "page_id"
          ],
          "table_name": "doc_blocks",
          "constraint_name": "doc_blocks_page_id_fkey",
          "references_table": "doc_pages",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "doc_pages",
          "constraint_name": "doc_pages_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "project_id"
          ],
          "table_name": "documents",
          "constraint_name": "documents_project_id_fkey",
          "references_table": "projects",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "section_id"
          ],
          "table_name": "documents",
          "constraint_name": "documents_section_id_fkey",
          "references_table": "sections",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "material_facts",
          "constraint_name": "material_facts_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "block_id"
          ],
          "table_name": "material_facts",
          "constraint_name": "material_facts_block_id_fkey",
          "references_table": "doc_blocks",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "statement_id"
          ],
          "table_name": "statement_items",
          "constraint_name": "statement_items_statement_id_fkey",
          "references_table": "statements",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "section_id"
          ],
          "table_name": "statements",
          "constraint_name": "statements_section_id_fkey",
          "references_table": "sections",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "project_id"
          ],
          "table_name": "statements",
          "constraint_name": "statements_project_id_fkey",
          "references_table": "projects",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "statements",
          "constraint_name": "statements_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        }
      ],
      "generated_at": "2026-03-02T15:52:23.188539+00:00",
      "primary_keys": [
        {
          "columns": [
            "id"
          ],
          "table_name": "doc_blocks",
          "constraint_name": "doc_blocks_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "doc_pages",
          "constraint_name": "doc_pages_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "documents",
          "constraint_name": "documents_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "material_facts",
          "constraint_name": "material_facts_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "projects",
          "constraint_name": "projects_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "sections",
          "constraint_name": "sections_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "statement_items",
          "constraint_name": "statement_items_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "statements",
          "constraint_name": "statements_pkey"
        }
      ],
      "check_constraints": [
        {
          "table_name": "doc_blocks",
          "check_clause": "page_id IS NOT NULL",
          "constraint_name": "2200_17524_3_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17524_1_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "(block_type = ANY (ARRAY['TEXT'::text, 'IMAGE'::text]))",
          "constraint_name": "doc_blocks_block_type_check"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "content IS NOT NULL",
          "constraint_name": "2200_17524_6_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "block_type IS NOT NULL",
          "constraint_name": "2200_17524_5_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "block_uid IS NOT NULL",
          "constraint_name": "2200_17524_4_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17524_2_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_17524_11_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "has_error IS NOT NULL",
          "constraint_name": "2200_17524_8_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "has_table IS NOT NULL",
          "constraint_name": "2200_17524_7_not_null"
        },
        {
          "table_name": "doc_pages",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_17508_6_not_null"
        },
        {
          "table_name": "doc_pages",
          "check_clause": "page_no IS NOT NULL",
          "constraint_name": "2200_17508_3_not_null"
        },
        {
          "table_name": "doc_pages",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17508_2_not_null"
        },
        {
          "table_name": "doc_pages",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17508_1_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17494_1_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "(status = ANY (ARRAY['uploaded'::text, 'parsing'::text, 'extracting'::text, 'done'::text, 'error'::text, 'has_errors'::text]))",
          "constraint_name": "documents_status_check"
        },
        {
          "table_name": "documents",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_17494_13_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_17494_12_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "error_blocks_count IS NOT NULL",
          "constraint_name": "2200_17494_8_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "status IS NOT NULL",
          "constraint_name": "2200_17494_7_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "filename IS NOT NULL",
          "constraint_name": "2200_17494_3_not_null"
        },
        {
          "table_name": "documents",
          "check_clause": "user_id IS NOT NULL",
          "constraint_name": "2200_17494_2_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_17548_18_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17548_1_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17548_2_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "block_id IS NOT NULL",
          "constraint_name": "2200_17548_3_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "raw_name IS NOT NULL",
          "constraint_name": "2200_17548_4_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "confidence IS NOT NULL",
          "constraint_name": "2200_17548_15_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "user_verified IS NOT NULL",
          "constraint_name": "2200_17548_16_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_17548_17_not_null"
        },
        {
          "table_name": "projects",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20979_2_not_null"
        },
        {
          "table_name": "projects",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20979_1_not_null"
        },
        {
          "table_name": "projects",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_20979_6_not_null"
        },
        {
          "table_name": "projects",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20979_5_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_20989_2_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20989_3_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "sort_order IS NOT NULL",
          "constraint_name": "2200_20989_4_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20989_5_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20989_1_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "canonical_name IS NOT NULL",
          "constraint_name": "2200_20932_4_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "canonical_key IS NOT NULL",
          "constraint_name": "2200_20932_3_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "statement_id IS NOT NULL",
          "constraint_name": "2200_20932_2_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20932_1_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "user_verified IS NOT NULL",
          "constraint_name": "2200_20932_9_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "fact_count IS NOT NULL",
          "constraint_name": "2200_20932_7_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20916_6_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_20916_7_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20916_1_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20916_3_not_null"
        }
      ],
      "unique_constraints": [
        {
          "columns": [
            "doc_id",
            "block_uid"
          ],
          "table_name": "doc_blocks",
          "constraint_name": "doc_blocks_doc_id_block_uid_key"
        },
        {
          "columns": [
            "doc_id",
            "page_no"
          ],
          "table_name": "doc_pages",
          "constraint_name": "doc_pages_doc_id_page_no_key"
        },
        {
          "columns": [
            "code"
          ],
          "table_name": "sections",
          "constraint_name": "sections_code_key"
        }
      ]
    }
  }
]
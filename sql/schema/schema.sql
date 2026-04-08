[
  {
    "data": {
      "enums": [],
      "views": [
        {
          "name": "bom_summary",
          "definition": " SELECT doc_id,\n    canonical_key,\n    max(canonical_name) AS canonical_name,\n    unit,\n    sum(quantity) AS total_qty,\n    count(*) AS fact_count,\n    array_agg(DISTINCT block_id) AS source_block_ids,\n    bool_and(user_verified) AS all_verified,\n    array_agg(DISTINCT block_type_display) FILTER (WHERE (block_type_display IS NOT NULL)) AS source_block_display_types\n   FROM material_facts mf\n  WHERE (canonical_key IS NOT NULL)\n  GROUP BY doc_id, canonical_key, unit;"
        }
      ],
      "schema": "public",
      "tables": [
        {
          "name": "_stg_resources_keep",
          "columns": [
            {
              "name": "resource_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "_stg_resources_to_deactivate",
          "columns": [
            {
              "name": "id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "processed",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "dependency_flags",
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
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "referenced_doc_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "referenced_sheet",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "dependency_type",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resolved",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
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
            },
            {
              "name": "image_url",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "doc_glossary",
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
              "name": "code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "item_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_block_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "confidence",
              "type": "real",
              "default": "0.8",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 8,
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
            },
            {
              "name": "glossary_status",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "prompt_tokens",
              "type": "integer",
              "default": "0",
              "nullable": true,
              "position": 19,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "completion_tokens",
              "type": "integer",
              "default": "0",
              "nullable": true,
              "position": 20,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "total_tokens",
              "type": "integer",
              "default": "0",
              "nullable": true,
              "position": 21,
              "max_length": null,
              "numeric_precision": 32
            }
          ]
        },
        {
          "name": "estimate_lines",
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
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "sort_order",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "rate_match_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_item_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "line_number",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "justification",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "measure_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "volume",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "volume_calc_note",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "unit_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "labor_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "material_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "machine_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_material_fact_ids",
              "type": "_uuid",
              "default": null,
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_block_ids",
              "type": "_uuid",
              "default": null,
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "estimate_rate_matches",
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
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_item_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fsnb_norm_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "match_confidence",
              "type": "real",
              "default": "0.7",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "match_method",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_coverage",
              "type": "real",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "needs_review",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "user_verified",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_reasoning",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "alternatives",
              "type": "jsonb",
              "default": "'[]'::jsonb",
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "estimate_resource_matches",
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
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "material_fact_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "rate_match_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fsnb_resource_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fsnb_resource_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fsnb_resource_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fsnb_resource_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "tg_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "match_confidence",
              "type": "real",
              "default": "0.7",
              "nullable": false,
              "position": 10,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "match_method",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "unit_compatible",
              "type": "boolean",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "conversion_formula",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "needs_review",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "user_verified",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_reasoning",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "alternatives",
              "type": "jsonb",
              "default": "'[]'::jsonb",
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
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
          "name": "estimate_review_queue",
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
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "severity",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "issue_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "related_work_item_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "related_material_fact_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "related_resource_match_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "related_rate_match_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "suggested_action",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resolved",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resolved_by",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resolved_at",
              "type": "timestamp with time zone",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "estimate_work_items",
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
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_description",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_category",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "construction",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_section",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_material_fact_ids",
              "type": "_uuid",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "confidence",
              "type": "real",
              "default": "0.8",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "needs_review",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_reasoning",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_steps",
              "type": "jsonb",
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
            }
          ]
        },
        {
          "name": "estimates",
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
              "name": "project_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "status",
              "type": "text",
              "default": "'draft'::text",
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "method",
              "type": "text",
              "default": "'resource_index'::text",
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "region_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "price_period",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_direct_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_overhead",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_profit",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_cost",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "iteration_count",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 13,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "model_used",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "prompt_tokens",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 15,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "completion_tokens",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 16,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "total_tokens",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 17,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "error_message",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 20,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_collections",
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
              "name": "base_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "version",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "xml_source_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "record_count",
              "type": "integer",
              "default": "0",
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "imported_at",
              "type": "timestamp with time zone",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_norm_resources",
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
              "name": "norm_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_type",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "consumption",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "measure_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_norm_tech_groups",
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
              "name": "norm_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_base_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "tg_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "abstract_resource_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "abstract_resource_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "abstract_resource_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_norms",
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
              "name": "collection_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "norm_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "base_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "begin_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "end_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "measure_unit",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "collection_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "collection_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "division_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "division_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "table_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "table_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_category",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "embedding",
              "type": "vector",
              "default": null,
              "nullable": true,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "search_text",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "metadata",
              "type": "jsonb",
              "default": "'{}'::jsonb",
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 20,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "is_active",
              "type": "boolean",
              "default": "true",
              "nullable": false,
              "position": 21,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "is_selected",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 22,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_price_indices",
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
              "name": "region_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "region_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "period",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_category",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "labor_index",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "material_index",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "machine_index",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "equipment_index",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source",
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
          "name": "fsnb_profile_collections",
          "columns": [
            {
              "name": "profile_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 1,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "collection_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "collection_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "mode",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "note",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_profiles",
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
            }
          ]
        },
        {
          "name": "fsnb_resources",
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
              "name": "collection_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "measure_unit",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "book_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "book_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "part_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "part_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "section_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "section_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "group_code",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 13,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "group_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "base_price",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "opt_price",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "salary_mach",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "labour_mach",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "price_without_salary",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "machinist_category",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 20,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "gost_refs",
              "type": "_text",
              "default": null,
              "nullable": true,
              "position": 21,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "embedding",
              "type": "vector",
              "default": null,
              "nullable": true,
              "position": 22,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "search_text",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 23,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "metadata",
              "type": "jsonb",
              "default": "'{}'::jsonb",
              "nullable": true,
              "position": 24,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 25,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 26,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "is_active",
              "type": "boolean",
              "default": "true",
              "nullable": false,
              "position": 27,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "fsnb_synonyms",
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
              "name": "term",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "canonical_term",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_code_prefix",
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
            }
          ]
        },
        {
          "name": "fsnb_tech_groups",
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
              "name": "tg_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "tg_name",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_count",
              "type": "integer",
              "default": "0",
              "nullable": true,
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
          "name": "fsnb_tg_resources",
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
              "name": "tg_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "resource_code",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "imported_rate_categories",
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
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "imported_rate_types",
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
              "name": "category_id",
              "type": "uuid",
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
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "imported_rates",
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
              "name": "type_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "work_name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "unit",
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
            }
          ]
        },
        {
          "name": "llm_prompts",
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
              "name": "key",
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
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "system_prompt",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "default_system_prompt",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "is_active",
              "type": "boolean",
              "default": "true",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 9,
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
            },
            {
              "name": "source_section",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "construction",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 20,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "extra_params",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 21,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "block_type_display",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 22,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "kind",
              "type": "text",
              "default": "'material'::text",
              "nullable": false,
              "position": 23,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "qty_scope",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 24,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "needs_review",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 25,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "derived_from_fact_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 26,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "multiplier",
              "type": "numeric",
              "default": null,
              "nullable": true,
              "position": 27,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "calc_note",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 28,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "fact_type",
              "type": "text",
              "default": "'observed'::text",
              "nullable": false,
              "position": 29,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "quantity_type",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 30,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "product_facts",
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
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "assembly_mark",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "assembly_name",
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
              "name": "source_section",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "note",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 11,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source_snippet",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 12,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "confidence",
              "type": "real",
              "default": "0.8",
              "nullable": false,
              "position": 13,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "user_verified",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 14,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 15,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "kind",
              "type": "text",
              "default": "'product'::text",
              "nullable": false,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "qty_scope",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "needs_review",
              "type": "boolean",
              "default": "false",
              "nullable": false,
              "position": 19,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "extra_params",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 20,
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
          "name": "skill_examples",
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
              "name": "group_id",
              "type": "uuid",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "input_text",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "input_context",
              "type": "jsonb",
              "default": "'{}'::jsonb",
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "input_embedding",
              "type": "vector",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "output_result",
              "type": "jsonb",
              "default": null,
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "source",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "doc_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "quality_score",
              "type": "real",
              "default": "1.0",
              "nullable": false,
              "position": 10,
              "max_length": null,
              "numeric_precision": 24
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
          "name": "skill_feedback",
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
              "name": "skill_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "estimate_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "agent_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "action",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "original_result",
              "type": "jsonb",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "corrected_result",
              "type": "jsonb",
              "default": null,
              "nullable": true,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "user_comment",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        },
        {
          "name": "skill_registry",
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
              "name": "agent_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 2,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "skill_type",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "name",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "description",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "version",
              "type": "integer",
              "default": "1",
              "nullable": false,
              "position": 6,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "is_active",
              "type": "boolean",
              "default": "true",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "rule_config",
              "type": "jsonb",
              "default": null,
              "nullable": true,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "prompt_template",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 9,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "example_group_id",
              "type": "uuid",
              "default": null,
              "nullable": true,
              "position": 10,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "total_uses",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 11,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "successful_uses",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 12,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "rejected_uses",
              "type": "integer",
              "default": "0",
              "nullable": false,
              "position": 13,
              "max_length": null,
              "numeric_precision": 32
            },
            {
              "name": "accuracy_rate",
              "type": "real",
              "default": null,
              "nullable": true,
              "position": 14,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "avg_confidence",
              "type": "real",
              "default": null,
              "nullable": true,
              "position": 15,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "created_by",
              "type": "text",
              "default": "'system'::text",
              "nullable": false,
              "position": 16,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "approved_by",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 17,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 18,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "updated_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 19,
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
        },
        {
          "name": "work_hints",
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
              "nullable": true,
              "position": 3,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "hint_text",
              "type": "text",
              "default": null,
              "nullable": false,
              "position": 4,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "hint_type",
              "type": "text",
              "default": null,
              "nullable": true,
              "position": 5,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "related_materials",
              "type": "_text",
              "default": null,
              "nullable": true,
              "position": 6,
              "max_length": null,
              "numeric_precision": null
            },
            {
              "name": "confidence",
              "type": "real",
              "default": "0.8",
              "nullable": false,
              "position": 7,
              "max_length": null,
              "numeric_precision": 24
            },
            {
              "name": "created_at",
              "type": "timestamp with time zone",
              "default": "now()",
              "nullable": false,
              "position": 8,
              "max_length": null,
              "numeric_precision": null
            }
          ]
        }
      ],
      "indexes": [
        {
          "name": "_stg_resources_keep_pkey",
          "definition": "CREATE UNIQUE INDEX _stg_resources_keep_pkey ON public._stg_resources_keep USING btree (resource_id)",
          "table_name": "_stg_resources_keep"
        },
        {
          "name": "_stg_resources_to_deactivate_pkey",
          "definition": "CREATE UNIQUE INDEX _stg_resources_to_deactivate_pkey ON public._stg_resources_to_deactivate USING btree (id)",
          "table_name": "_stg_resources_to_deactivate"
        },
        {
          "name": "_stg_resources_to_deactivate_processed_idx",
          "definition": "CREATE INDEX _stg_resources_to_deactivate_processed_idx ON public._stg_resources_to_deactivate USING btree (processed)",
          "table_name": "_stg_resources_to_deactivate"
        },
        {
          "name": "dependency_flags_pkey",
          "definition": "CREATE UNIQUE INDEX dependency_flags_pkey ON public.dependency_flags USING btree (id)",
          "table_name": "dependency_flags"
        },
        {
          "name": "idx_dependency_flags_doc_id",
          "definition": "CREATE INDEX idx_dependency_flags_doc_id ON public.dependency_flags USING btree (doc_id)",
          "table_name": "dependency_flags"
        },
        {
          "name": "idx_dependency_flags_ref_code",
          "definition": "CREATE INDEX idx_dependency_flags_ref_code ON public.dependency_flags USING btree (referenced_doc_code)",
          "table_name": "dependency_flags"
        },
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
          "name": "doc_glossary_doc_id_code_key",
          "definition": "CREATE UNIQUE INDEX doc_glossary_doc_id_code_key ON public.doc_glossary USING btree (doc_id, code)",
          "table_name": "doc_glossary"
        },
        {
          "name": "doc_glossary_pkey",
          "definition": "CREATE UNIQUE INDEX doc_glossary_pkey ON public.doc_glossary USING btree (id)",
          "table_name": "doc_glossary"
        },
        {
          "name": "idx_doc_glossary_doc_id",
          "definition": "CREATE INDEX idx_doc_glossary_doc_id ON public.doc_glossary USING btree (doc_id)",
          "table_name": "doc_glossary"
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
          "name": "estimate_lines_pkey",
          "definition": "CREATE UNIQUE INDEX estimate_lines_pkey ON public.estimate_lines USING btree (id)",
          "table_name": "estimate_lines"
        },
        {
          "name": "idx_el_estimate",
          "definition": "CREATE INDEX idx_el_estimate ON public.estimate_lines USING btree (estimate_id)",
          "table_name": "estimate_lines"
        },
        {
          "name": "estimate_rate_matches_pkey",
          "definition": "CREATE UNIQUE INDEX estimate_rate_matches_pkey ON public.estimate_rate_matches USING btree (id)",
          "table_name": "estimate_rate_matches"
        },
        {
          "name": "idx_erm_estimate",
          "definition": "CREATE INDEX idx_erm_estimate ON public.estimate_rate_matches USING btree (estimate_id)",
          "table_name": "estimate_rate_matches"
        },
        {
          "name": "idx_erm_work_item",
          "definition": "CREATE INDEX idx_erm_work_item ON public.estimate_rate_matches USING btree (work_item_id)",
          "table_name": "estimate_rate_matches"
        },
        {
          "name": "estimate_resource_matches_pkey",
          "definition": "CREATE UNIQUE INDEX estimate_resource_matches_pkey ON public.estimate_resource_matches USING btree (id)",
          "table_name": "estimate_resource_matches"
        },
        {
          "name": "idx_eresm_estimate",
          "definition": "CREATE INDEX idx_eresm_estimate ON public.estimate_resource_matches USING btree (estimate_id)",
          "table_name": "estimate_resource_matches"
        },
        {
          "name": "idx_eresm_fact",
          "definition": "CREATE INDEX idx_eresm_fact ON public.estimate_resource_matches USING btree (material_fact_id)",
          "table_name": "estimate_resource_matches"
        },
        {
          "name": "estimate_review_queue_pkey",
          "definition": "CREATE UNIQUE INDEX estimate_review_queue_pkey ON public.estimate_review_queue USING btree (id)",
          "table_name": "estimate_review_queue"
        },
        {
          "name": "idx_erq_estimate",
          "definition": "CREATE INDEX idx_erq_estimate ON public.estimate_review_queue USING btree (estimate_id)",
          "table_name": "estimate_review_queue"
        },
        {
          "name": "idx_erq_unresolved",
          "definition": "CREATE INDEX idx_erq_unresolved ON public.estimate_review_queue USING btree (estimate_id, resolved) WHERE (NOT resolved)",
          "table_name": "estimate_review_queue"
        },
        {
          "name": "estimate_work_items_pkey",
          "definition": "CREATE UNIQUE INDEX estimate_work_items_pkey ON public.estimate_work_items USING btree (id)",
          "table_name": "estimate_work_items"
        },
        {
          "name": "idx_ewi_estimate",
          "definition": "CREATE INDEX idx_ewi_estimate ON public.estimate_work_items USING btree (estimate_id)",
          "table_name": "estimate_work_items"
        },
        {
          "name": "estimates_pkey",
          "definition": "CREATE UNIQUE INDEX estimates_pkey ON public.estimates USING btree (id)",
          "table_name": "estimates"
        },
        {
          "name": "idx_estimates_doc",
          "definition": "CREATE INDEX idx_estimates_doc ON public.estimates USING btree (doc_id)",
          "table_name": "estimates"
        },
        {
          "name": "idx_estimates_status",
          "definition": "CREATE INDEX idx_estimates_status ON public.estimates USING btree (status)",
          "table_name": "estimates"
        },
        {
          "name": "fsnb_collections_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_collections_code_key ON public.fsnb_collections USING btree (code)",
          "table_name": "fsnb_collections"
        },
        {
          "name": "fsnb_collections_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_collections_pkey ON public.fsnb_collections USING btree (id)",
          "table_name": "fsnb_collections"
        },
        {
          "name": "fsnb_norm_resources_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_norm_resources_pkey ON public.fsnb_norm_resources USING btree (id)",
          "table_name": "fsnb_norm_resources"
        },
        {
          "name": "idx_fsnb_norm_resources_code",
          "definition": "CREATE INDEX idx_fsnb_norm_resources_code ON public.fsnb_norm_resources USING btree (resource_code)",
          "table_name": "fsnb_norm_resources"
        },
        {
          "name": "idx_fsnb_norm_resources_norm",
          "definition": "CREATE INDEX idx_fsnb_norm_resources_norm ON public.fsnb_norm_resources USING btree (norm_id)",
          "table_name": "fsnb_norm_resources"
        },
        {
          "name": "idx_fsnb_norm_resources_resource",
          "definition": "CREATE INDEX idx_fsnb_norm_resources_resource ON public.fsnb_norm_resources USING btree (resource_id) WHERE (resource_id IS NOT NULL)",
          "table_name": "fsnb_norm_resources"
        },
        {
          "name": "fsnb_norm_tech_groups_norm_code_tg_id_key",
          "definition": "CREATE UNIQUE INDEX fsnb_norm_tech_groups_norm_code_tg_id_key ON public.fsnb_norm_tech_groups USING btree (norm_code, tg_id)",
          "table_name": "fsnb_norm_tech_groups"
        },
        {
          "name": "fsnb_norm_tech_groups_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_norm_tech_groups_pkey ON public.fsnb_norm_tech_groups USING btree (id)",
          "table_name": "fsnb_norm_tech_groups"
        },
        {
          "name": "idx_fsnb_ntg_norm",
          "definition": "CREATE INDEX idx_fsnb_ntg_norm ON public.fsnb_norm_tech_groups USING btree (norm_id) WHERE (norm_id IS NOT NULL)",
          "table_name": "fsnb_norm_tech_groups"
        },
        {
          "name": "idx_fsnb_ntg_norm_code",
          "definition": "CREATE INDEX idx_fsnb_ntg_norm_code ON public.fsnb_norm_tech_groups USING btree (norm_code)",
          "table_name": "fsnb_norm_tech_groups"
        },
        {
          "name": "idx_fsnb_ntg_tg",
          "definition": "CREATE INDEX idx_fsnb_ntg_tg ON public.fsnb_norm_tech_groups USING btree (tg_id)",
          "table_name": "fsnb_norm_tech_groups"
        },
        {
          "name": "fsnb_norms_norm_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_norms_norm_code_key ON public.fsnb_norms USING btree (norm_code)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "fsnb_norms_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_norms_pkey ON public.fsnb_norms USING btree (id)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_active",
          "definition": "CREATE INDEX idx_fsnb_norms_active ON public.fsnb_norms USING btree (id) WHERE is_active",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_base_type",
          "definition": "CREATE INDEX idx_fsnb_norms_base_type ON public.fsnb_norms USING btree (base_type)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_category",
          "definition": "CREATE INDEX idx_fsnb_norms_category ON public.fsnb_norms USING btree (work_category)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_col_div",
          "definition": "CREATE INDEX idx_fsnb_norms_col_div ON public.fsnb_norms USING btree (collection_id, division_code)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_col_div_tbl",
          "definition": "CREATE INDEX idx_fsnb_norms_col_div_tbl ON public.fsnb_norms USING btree (collection_id, division_code, table_code)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_collection",
          "definition": "CREATE INDEX idx_fsnb_norms_collection ON public.fsnb_norms USING btree (collection_id)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_embedding",
          "definition": "CREATE INDEX idx_fsnb_norms_embedding ON public.fsnb_norms USING hnsw (embedding vector_cosine_ops) WITH (m='8', ef_construction='16') WHERE (embedding IS NOT NULL)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_fts",
          "definition": "CREATE INDEX idx_fsnb_norms_fts ON public.fsnb_norms USING gin (to_tsvector('russian'::regconfig, search_text))",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_name_trgm",
          "definition": "CREATE INDEX idx_fsnb_norms_name_trgm ON public.fsnb_norms USING gin (name gin_trgm_ops)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_selected",
          "definition": "CREATE INDEX idx_fsnb_norms_selected ON public.fsnb_norms USING btree (id) WHERE is_selected",
          "table_name": "fsnb_norms"
        },
        {
          "name": "idx_fsnb_norms_table_code",
          "definition": "CREATE INDEX idx_fsnb_norms_table_code ON public.fsnb_norms USING btree (table_code)",
          "table_name": "fsnb_norms"
        },
        {
          "name": "fsnb_price_indices_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_price_indices_pkey ON public.fsnb_price_indices USING btree (id)",
          "table_name": "fsnb_price_indices"
        },
        {
          "name": "fsnb_price_indices_region_code_period_work_category_key",
          "definition": "CREATE UNIQUE INDEX fsnb_price_indices_region_code_period_work_category_key ON public.fsnb_price_indices USING btree (region_code, period, work_category)",
          "table_name": "fsnb_price_indices"
        },
        {
          "name": "fsnb_profile_collections_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_profile_collections_pkey ON public.fsnb_profile_collections USING btree (profile_id, collection_id, collection_code)",
          "table_name": "fsnb_profile_collections"
        },
        {
          "name": "fsnb_profiles_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_profiles_code_key ON public.fsnb_profiles USING btree (code)",
          "table_name": "fsnb_profiles"
        },
        {
          "name": "fsnb_profiles_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_profiles_pkey ON public.fsnb_profiles USING btree (id)",
          "table_name": "fsnb_profiles"
        },
        {
          "name": "fsnb_resources_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_resources_code_key ON public.fsnb_resources USING btree (code)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "fsnb_resources_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_resources_pkey ON public.fsnb_resources USING btree (id)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_active",
          "definition": "CREATE INDEX idx_fsnb_resources_active ON public.fsnb_resources USING btree (id) WHERE is_active",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_book",
          "definition": "CREATE INDEX idx_fsnb_resources_book ON public.fsnb_resources USING btree (book_code)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_collection",
          "definition": "CREATE INDEX idx_fsnb_resources_collection ON public.fsnb_resources USING btree (collection_id)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_embedding",
          "definition": "CREATE INDEX idx_fsnb_resources_embedding ON public.fsnb_resources USING hnsw (embedding vector_cosine_ops) WITH (m='8', ef_construction='16') WHERE (embedding IS NOT NULL)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_fts",
          "definition": "CREATE INDEX idx_fsnb_resources_fts ON public.fsnb_resources USING gin (to_tsvector('russian'::regconfig, search_text))",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_gost",
          "definition": "CREATE INDEX idx_fsnb_resources_gost ON public.fsnb_resources USING gin (gost_refs)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_name_trgm",
          "definition": "CREATE INDEX idx_fsnb_resources_name_trgm ON public.fsnb_resources USING gin (name gin_trgm_ops)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "idx_fsnb_resources_type",
          "definition": "CREATE INDEX idx_fsnb_resources_type ON public.fsnb_resources USING btree (resource_type)",
          "table_name": "fsnb_resources"
        },
        {
          "name": "fsnb_synonyms_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_synonyms_pkey ON public.fsnb_synonyms USING btree (id)",
          "table_name": "fsnb_synonyms"
        },
        {
          "name": "idx_fsnb_synonyms_term",
          "definition": "CREATE INDEX idx_fsnb_synonyms_term ON public.fsnb_synonyms USING btree (term)",
          "table_name": "fsnb_synonyms"
        },
        {
          "name": "fsnb_tech_groups_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_tech_groups_pkey ON public.fsnb_tech_groups USING btree (id)",
          "table_name": "fsnb_tech_groups"
        },
        {
          "name": "fsnb_tech_groups_tg_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_tech_groups_tg_code_key ON public.fsnb_tech_groups USING btree (tg_code)",
          "table_name": "fsnb_tech_groups"
        },
        {
          "name": "fsnb_tg_resources_pkey",
          "definition": "CREATE UNIQUE INDEX fsnb_tg_resources_pkey ON public.fsnb_tg_resources USING btree (id)",
          "table_name": "fsnb_tg_resources"
        },
        {
          "name": "fsnb_tg_resources_tg_id_resource_code_key",
          "definition": "CREATE UNIQUE INDEX fsnb_tg_resources_tg_id_resource_code_key ON public.fsnb_tg_resources USING btree (tg_id, resource_code)",
          "table_name": "fsnb_tg_resources"
        },
        {
          "name": "idx_fsnb_tg_resources_resource",
          "definition": "CREATE INDEX idx_fsnb_tg_resources_resource ON public.fsnb_tg_resources USING btree (resource_id) WHERE (resource_id IS NOT NULL)",
          "table_name": "fsnb_tg_resources"
        },
        {
          "name": "idx_fsnb_tg_resources_tg",
          "definition": "CREATE INDEX idx_fsnb_tg_resources_tg ON public.fsnb_tg_resources USING btree (tg_id)",
          "table_name": "fsnb_tg_resources"
        },
        {
          "name": "imported_rate_categories_name_key",
          "definition": "CREATE UNIQUE INDEX imported_rate_categories_name_key ON public.imported_rate_categories USING btree (name)",
          "table_name": "imported_rate_categories"
        },
        {
          "name": "imported_rate_categories_pkey",
          "definition": "CREATE UNIQUE INDEX imported_rate_categories_pkey ON public.imported_rate_categories USING btree (id)",
          "table_name": "imported_rate_categories"
        },
        {
          "name": "idx_imported_rate_types_category",
          "definition": "CREATE INDEX idx_imported_rate_types_category ON public.imported_rate_types USING btree (category_id)",
          "table_name": "imported_rate_types"
        },
        {
          "name": "imported_rate_types_category_id_name_key",
          "definition": "CREATE UNIQUE INDEX imported_rate_types_category_id_name_key ON public.imported_rate_types USING btree (category_id, name)",
          "table_name": "imported_rate_types"
        },
        {
          "name": "imported_rate_types_pkey",
          "definition": "CREATE UNIQUE INDEX imported_rate_types_pkey ON public.imported_rate_types USING btree (id)",
          "table_name": "imported_rate_types"
        },
        {
          "name": "idx_imported_rates_type",
          "definition": "CREATE INDEX idx_imported_rates_type ON public.imported_rates USING btree (type_id)",
          "table_name": "imported_rates"
        },
        {
          "name": "imported_rates_pkey",
          "definition": "CREATE UNIQUE INDEX imported_rates_pkey ON public.imported_rates USING btree (id)",
          "table_name": "imported_rates"
        },
        {
          "name": "imported_rates_type_id_work_name_key",
          "definition": "CREATE UNIQUE INDEX imported_rates_type_id_work_name_key ON public.imported_rates USING btree (type_id, work_name)",
          "table_name": "imported_rates"
        },
        {
          "name": "llm_prompts_key_key",
          "definition": "CREATE UNIQUE INDEX llm_prompts_key_key ON public.llm_prompts USING btree (key)",
          "table_name": "llm_prompts"
        },
        {
          "name": "llm_prompts_pkey",
          "definition": "CREATE UNIQUE INDEX llm_prompts_pkey ON public.llm_prompts USING btree (id)",
          "table_name": "llm_prompts"
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
          "name": "idx_material_facts_derived",
          "definition": "CREATE INDEX idx_material_facts_derived ON public.material_facts USING btree (derived_from_fact_id) WHERE (derived_from_fact_id IS NOT NULL)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_doc_id",
          "definition": "CREATE INDEX idx_material_facts_doc_id ON public.material_facts USING btree (doc_id)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_fact_type",
          "definition": "CREATE INDEX idx_material_facts_fact_type ON public.material_facts USING btree (fact_type)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_kind",
          "definition": "CREATE INDEX idx_material_facts_kind ON public.material_facts USING btree (kind)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_needs_review",
          "definition": "CREATE INDEX idx_material_facts_needs_review ON public.material_facts USING btree (needs_review) WHERE (needs_review = true)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_material_facts_quantity_type",
          "definition": "CREATE INDEX idx_material_facts_quantity_type ON public.material_facts USING btree (quantity_type) WHERE (quantity_type IS NOT NULL)",
          "table_name": "material_facts"
        },
        {
          "name": "material_facts_pkey",
          "definition": "CREATE UNIQUE INDEX material_facts_pkey ON public.material_facts USING btree (id)",
          "table_name": "material_facts"
        },
        {
          "name": "idx_product_facts_block_id",
          "definition": "CREATE INDEX idx_product_facts_block_id ON public.product_facts USING btree (block_id)",
          "table_name": "product_facts"
        },
        {
          "name": "idx_product_facts_doc_id",
          "definition": "CREATE INDEX idx_product_facts_doc_id ON public.product_facts USING btree (doc_id)",
          "table_name": "product_facts"
        },
        {
          "name": "idx_product_facts_kind",
          "definition": "CREATE INDEX idx_product_facts_kind ON public.product_facts USING btree (kind)",
          "table_name": "product_facts"
        },
        {
          "name": "idx_product_facts_needs_review",
          "definition": "CREATE INDEX idx_product_facts_needs_review ON public.product_facts USING btree (needs_review) WHERE (needs_review = true)",
          "table_name": "product_facts"
        },
        {
          "name": "product_facts_pkey",
          "definition": "CREATE UNIQUE INDEX product_facts_pkey ON public.product_facts USING btree (id)",
          "table_name": "product_facts"
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
          "name": "idx_skill_examples_agent",
          "definition": "CREATE INDEX idx_skill_examples_agent ON public.skill_examples USING btree (agent_type)",
          "table_name": "skill_examples"
        },
        {
          "name": "idx_skill_examples_group",
          "definition": "CREATE INDEX idx_skill_examples_group ON public.skill_examples USING btree (group_id)",
          "table_name": "skill_examples"
        },
        {
          "name": "skill_examples_pkey",
          "definition": "CREATE UNIQUE INDEX skill_examples_pkey ON public.skill_examples USING btree (id)",
          "table_name": "skill_examples"
        },
        {
          "name": "idx_skill_feedback_agent",
          "definition": "CREATE INDEX idx_skill_feedback_agent ON public.skill_feedback USING btree (agent_type)",
          "table_name": "skill_feedback"
        },
        {
          "name": "idx_skill_feedback_skill",
          "definition": "CREATE INDEX idx_skill_feedback_skill ON public.skill_feedback USING btree (skill_id) WHERE (skill_id IS NOT NULL)",
          "table_name": "skill_feedback"
        },
        {
          "name": "skill_feedback_pkey",
          "definition": "CREATE UNIQUE INDEX skill_feedback_pkey ON public.skill_feedback USING btree (id)",
          "table_name": "skill_feedback"
        },
        {
          "name": "idx_skills_agent_active",
          "definition": "CREATE INDEX idx_skills_agent_active ON public.skill_registry USING btree (agent_type, is_active) WHERE is_active",
          "table_name": "skill_registry"
        },
        {
          "name": "idx_skills_proposed",
          "definition": "CREATE INDEX idx_skills_proposed ON public.skill_registry USING btree (created_by) WHERE ((created_by = 'auto_proposed'::text) AND (approved_by IS NULL))",
          "table_name": "skill_registry"
        },
        {
          "name": "skill_registry_pkey",
          "definition": "CREATE UNIQUE INDEX skill_registry_pkey ON public.skill_registry USING btree (id)",
          "table_name": "skill_registry"
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
        },
        {
          "name": "idx_work_hints_doc_id",
          "definition": "CREATE INDEX idx_work_hints_doc_id ON public.work_hints USING btree (doc_id)",
          "table_name": "work_hints"
        },
        {
          "name": "work_hints_pkey",
          "definition": "CREATE UNIQUE INDEX work_hints_pkey ON public.work_hints USING btree (id)",
          "table_name": "work_hints"
        }
      ],
      "policies": [],
      "triggers": [],
      "functions": [
        {
          "name": "array_to_halfvec",
          "source": "array_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "real[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "array_to_halfvec",
          "source": "array_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "numeric[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "array_to_halfvec",
          "source": "array_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "integer[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "array_to_halfvec",
          "source": "array_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "array_to_sparsevec",
          "source": "array_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "numeric[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "array_to_sparsevec",
          "source": "array_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "array_to_sparsevec",
          "source": "array_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "real[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "array_to_sparsevec",
          "source": "array_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "integer[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "array_to_vector",
          "source": "array_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "array_to_vector",
          "source": "array_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "integer[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "array_to_vector",
          "source": "array_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "numeric[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "array_to_vector",
          "source": "array_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "real[], integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "avg",
          "source": "aggregate_dummy",
          "language": "internal",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "avg",
          "source": "aggregate_dummy",
          "language": "internal",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "binary_quantize",
          "source": "halfvec_binary_quantize",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "bit"
        },
        {
          "name": "binary_quantize",
          "source": "binary_quantize",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "bit"
        },
        {
          "name": "cosine_distance",
          "source": "cosine_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "cosine_distance",
          "source": "halfvec_cosine_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "cosine_distance",
          "source": "sparsevec_cosine_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "fsnb_collection_divisions",
          "source": "\r\n    SELECT DISTINCT ON (division_code)\r\n           division_code,\r\n           division_name\r\n    FROM   public.fsnb_norms\r\n    WHERE  collection_id = p_collection_id\r\n      AND  division_code IS NOT NULL\r\n      AND  (NOT p_only_selected OR is_selected = true)\r\n    ORDER  BY division_code;\r\n",
          "language": "sql",
          "security": "INVOKER",
          "arguments": "p_collection_id uuid, p_only_selected boolean DEFAULT false",
          "volatility": "STABLE",
          "return_type": "TABLE(division_code text, division_name text)"
        },
        {
          "name": "fsnb_division_tables",
          "source": "\r\n    SELECT DISTINCT ON (table_code)\r\n           table_code,\r\n           table_name\r\n    FROM   public.fsnb_norms\r\n    WHERE  collection_id = p_collection_id\r\n      AND  division_code = p_division_code\r\n      AND  table_code IS NOT NULL\r\n      AND  (NOT p_only_selected OR is_selected = true)\r\n    ORDER  BY table_code;\r\n",
          "language": "sql",
          "security": "INVOKER",
          "arguments": "p_collection_id uuid, p_division_code text, p_only_selected boolean DEFAULT false",
          "volatility": "STABLE",
          "return_type": "TABLE(table_code text, table_name text)"
        },
        {
          "name": "fsnb_soft_delete_division",
          "source": "\r\nDECLARE\r\n    v_count integer;\r\nBEGIN\r\n    UPDATE fsnb_norms\r\n    SET is_active = false\r\n    WHERE collection_id = p_collection_id\r\n      AND division_code = p_division_code\r\n      AND is_active = true;\r\n\r\n    GET DIAGNOSTICS v_count = ROW_COUNT;\r\n    RETURN v_count;\r\nEND;\r\n",
          "language": "plpgsql",
          "security": "INVOKER",
          "arguments": "p_collection_id uuid, p_division_code text",
          "volatility": "VOLATILE",
          "return_type": "integer"
        },
        {
          "name": "fsnb_soft_delete_norm",
          "source": "\r\nDECLARE\r\n    v_count integer;\r\nBEGIN\r\n    UPDATE fsnb_norms\r\n    SET is_active = false\r\n    WHERE id = p_norm_id\r\n      AND is_active = true;\r\n\r\n    GET DIAGNOSTICS v_count = ROW_COUNT;\r\n    RETURN v_count;\r\nEND;\r\n",
          "language": "plpgsql",
          "security": "INVOKER",
          "arguments": "p_norm_id uuid",
          "volatility": "VOLATILE",
          "return_type": "integer"
        },
        {
          "name": "fsnb_soft_delete_table",
          "source": "\r\nDECLARE\r\n    v_count integer;\r\nBEGIN\r\n    UPDATE fsnb_norms\r\n    SET is_active = false\r\n    WHERE collection_id = p_collection_id\r\n      AND division_code = p_division_code\r\n      AND table_code = p_table_code\r\n      AND is_active = true;\r\n\r\n    GET DIAGNOSTICS v_count = ROW_COUNT;\r\n    RETURN v_count;\r\nEND;\r\n",
          "language": "plpgsql",
          "security": "INVOKER",
          "arguments": "p_collection_id uuid, p_division_code text, p_table_code text",
          "volatility": "VOLATILE",
          "return_type": "integer"
        },
        {
          "name": "fsnb_table_norms",
          "source": "\r\n    SELECT id, norm_code, name\r\n    FROM   public.fsnb_norms\r\n    WHERE  collection_id = p_collection_id\r\n      AND  division_code = p_division_code\r\n      AND  table_code    = p_table_code\r\n      AND  (NOT p_only_selected OR is_selected = true)\r\n    ORDER  BY norm_code;\r\n",
          "language": "sql",
          "security": "INVOKER",
          "arguments": "p_collection_id uuid, p_division_code text, p_table_code text, p_only_selected boolean DEFAULT false",
          "volatility": "STABLE",
          "return_type": "TABLE(id uuid, norm_code text, name text)"
        },
        {
          "name": "gin_extract_query_trgm",
          "source": "gin_extract_query_trgm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, internal, smallint, internal, internal, internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gin_extract_value_trgm",
          "source": "gin_extract_value_trgm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gin_trgm_consistent",
          "source": "gin_trgm_consistent",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, smallint, text, integer, internal, internal, internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "gin_trgm_triconsistent",
          "source": "gin_trgm_triconsistent",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, smallint, text, integer, internal, internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "\"char\""
        },
        {
          "name": "gtrgm_compress",
          "source": "gtrgm_compress",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gtrgm_consistent",
          "source": "gtrgm_consistent",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, text, smallint, oid, internal",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "gtrgm_decompress",
          "source": "gtrgm_decompress",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gtrgm_distance",
          "source": "gtrgm_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, text, smallint, oid, internal",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "gtrgm_in",
          "source": "gtrgm_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring",
          "volatility": "IMMUTABLE",
          "return_type": "gtrgm"
        },
        {
          "name": "gtrgm_options",
          "source": "gtrgm_options",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "IMMUTABLE",
          "return_type": "void"
        },
        {
          "name": "gtrgm_out",
          "source": "gtrgm_out",
          "language": "c",
          "security": "INVOKER",
          "arguments": "gtrgm",
          "volatility": "IMMUTABLE",
          "return_type": "cstring"
        },
        {
          "name": "gtrgm_penalty",
          "source": "gtrgm_penalty",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gtrgm_picksplit",
          "source": "gtrgm_picksplit",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gtrgm_same",
          "source": "gtrgm_same",
          "language": "c",
          "security": "INVOKER",
          "arguments": "gtrgm, gtrgm, internal",
          "volatility": "IMMUTABLE",
          "return_type": "internal"
        },
        {
          "name": "gtrgm_union",
          "source": "gtrgm_union",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, internal",
          "volatility": "IMMUTABLE",
          "return_type": "gtrgm"
        },
        {
          "name": "halfvec",
          "source": "halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_accum",
          "source": "halfvec_accum",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision[]"
        },
        {
          "name": "halfvec_add",
          "source": "halfvec_add",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_avg",
          "source": "halfvec_avg",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[]",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_cmp",
          "source": "halfvec_cmp",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "halfvec_combine",
          "source": "vector_combine",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], double precision[]",
          "volatility": "IMMUTABLE",
          "return_type": "double precision[]"
        },
        {
          "name": "halfvec_concat",
          "source": "halfvec_concat",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_eq",
          "source": "halfvec_eq",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_ge",
          "source": "halfvec_ge",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_gt",
          "source": "halfvec_gt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_in",
          "source": "halfvec_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_l2_squared_distance",
          "source": "halfvec_l2_squared_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "halfvec_le",
          "source": "halfvec_le",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_lt",
          "source": "halfvec_lt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_mul",
          "source": "halfvec_mul",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_ne",
          "source": "halfvec_ne",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "halfvec_negative_inner_product",
          "source": "halfvec_negative_inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "halfvec_out",
          "source": "halfvec_out",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "cstring"
        },
        {
          "name": "halfvec_recv",
          "source": "halfvec_recv",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_send",
          "source": "halfvec_send",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "bytea"
        },
        {
          "name": "halfvec_spherical_distance",
          "source": "halfvec_spherical_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "halfvec_sub",
          "source": "halfvec_sub",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "halfvec_to_float4",
          "source": "halfvec_to_float4",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "real[]"
        },
        {
          "name": "halfvec_to_sparsevec",
          "source": "halfvec_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "halfvec_to_vector",
          "source": "halfvec_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "halfvec_typmod_in",
          "source": "halfvec_typmod_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring[]",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "hamming_distance",
          "source": "hamming_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "bit, bit",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "hnsw_bit_support",
          "source": "hnsw_bit_support",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "internal"
        },
        {
          "name": "hnsw_halfvec_support",
          "source": "hnsw_halfvec_support",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "internal"
        },
        {
          "name": "hnsw_sparsevec_support",
          "source": "hnsw_sparsevec_support",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "internal"
        },
        {
          "name": "hnswhandler",
          "source": "hnswhandler",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "index_am_handler"
        },
        {
          "name": "hybrid_search_norms",
          "source": "\r\n  WITH semantic AS (\r\n    SELECT n.id, n.norm_code, n.name, n.measure_unit, n.base_type, n.work_category,\r\n           ROW_NUMBER() OVER (ORDER BY n.embedding <=> query_embedding) AS rank\r\n    FROM fsnb_norms n\r\n    WHERE n.embedding IS NOT NULL\r\n      AND (base_type_filter IS NULL OR n.base_type = base_type_filter)\r\n      AND (category_filter IS NULL OR n.work_category = category_filter)\r\n    ORDER BY n.embedding <=> query_embedding\r\n    LIMIT 30\r\n  ),\r\n  keyword AS (\r\n    SELECT n.id, n.norm_code, n.name, n.measure_unit, n.base_type, n.work_category,\r\n           ROW_NUMBER() OVER (\r\n             ORDER BY ts_rank(\r\n               to_tsvector('russian', n.search_text),\r\n               plainto_tsquery('russian', query_text)\r\n             ) DESC\r\n           ) AS rank\r\n    FROM fsnb_norms n\r\n    WHERE n.search_text IS NOT NULL\r\n      AND to_tsvector('russian', n.search_text) @@ plainto_tsquery('russian', query_text)\r\n      AND (base_type_filter IS NULL OR n.base_type = base_type_filter)\r\n      AND (category_filter IS NULL OR n.work_category = category_filter)\r\n    LIMIT 15\r\n  ),\r\n  combined AS (\r\n    SELECT\r\n      COALESCE(s.id, k.id) AS id,\r\n      COALESCE(s.norm_code, k.norm_code) AS norm_code,\r\n      COALESCE(s.name, k.name) AS name,\r\n      COALESCE(s.measure_unit, k.measure_unit) AS measure_unit,\r\n      COALESCE(s.base_type, k.base_type) AS base_type,\r\n      COALESCE(s.work_category, k.work_category) AS work_category,\r\n      COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score\r\n    FROM semantic s\r\n    FULL OUTER JOIN keyword k ON s.id = k.id\r\n  )\r\n  SELECT c.id, c.norm_code, c.name, c.measure_unit, c.base_type, c.work_category, c.score\r\n  FROM combined c\r\n  ORDER BY c.score DESC\r\n  LIMIT match_limit;\r\n",
          "language": "sql",
          "security": "INVOKER",
          "arguments": "query_embedding vector, query_text text, base_type_filter text DEFAULT NULL::text, category_filter text DEFAULT NULL::text, match_limit integer DEFAULT 20",
          "volatility": "STABLE",
          "return_type": "TABLE(id uuid, norm_code text, name text, measure_unit text, base_type text, work_category text, score double precision)"
        },
        {
          "name": "hybrid_search_resources",
          "source": "\r\n  WITH semantic AS (\r\n    SELECT r.id, r.code, r.name, r.measure_unit, r.resource_type,\r\n           ROW_NUMBER() OVER (ORDER BY r.embedding <=> query_embedding) AS rank\r\n    FROM fsnb_resources r\r\n    WHERE r.embedding IS NOT NULL\r\n      AND (resource_type_filter IS NULL OR r.resource_type = resource_type_filter)\r\n    ORDER BY r.embedding <=> query_embedding\r\n    LIMIT 30\r\n  ),\r\n  keyword AS (\r\n    SELECT r.id, r.code, r.name, r.measure_unit, r.resource_type,\r\n           ROW_NUMBER() OVER (\r\n             ORDER BY ts_rank(\r\n               to_tsvector('russian', r.search_text),\r\n               plainto_tsquery('russian', query_text)\r\n             ) DESC\r\n           ) AS rank\r\n    FROM fsnb_resources r\r\n    WHERE r.search_text IS NOT NULL\r\n      AND to_tsvector('russian', r.search_text) @@ plainto_tsquery('russian', query_text)\r\n      AND (resource_type_filter IS NULL OR r.resource_type = resource_type_filter)\r\n    LIMIT 15\r\n  ),\r\n  combined AS (\r\n    SELECT\r\n      COALESCE(s.id, k.id) AS id,\r\n      COALESCE(s.code, k.code) AS code,\r\n      COALESCE(s.name, k.name) AS name,\r\n      COALESCE(s.measure_unit, k.measure_unit) AS measure_unit,\r\n      COALESCE(s.resource_type, k.resource_type) AS resource_type,\r\n      COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score\r\n    FROM semantic s\r\n    FULL OUTER JOIN keyword k ON s.id = k.id\r\n  )\r\n  SELECT c.id, c.code, c.name, c.measure_unit, c.resource_type, c.score\r\n  FROM combined c\r\n  ORDER BY c.score DESC\r\n  LIMIT match_limit;\r\n",
          "language": "sql",
          "security": "INVOKER",
          "arguments": "query_embedding vector, query_text text, resource_type_filter text DEFAULT NULL::text, match_limit integer DEFAULT 20",
          "volatility": "STABLE",
          "return_type": "TABLE(id uuid, code text, name text, measure_unit text, resource_type text, score double precision)"
        },
        {
          "name": "inner_product",
          "source": "halfvec_inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "inner_product",
          "source": "sparsevec_inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "inner_product",
          "source": "inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "ivfflat_bit_support",
          "source": "ivfflat_bit_support",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "internal"
        },
        {
          "name": "ivfflat_halfvec_support",
          "source": "ivfflat_halfvec_support",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "internal"
        },
        {
          "name": "ivfflathandler",
          "source": "ivfflathandler",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal",
          "volatility": "VOLATILE",
          "return_type": "index_am_handler"
        },
        {
          "name": "jaccard_distance",
          "source": "jaccard_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "bit, bit",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l1_distance",
          "source": "l1_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l1_distance",
          "source": "sparsevec_l1_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l1_distance",
          "source": "halfvec_l1_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_distance",
          "source": "sparsevec_l2_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_distance",
          "source": "halfvec_l2_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_distance",
          "source": "l2_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_norm",
          "source": "sparsevec_l2_norm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_norm",
          "source": "halfvec_l2_norm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "l2_normalize",
          "source": "l2_normalize",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "l2_normalize",
          "source": "halfvec_l2_normalize",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "l2_normalize",
          "source": "sparsevec_l2_normalize",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "pgrst_reload_schema",
          "source": "\r\nBEGIN\r\n    NOTIFY pgrst, 'reload schema';\r\nEND;\r\n",
          "language": "plpgsql",
          "security": "DEFINER",
          "arguments": "",
          "volatility": "VOLATILE",
          "return_type": "void"
        },
        {
          "name": "set_limit",
          "source": "set_limit",
          "language": "c",
          "security": "INVOKER",
          "arguments": "real",
          "volatility": "VOLATILE",
          "return_type": "real"
        },
        {
          "name": "show_limit",
          "source": "show_limit",
          "language": "c",
          "security": "INVOKER",
          "arguments": "",
          "volatility": "STABLE",
          "return_type": "real"
        },
        {
          "name": "show_trgm",
          "source": "show_trgm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text",
          "volatility": "IMMUTABLE",
          "return_type": "text[]"
        },
        {
          "name": "similarity",
          "source": "similarity",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "similarity_dist",
          "source": "similarity_dist",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "similarity_op",
          "source": "similarity_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "STABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec",
          "source": "sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "sparsevec_cmp",
          "source": "sparsevec_cmp",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "sparsevec_eq",
          "source": "sparsevec_eq",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_ge",
          "source": "sparsevec_ge",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_gt",
          "source": "sparsevec_gt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_in",
          "source": "sparsevec_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "sparsevec_l2_squared_distance",
          "source": "sparsevec_l2_squared_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "sparsevec_le",
          "source": "sparsevec_le",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_lt",
          "source": "sparsevec_lt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_ne",
          "source": "sparsevec_ne",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "sparsevec_negative_inner_product",
          "source": "sparsevec_negative_inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "sparsevec_out",
          "source": "sparsevec_out",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "cstring"
        },
        {
          "name": "sparsevec_recv",
          "source": "sparsevec_recv",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "sparsevec_send",
          "source": "sparsevec_send",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec",
          "volatility": "IMMUTABLE",
          "return_type": "bytea"
        },
        {
          "name": "sparsevec_to_halfvec",
          "source": "sparsevec_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "sparsevec_to_vector",
          "source": "sparsevec_to_vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "sparsevec, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "sparsevec_typmod_in",
          "source": "sparsevec_typmod_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring[]",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "strict_word_similarity",
          "source": "strict_word_similarity",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "strict_word_similarity_commutator_op",
          "source": "strict_word_similarity_commutator_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "STABLE",
          "return_type": "boolean"
        },
        {
          "name": "strict_word_similarity_dist_commutator_op",
          "source": "strict_word_similarity_dist_commutator_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "strict_word_similarity_dist_op",
          "source": "strict_word_similarity_dist_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "strict_word_similarity_op",
          "source": "strict_word_similarity_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "STABLE",
          "return_type": "boolean"
        },
        {
          "name": "subvector",
          "source": "halfvec_subvector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec, integer, integer",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "subvector",
          "source": "subvector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, integer, integer",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "sum",
          "source": "aggregate_dummy",
          "language": "internal",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "sum",
          "source": "aggregate_dummy",
          "language": "internal",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector",
          "source": "vector",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_accum",
          "source": "vector_accum",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision[]"
        },
        {
          "name": "vector_add",
          "source": "vector_add",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_avg",
          "source": "vector_avg",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[]",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_cmp",
          "source": "vector_cmp",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "vector_combine",
          "source": "vector_combine",
          "language": "c",
          "security": "INVOKER",
          "arguments": "double precision[], double precision[]",
          "volatility": "IMMUTABLE",
          "return_type": "double precision[]"
        },
        {
          "name": "vector_concat",
          "source": "vector_concat",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_dims",
          "source": "halfvec_vector_dims",
          "language": "c",
          "security": "INVOKER",
          "arguments": "halfvec",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "vector_dims",
          "source": "vector_dims",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "vector_eq",
          "source": "vector_eq",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_ge",
          "source": "vector_ge",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_gt",
          "source": "vector_gt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_in",
          "source": "vector_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_l2_squared_distance",
          "source": "vector_l2_squared_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "vector_le",
          "source": "vector_le",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_lt",
          "source": "vector_lt",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_mul",
          "source": "vector_mul",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_ne",
          "source": "vector_ne",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "boolean"
        },
        {
          "name": "vector_negative_inner_product",
          "source": "vector_negative_inner_product",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "vector_norm",
          "source": "vector_norm",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "vector_out",
          "source": "vector_out",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "cstring"
        },
        {
          "name": "vector_recv",
          "source": "vector_recv",
          "language": "c",
          "security": "INVOKER",
          "arguments": "internal, oid, integer",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_send",
          "source": "vector_send",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector",
          "volatility": "IMMUTABLE",
          "return_type": "bytea"
        },
        {
          "name": "vector_spherical_distance",
          "source": "vector_spherical_distance",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "double precision"
        },
        {
          "name": "vector_sub",
          "source": "vector_sub",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, vector",
          "volatility": "IMMUTABLE",
          "return_type": "vector"
        },
        {
          "name": "vector_to_float4",
          "source": "vector_to_float4",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "real[]"
        },
        {
          "name": "vector_to_halfvec",
          "source": "vector_to_halfvec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "halfvec"
        },
        {
          "name": "vector_to_sparsevec",
          "source": "vector_to_sparsevec",
          "language": "c",
          "security": "INVOKER",
          "arguments": "vector, integer, boolean",
          "volatility": "IMMUTABLE",
          "return_type": "sparsevec"
        },
        {
          "name": "vector_typmod_in",
          "source": "vector_typmod_in",
          "language": "c",
          "security": "INVOKER",
          "arguments": "cstring[]",
          "volatility": "IMMUTABLE",
          "return_type": "integer"
        },
        {
          "name": "word_similarity",
          "source": "word_similarity",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "word_similarity_commutator_op",
          "source": "word_similarity_commutator_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "STABLE",
          "return_type": "boolean"
        },
        {
          "name": "word_similarity_dist_commutator_op",
          "source": "word_similarity_dist_commutator_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "word_similarity_dist_op",
          "source": "word_similarity_dist_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "IMMUTABLE",
          "return_type": "real"
        },
        {
          "name": "word_similarity_op",
          "source": "word_similarity_op",
          "language": "c",
          "security": "INVOKER",
          "arguments": "text, text",
          "volatility": "STABLE",
          "return_type": "boolean"
        }
      ],
      "sequences": [],
      "foreign_keys": [
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "dependency_flags",
          "constraint_name": "dependency_flags_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "block_id"
          ],
          "table_name": "dependency_flags",
          "constraint_name": "dependency_flags_block_id_fkey",
          "references_table": "doc_blocks",
          "references_columns": [
            "id"
          ]
        },
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
          "table_name": "doc_glossary",
          "constraint_name": "doc_glossary_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "source_block_id"
          ],
          "table_name": "doc_glossary",
          "constraint_name": "doc_glossary_source_block_id_fkey",
          "references_table": "doc_blocks",
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
            "rate_match_id"
          ],
          "table_name": "estimate_lines",
          "constraint_name": "estimate_lines_rate_match_id_fkey",
          "references_table": "estimate_rate_matches",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "estimate_lines",
          "constraint_name": "estimate_lines_estimate_id_fkey",
          "references_table": "estimates",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "work_item_id"
          ],
          "table_name": "estimate_lines",
          "constraint_name": "estimate_lines_work_item_id_fkey",
          "references_table": "estimate_work_items",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "fsnb_norm_id"
          ],
          "table_name": "estimate_rate_matches",
          "constraint_name": "estimate_rate_matches_fsnb_norm_id_fkey",
          "references_table": "fsnb_norms",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "estimate_rate_matches",
          "constraint_name": "estimate_rate_matches_estimate_id_fkey",
          "references_table": "estimates",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "work_item_id"
          ],
          "table_name": "estimate_rate_matches",
          "constraint_name": "estimate_rate_matches_work_item_id_fkey",
          "references_table": "estimate_work_items",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "tg_id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_tg_id_fkey",
          "references_table": "fsnb_tech_groups",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "fsnb_resource_id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_fsnb_resource_id_fkey",
          "references_table": "fsnb_resources",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "rate_match_id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_rate_match_id_fkey",
          "references_table": "estimate_rate_matches",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "material_fact_id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_material_fact_id_fkey",
          "references_table": "material_facts",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_estimate_id_fkey",
          "references_table": "estimates",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "related_rate_match_id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_related_rate_match_id_fkey",
          "references_table": "estimate_rate_matches",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_estimate_id_fkey",
          "references_table": "estimates",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "related_resource_match_id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_related_resource_match_id_fkey",
          "references_table": "estimate_resource_matches",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "related_work_item_id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_related_work_item_id_fkey",
          "references_table": "estimate_work_items",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "related_material_fact_id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_related_material_fact_id_fkey",
          "references_table": "material_facts",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "estimate_work_items",
          "constraint_name": "estimate_work_items_estimate_id_fkey",
          "references_table": "estimates",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "estimates",
          "constraint_name": "estimates_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "project_id"
          ],
          "table_name": "estimates",
          "constraint_name": "estimates_project_id_fkey",
          "references_table": "projects",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "resource_id"
          ],
          "table_name": "fsnb_norm_resources",
          "constraint_name": "fsnb_norm_resources_resource_id_fkey",
          "references_table": "fsnb_resources",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "norm_id"
          ],
          "table_name": "fsnb_norm_resources",
          "constraint_name": "fsnb_norm_resources_norm_id_fkey",
          "references_table": "fsnb_norms",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "tg_id"
          ],
          "table_name": "fsnb_norm_tech_groups",
          "constraint_name": "fsnb_norm_tech_groups_tg_id_fkey",
          "references_table": "fsnb_tech_groups",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "norm_id"
          ],
          "table_name": "fsnb_norm_tech_groups",
          "constraint_name": "fsnb_norm_tech_groups_norm_id_fkey",
          "references_table": "fsnb_norms",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "collection_id"
          ],
          "table_name": "fsnb_norms",
          "constraint_name": "fsnb_norms_collection_id_fkey",
          "references_table": "fsnb_collections",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "profile_id"
          ],
          "table_name": "fsnb_profile_collections",
          "constraint_name": "fsnb_profile_collections_profile_id_fkey",
          "references_table": "fsnb_profiles",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "collection_id"
          ],
          "table_name": "fsnb_profile_collections",
          "constraint_name": "fsnb_profile_collections_collection_id_fkey",
          "references_table": "fsnb_collections",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "collection_id"
          ],
          "table_name": "fsnb_resources",
          "constraint_name": "fsnb_resources_collection_id_fkey",
          "references_table": "fsnb_collections",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "tg_id"
          ],
          "table_name": "fsnb_tg_resources",
          "constraint_name": "fsnb_tg_resources_tg_id_fkey",
          "references_table": "fsnb_tech_groups",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "resource_id"
          ],
          "table_name": "fsnb_tg_resources",
          "constraint_name": "fsnb_tg_resources_resource_id_fkey",
          "references_table": "fsnb_resources",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "category_id"
          ],
          "table_name": "imported_rate_types",
          "constraint_name": "imported_rate_types_category_id_fkey",
          "references_table": "imported_rate_categories",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "type_id"
          ],
          "table_name": "imported_rates",
          "constraint_name": "imported_rates_type_id_fkey",
          "references_table": "imported_rate_types",
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
            "derived_from_fact_id"
          ],
          "table_name": "material_facts",
          "constraint_name": "material_facts_derived_from_fact_id_fkey",
          "references_table": "material_facts",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "product_facts",
          "constraint_name": "product_facts_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "block_id"
          ],
          "table_name": "product_facts",
          "constraint_name": "product_facts_block_id_fkey",
          "references_table": "doc_blocks",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "doc_id"
          ],
          "table_name": "skill_examples",
          "constraint_name": "skill_examples_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "skill_id"
          ],
          "table_name": "skill_feedback",
          "constraint_name": "skill_feedback_skill_id_fkey",
          "references_table": "skill_registry",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "estimate_id"
          ],
          "table_name": "skill_feedback",
          "constraint_name": "skill_feedback_estimate_id_fkey",
          "references_table": "estimates",
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
            "doc_id"
          ],
          "table_name": "work_hints",
          "constraint_name": "work_hints_doc_id_fkey",
          "references_table": "documents",
          "references_columns": [
            "id"
          ]
        },
        {
          "columns": [
            "block_id"
          ],
          "table_name": "work_hints",
          "constraint_name": "work_hints_block_id_fkey",
          "references_table": "doc_blocks",
          "references_columns": [
            "id"
          ]
        }
      ],
      "generated_at": "2026-04-08T09:41:41.503506+00:00",
      "primary_keys": [
        {
          "columns": [
            "resource_id"
          ],
          "table_name": "_stg_resources_keep",
          "constraint_name": "_stg_resources_keep_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "_stg_resources_to_deactivate",
          "constraint_name": "_stg_resources_to_deactivate_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "dependency_flags",
          "constraint_name": "dependency_flags_pkey"
        },
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
          "table_name": "doc_glossary",
          "constraint_name": "doc_glossary_pkey"
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
          "table_name": "estimate_lines",
          "constraint_name": "estimate_lines_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "estimate_rate_matches",
          "constraint_name": "estimate_rate_matches_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "estimate_resource_matches",
          "constraint_name": "estimate_resource_matches_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "estimate_review_queue",
          "constraint_name": "estimate_review_queue_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "estimate_work_items",
          "constraint_name": "estimate_work_items_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "estimates",
          "constraint_name": "estimates_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_collections",
          "constraint_name": "fsnb_collections_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_norm_resources",
          "constraint_name": "fsnb_norm_resources_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_norm_tech_groups",
          "constraint_name": "fsnb_norm_tech_groups_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_norms",
          "constraint_name": "fsnb_norms_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_price_indices",
          "constraint_name": "fsnb_price_indices_pkey"
        },
        {
          "columns": [
            "profile_id",
            "collection_id",
            "collection_code"
          ],
          "table_name": "fsnb_profile_collections",
          "constraint_name": "fsnb_profile_collections_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_profiles",
          "constraint_name": "fsnb_profiles_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_resources",
          "constraint_name": "fsnb_resources_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_synonyms",
          "constraint_name": "fsnb_synonyms_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_tech_groups",
          "constraint_name": "fsnb_tech_groups_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "fsnb_tg_resources",
          "constraint_name": "fsnb_tg_resources_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "imported_rate_categories",
          "constraint_name": "imported_rate_categories_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "imported_rate_types",
          "constraint_name": "imported_rate_types_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "imported_rates",
          "constraint_name": "imported_rates_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "llm_prompts",
          "constraint_name": "llm_prompts_pkey"
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
          "table_name": "product_facts",
          "constraint_name": "product_facts_pkey"
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
          "table_name": "skill_examples",
          "constraint_name": "skill_examples_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "skill_feedback",
          "constraint_name": "skill_feedback_pkey"
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "skill_registry",
          "constraint_name": "skill_registry_pkey"
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
        },
        {
          "columns": [
            "id"
          ],
          "table_name": "work_hints",
          "constraint_name": "work_hints_pkey"
        }
      ],
      "check_constraints": [
        {
          "table_name": "_stg_resources_keep",
          "check_clause": "resource_id IS NOT NULL",
          "constraint_name": "2200_147347_1_not_null"
        },
        {
          "table_name": "_stg_resources_to_deactivate",
          "check_clause": "processed IS NOT NULL",
          "constraint_name": "2200_147352_2_not_null"
        },
        {
          "table_name": "_stg_resources_to_deactivate",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_147352_1_not_null"
        },
        {
          "table_name": "dependency_flags",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33568_1_not_null"
        },
        {
          "table_name": "dependency_flags",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33568_9_not_null"
        },
        {
          "table_name": "dependency_flags",
          "check_clause": "resolved IS NOT NULL",
          "constraint_name": "2200_33568_8_not_null"
        },
        {
          "table_name": "dependency_flags",
          "check_clause": "referenced_doc_code IS NOT NULL",
          "constraint_name": "2200_33568_4_not_null"
        },
        {
          "table_name": "dependency_flags",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_33568_2_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_17524_11_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "(block_type = ANY (ARRAY['TEXT'::text, 'IMAGE'::text]))",
          "constraint_name": "doc_blocks_block_type_check"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "block_uid IS NOT NULL",
          "constraint_name": "2200_17524_4_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "page_id IS NOT NULL",
          "constraint_name": "2200_17524_3_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17524_2_not_null"
        },
        {
          "table_name": "doc_blocks",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17524_1_not_null"
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
          "table_name": "doc_glossary",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_22245_1_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_22245_2_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_22245_3_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "item_type IS NOT NULL",
          "constraint_name": "2200_22245_4_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "confidence IS NOT NULL",
          "constraint_name": "2200_22245_7_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_22245_8_not_null"
        },
        {
          "table_name": "doc_glossary",
          "check_clause": "(item_type = ANY (ARRAY['material'::text, 'assembly'::text, 'construction'::text, 'location'::text, 'color'::text]))",
          "constraint_name": "doc_glossary_item_type_check"
        },
        {
          "table_name": "doc_pages",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17508_2_not_null"
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
          "table_name": "estimate_lines",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34193_19_not_null"
        },
        {
          "table_name": "estimate_lines",
          "check_clause": "description IS NOT NULL",
          "constraint_name": "2200_34193_8_not_null"
        },
        {
          "table_name": "estimate_lines",
          "check_clause": "sort_order IS NOT NULL",
          "constraint_name": "2200_34193_3_not_null"
        },
        {
          "table_name": "estimate_lines",
          "check_clause": "estimate_id IS NOT NULL",
          "constraint_name": "2200_34193_2_not_null"
        },
        {
          "table_name": "estimate_lines",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34193_1_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34123_1_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "user_verified IS NOT NULL",
          "constraint_name": "2200_34123_12_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "needs_review IS NOT NULL",
          "constraint_name": "2200_34123_11_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "match_confidence IS NOT NULL",
          "constraint_name": "2200_34123_8_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "work_item_id IS NOT NULL",
          "constraint_name": "2200_34123_3_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "estimate_id IS NOT NULL",
          "constraint_name": "2200_34123_2_not_null"
        },
        {
          "table_name": "estimate_rate_matches",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34123_15_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34153_1_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "user_verified IS NOT NULL",
          "constraint_name": "2200_34153_15_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "material_fact_id IS NOT NULL",
          "constraint_name": "2200_34153_3_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "match_confidence IS NOT NULL",
          "constraint_name": "2200_34153_10_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "needs_review IS NOT NULL",
          "constraint_name": "2200_34153_14_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "estimate_id IS NOT NULL",
          "constraint_name": "2200_34153_2_not_null"
        },
        {
          "table_name": "estimate_resource_matches",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34153_18_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34219_1_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "resolved IS NOT NULL",
          "constraint_name": "2200_34219_11_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34219_14_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "estimate_id IS NOT NULL",
          "constraint_name": "2200_34219_2_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "severity IS NOT NULL",
          "constraint_name": "2200_34219_3_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "issue_type IS NOT NULL",
          "constraint_name": "2200_34219_4_not_null"
        },
        {
          "table_name": "estimate_review_queue",
          "check_clause": "description IS NOT NULL",
          "constraint_name": "2200_34219_5_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "work_description IS NOT NULL",
          "constraint_name": "2200_34106_3_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "confidence IS NOT NULL",
          "constraint_name": "2200_34106_8_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34106_12_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "needs_review IS NOT NULL",
          "constraint_name": "2200_34106_9_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34106_1_not_null"
        },
        {
          "table_name": "estimate_work_items",
          "check_clause": "estimate_id IS NOT NULL",
          "constraint_name": "2200_34106_2_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34078_1_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "total_tokens IS NOT NULL",
          "constraint_name": "2200_34078_17_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34078_19_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_34078_20_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "completion_tokens IS NOT NULL",
          "constraint_name": "2200_34078_16_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "prompt_tokens IS NOT NULL",
          "constraint_name": "2200_34078_15_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "iteration_count IS NOT NULL",
          "constraint_name": "2200_34078_13_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "status IS NOT NULL",
          "constraint_name": "2200_34078_5_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_34078_4_not_null"
        },
        {
          "table_name": "estimates",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_34078_2_not_null"
        },
        {
          "table_name": "fsnb_collections",
          "check_clause": "base_type IS NOT NULL",
          "constraint_name": "2200_33918_4_not_null"
        },
        {
          "table_name": "fsnb_collections",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_33918_3_not_null"
        },
        {
          "table_name": "fsnb_collections",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_33918_2_not_null"
        },
        {
          "table_name": "fsnb_collections",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33918_1_not_null"
        },
        {
          "table_name": "fsnb_collections",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33918_9_not_null"
        },
        {
          "table_name": "fsnb_norm_resources",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33976_1_not_null"
        },
        {
          "table_name": "fsnb_norm_resources",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33976_9_not_null"
        },
        {
          "table_name": "fsnb_norm_resources",
          "check_clause": "resource_code IS NOT NULL",
          "constraint_name": "2200_33976_4_not_null"
        },
        {
          "table_name": "fsnb_norm_resources",
          "check_clause": "norm_id IS NOT NULL",
          "constraint_name": "2200_33976_2_not_null"
        },
        {
          "table_name": "fsnb_norm_tech_groups",
          "check_clause": "norm_base_type IS NOT NULL",
          "constraint_name": "2200_34032_4_not_null"
        },
        {
          "table_name": "fsnb_norm_tech_groups",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34032_1_not_null"
        },
        {
          "table_name": "fsnb_norm_tech_groups",
          "check_clause": "norm_code IS NOT NULL",
          "constraint_name": "2200_34032_3_not_null"
        },
        {
          "table_name": "fsnb_norm_tech_groups",
          "check_clause": "tg_id IS NOT NULL",
          "constraint_name": "2200_34032_5_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "is_selected IS NOT NULL",
          "constraint_name": "2200_33953_22_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33953_1_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "norm_code IS NOT NULL",
          "constraint_name": "2200_33953_3_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "base_type IS NOT NULL",
          "constraint_name": "2200_33953_4_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_33953_5_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "measure_unit IS NOT NULL",
          "constraint_name": "2200_33953_8_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33953_19_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_33953_20_not_null"
        },
        {
          "table_name": "fsnb_norms",
          "check_clause": "is_active IS NOT NULL",
          "constraint_name": "2200_33953_21_not_null"
        },
        {
          "table_name": "fsnb_price_indices",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34055_11_not_null"
        },
        {
          "table_name": "fsnb_price_indices",
          "check_clause": "period IS NOT NULL",
          "constraint_name": "2200_34055_4_not_null"
        },
        {
          "table_name": "fsnb_price_indices",
          "check_clause": "region_code IS NOT NULL",
          "constraint_name": "2200_34055_2_not_null"
        },
        {
          "table_name": "fsnb_price_indices",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34055_1_not_null"
        },
        {
          "table_name": "fsnb_profile_collections",
          "check_clause": "(mode = ANY (ARRAY['full'::text, 'partial'::text, 'exclude'::text]))",
          "constraint_name": "fsnb_profile_collections_mode_check"
        },
        {
          "table_name": "fsnb_profile_collections",
          "check_clause": "mode IS NOT NULL",
          "constraint_name": "2200_147163_4_not_null"
        },
        {
          "table_name": "fsnb_profile_collections",
          "check_clause": "collection_code IS NOT NULL",
          "constraint_name": "2200_147163_3_not_null"
        },
        {
          "table_name": "fsnb_profile_collections",
          "check_clause": "collection_id IS NOT NULL",
          "constraint_name": "2200_147163_2_not_null"
        },
        {
          "table_name": "fsnb_profile_collections",
          "check_clause": "profile_id IS NOT NULL",
          "constraint_name": "2200_147163_1_not_null"
        },
        {
          "table_name": "fsnb_profiles",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_147152_5_not_null"
        },
        {
          "table_name": "fsnb_profiles",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_147152_3_not_null"
        },
        {
          "table_name": "fsnb_profiles",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_147152_2_not_null"
        },
        {
          "table_name": "fsnb_profiles",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_147152_1_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "resource_type IS NOT NULL",
          "constraint_name": "2200_33930_6_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33930_25_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_33930_26_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "is_active IS NOT NULL",
          "constraint_name": "2200_33930_27_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33930_1_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_33930_3_not_null"
        },
        {
          "table_name": "fsnb_resources",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_33930_4_not_null"
        },
        {
          "table_name": "fsnb_synonyms",
          "check_clause": "term IS NOT NULL",
          "constraint_name": "2200_34066_2_not_null"
        },
        {
          "table_name": "fsnb_synonyms",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34066_5_not_null"
        },
        {
          "table_name": "fsnb_synonyms",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34066_1_not_null"
        },
        {
          "table_name": "fsnb_synonyms",
          "check_clause": "canonical_term IS NOT NULL",
          "constraint_name": "2200_34066_3_not_null"
        },
        {
          "table_name": "fsnb_tech_groups",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33998_1_not_null"
        },
        {
          "table_name": "fsnb_tech_groups",
          "check_clause": "tg_code IS NOT NULL",
          "constraint_name": "2200_33998_2_not_null"
        },
        {
          "table_name": "fsnb_tech_groups",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33998_5_not_null"
        },
        {
          "table_name": "fsnb_tg_resources",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34010_1_not_null"
        },
        {
          "table_name": "fsnb_tg_resources",
          "check_clause": "resource_code IS NOT NULL",
          "constraint_name": "2200_34010_4_not_null"
        },
        {
          "table_name": "fsnb_tg_resources",
          "check_clause": "tg_id IS NOT NULL",
          "constraint_name": "2200_34010_2_not_null"
        },
        {
          "table_name": "imported_rate_categories",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_175048_1_not_null"
        },
        {
          "table_name": "imported_rate_categories",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_175048_2_not_null"
        },
        {
          "table_name": "imported_rate_categories",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_175048_3_not_null"
        },
        {
          "table_name": "imported_rate_types",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_175059_3_not_null"
        },
        {
          "table_name": "imported_rate_types",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_175059_1_not_null"
        },
        {
          "table_name": "imported_rate_types",
          "check_clause": "category_id IS NOT NULL",
          "constraint_name": "2200_175059_2_not_null"
        },
        {
          "table_name": "imported_rate_types",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_175059_4_not_null"
        },
        {
          "table_name": "imported_rates",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_175076_1_not_null"
        },
        {
          "table_name": "imported_rates",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_175076_5_not_null"
        },
        {
          "table_name": "imported_rates",
          "check_clause": "work_name IS NOT NULL",
          "constraint_name": "2200_175076_3_not_null"
        },
        {
          "table_name": "imported_rates",
          "check_clause": "type_id IS NOT NULL",
          "constraint_name": "2200_175076_2_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_21117_3_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "is_active IS NOT NULL",
          "constraint_name": "2200_21117_7_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_21117_9_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_21117_8_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_21117_1_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "key IS NOT NULL",
          "constraint_name": "2200_21117_2_not_null"
        },
        {
          "table_name": "llm_prompts",
          "check_clause": "system_prompt IS NOT NULL",
          "constraint_name": "2200_21117_5_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_17548_1_not_null"
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
          "table_name": "material_facts",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_17548_18_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "kind IS NOT NULL",
          "constraint_name": "2200_17548_23_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "needs_review IS NOT NULL",
          "constraint_name": "2200_17548_25_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "fact_type IS NOT NULL",
          "constraint_name": "2200_17548_29_not_null"
        },
        {
          "table_name": "material_facts",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_17548_2_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "assembly_mark IS NOT NULL",
          "constraint_name": "2200_22269_4_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "source_section IS NOT NULL",
          "constraint_name": "2200_22269_9_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_22269_16_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_22269_15_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "needs_review IS NOT NULL",
          "constraint_name": "2200_22269_19_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "kind IS NOT NULL",
          "constraint_name": "2200_22269_17_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "user_verified IS NOT NULL",
          "constraint_name": "2200_22269_14_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "confidence IS NOT NULL",
          "constraint_name": "2200_22269_13_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_22269_1_not_null"
        },
        {
          "table_name": "product_facts",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_22269_2_not_null"
        },
        {
          "table_name": "projects",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20979_5_not_null"
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
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20979_2_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "code IS NOT NULL",
          "constraint_name": "2200_20989_2_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20989_1_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20989_5_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "sort_order IS NOT NULL",
          "constraint_name": "2200_20989_4_not_null"
        },
        {
          "table_name": "sections",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20989_3_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "agent_type IS NOT NULL",
          "constraint_name": "2200_34274_3_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "output_result IS NOT NULL",
          "constraint_name": "2200_34274_7_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "quality_score IS NOT NULL",
          "constraint_name": "2200_34274_10_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34274_11_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "group_id IS NOT NULL",
          "constraint_name": "2200_34274_2_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34274_1_not_null"
        },
        {
          "table_name": "skill_examples",
          "check_clause": "input_text IS NOT NULL",
          "constraint_name": "2200_34274_4_not_null"
        },
        {
          "table_name": "skill_feedback",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34292_9_not_null"
        },
        {
          "table_name": "skill_feedback",
          "check_clause": "action IS NOT NULL",
          "constraint_name": "2200_34292_5_not_null"
        },
        {
          "table_name": "skill_feedback",
          "check_clause": "agent_type IS NOT NULL",
          "constraint_name": "2200_34292_4_not_null"
        },
        {
          "table_name": "skill_feedback",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34292_1_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "is_active IS NOT NULL",
          "constraint_name": "2200_34256_7_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "total_uses IS NOT NULL",
          "constraint_name": "2200_34256_11_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "successful_uses IS NOT NULL",
          "constraint_name": "2200_34256_12_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "rejected_uses IS NOT NULL",
          "constraint_name": "2200_34256_13_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "created_by IS NOT NULL",
          "constraint_name": "2200_34256_16_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_34256_1_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "skill_type IS NOT NULL",
          "constraint_name": "2200_34256_3_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_34256_4_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "version IS NOT NULL",
          "constraint_name": "2200_34256_6_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_34256_18_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_34256_19_not_null"
        },
        {
          "table_name": "skill_registry",
          "check_clause": "agent_type IS NOT NULL",
          "constraint_name": "2200_34256_2_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20932_1_not_null"
        },
        {
          "table_name": "statement_items",
          "check_clause": "canonical_name IS NOT NULL",
          "constraint_name": "2200_20932_4_not_null"
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
          "table_name": "statements",
          "check_clause": "name IS NOT NULL",
          "constraint_name": "2200_20916_3_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "updated_at IS NOT NULL",
          "constraint_name": "2200_20916_7_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_20916_6_not_null"
        },
        {
          "table_name": "statements",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_20916_1_not_null"
        },
        {
          "table_name": "work_hints",
          "check_clause": "confidence IS NOT NULL",
          "constraint_name": "2200_33547_7_not_null"
        },
        {
          "table_name": "work_hints",
          "check_clause": "id IS NOT NULL",
          "constraint_name": "2200_33547_1_not_null"
        },
        {
          "table_name": "work_hints",
          "check_clause": "doc_id IS NOT NULL",
          "constraint_name": "2200_33547_2_not_null"
        },
        {
          "table_name": "work_hints",
          "check_clause": "hint_text IS NOT NULL",
          "constraint_name": "2200_33547_4_not_null"
        },
        {
          "table_name": "work_hints",
          "check_clause": "created_at IS NOT NULL",
          "constraint_name": "2200_33547_8_not_null"
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
            "code"
          ],
          "table_name": "doc_glossary",
          "constraint_name": "doc_glossary_doc_id_code_key"
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
          "table_name": "fsnb_collections",
          "constraint_name": "fsnb_collections_code_key"
        },
        {
          "columns": [
            "norm_code",
            "tg_id"
          ],
          "table_name": "fsnb_norm_tech_groups",
          "constraint_name": "fsnb_norm_tech_groups_norm_code_tg_id_key"
        },
        {
          "columns": [
            "norm_code"
          ],
          "table_name": "fsnb_norms",
          "constraint_name": "fsnb_norms_norm_code_key"
        },
        {
          "columns": [
            "region_code",
            "period",
            "work_category"
          ],
          "table_name": "fsnb_price_indices",
          "constraint_name": "fsnb_price_indices_region_code_period_work_category_key"
        },
        {
          "columns": [
            "code"
          ],
          "table_name": "fsnb_profiles",
          "constraint_name": "fsnb_profiles_code_key"
        },
        {
          "columns": [
            "code"
          ],
          "table_name": "fsnb_resources",
          "constraint_name": "fsnb_resources_code_key"
        },
        {
          "columns": [
            "tg_code"
          ],
          "table_name": "fsnb_tech_groups",
          "constraint_name": "fsnb_tech_groups_tg_code_key"
        },
        {
          "columns": [
            "tg_id",
            "resource_code"
          ],
          "table_name": "fsnb_tg_resources",
          "constraint_name": "fsnb_tg_resources_tg_id_resource_code_key"
        },
        {
          "columns": [
            "name"
          ],
          "table_name": "imported_rate_categories",
          "constraint_name": "imported_rate_categories_name_key"
        },
        {
          "columns": [
            "category_id",
            "name"
          ],
          "table_name": "imported_rate_types",
          "constraint_name": "imported_rate_types_category_id_name_key"
        },
        {
          "columns": [
            "type_id",
            "work_name"
          ],
          "table_name": "imported_rates",
          "constraint_name": "imported_rates_type_id_work_name_key"
        },
        {
          "columns": [
            "key"
          ],
          "table_name": "llm_prompts",
          "constraint_name": "llm_prompts_key_key"
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
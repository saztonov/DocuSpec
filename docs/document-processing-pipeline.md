# Pipeline обработки документов MD + JSON

Система DocuSpec обрабатывает строительную проектную документацию в два этапа:
**Загрузка и парсинг** (MD + JSON → БД) и **Извлечение** (блоки → material_facts через rule-based + LLM).

```
MD-файл + _result.json
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
  │  parseDocument│────▶│  doc_pages    │────▶│  doc_blocks   │
  │  (parser.ts) │     │  (страницы)   │     │  (блоки)      │
  └─────────────┘     └──────────────┘     └──────┬───────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │  Извлечение     │
                                          │  (5 фаз)        │
                                          └───────┬────────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                       material_facts      product_facts       doc_glossary
```

---

## Этап 1: Загрузка и парсинг

**Точка входа:** `useDocument.ts` → функция `uploadDocument(file, options?)`

### 1.1 Чтение файлов

| Вход | Обработка | Результат |
|------|-----------|-----------|
| `*.md` файл | `readFileAsText(file)` — FileReader, UTF-8 | `mdText: string` |
| `*_result.json` (опционально) | `parseImageUrlsFromJson(jsonText)` | `Map<UID, imageUrl>` |

**Формат JSON-компаньона:** содержит массив блоков с полями `block_uid`, `block_type`, `ocr_html`. Из `ocr_html` IMAGE-блоков извлекается URL изображения через regex `href="(https://[^"]+)"`.

### 1.2 Парсинг MD (`parser.ts`)

Конечный автомат, обрабатывающий строки MD-текста.

**Regex-паттерны:**
```
## СТРАНИЦА N          → новая страница (page_no, sheet_label, sheet_name)
### BLOCK [TEXT|IMAGE]: UID  → новый блок
#### ... ###### ...     → section_title внутри блока
|...|                   → строки MD-таблиц
[Ошибка ...]           → пометка has_error
```

**Результат `ParsedDocument`:**
- `pages[]` → массив `ParsedPage`, каждая содержит `blocks[]`
- Каждый `ParsedBlock` содержит: `uid`, `type` (TEXT/IMAGE), `content`, `hasTable`, `hasError`, `sectionTitle`, `tables[]`

**Парсинг таблиц:**
- `parseTables()` → разбивает блок на отдельные таблицы по непрерывным строкам с `|`
- `parseMarkdownTable()` → извлекает `headers[]`, `rows[][]`, `sectionContext`
- Обрабатывает "merged title" — строки-заголовки типа "Спецификация" занимающие одну ячейку

### 1.3 Сохранение в БД

```
1. INSERT documents  (status='parsing', filename, raw_md, doc_code)  → docId
2. FOR EACH page:
     INSERT doc_pages  (doc_id, page_no, sheet_label, sheet_name)  → pageId
     FOR EACH block:
       image_url = imageUrlMap.get(block.uid) ?? null
       INSERT doc_blocks  (doc_id, page_id, block_uid, block_type,
                           content, has_table, has_error, section_title, image_url)
3. UPDATE documents  (status='done'|'has_errors', page_count, block_count)
```

---

## Этап 2: Извлечение material_facts

**Точка входа:** `useExtraction.ts` → функция `runExtraction(model?)`

При запуске: очищает предыдущие результаты (`DELETE material_facts, product_facts, doc_glossary`), загружает промпты из `llm_prompts`, парсит `raw_md` заново.

### Pass 0: Глоссарий

**Цель:** Извлечь словарь сокращений документа для повышения точности последующих фаз.

```
TEXT-блоки (>50 символов) → чанки по 25 блоков → LLM (glossary_extraction промпт)
    → [{code, item_type, description}]
    → INSERT doc_glossary (upsert по doc_id+code)
```

`item_type`: `assembly` | `construction` | `material` | `location` | `color`

Результат — `glossaryMap` — внедряется в промпты фаз 1–2 через `buildPromptWithGlossary()`: добавляет раздел с перечнем сборок/конструкций, чтобы LLM не путал их с материалами.

### Классификация блоков

После Pass 0 все блоки распределяются по пяти массивам на основе `classifyTable()` (`tableClassifier.ts`):

```
                         ┌── vedomost_materialov ──▶ vedomostBlocks
                         │
TEXT + таблица ──classifyTable()──┼── assembly_spec ───────▶ assemblyBlocks
                         │
                         ├── vedomost_izdelij ─────▶ productListBlocks
                         │
                         └── extractable (остальные) ──▶ specBlocks

TEXT без таблицы + паттерн количества ──────────────────▶ specBlocks

IMAGE (разрез/сечение/узел + "Текст на чертеже:") ─────▶ imageBlocks
```

**Категории таблиц** (приоритет сверху вниз):

| Категория | Признак | Извлекаемая? |
|-----------|---------|:---:|
| `change_log` | колонки "изм" + "подп"/"дата" | нет |
| `vedomost_materialov` | sectionContext "ведомость материалов" | да |
| `vedomost_izdelij` | sectionContext "ведомость изделий/ограждений/..." | отдельно |
| `assembly_spec` | sectionContext "спецификация элементов ограждений" | отдельно |
| `room_schedule` | "№ пом" + "площадь" | нет |
| `reference_docs` | "обозначение" + "наименование" без кол-ва | нет |
| `drawing_list` | "№ листа" + "наименование" без кол-ва | нет |
| `material_qty` | "наименование" + колонка количества + "ед" | да |
| `spec_elements` | "поз" + "наименование" + количество | да |
| `element_spec` | "марка" + количество | да |
| `floor_spec` | "тип пола" / "данные элементов" | да |
| `roof_spec` | "тип покрытия" / "данные элементов" | да |
| `unknown` | всё остальное | да |

**Фильтры пропуска блоков:**
- Блоки с `hasError`
- TEXT с sectionTitle из "Общие указания/данные/сведения", "Условные обозначения"
- IMAGE с `Тип: Легенда` или `Тип: План`
- IMAGE разрез/сечение/узел, но без секции `Текст на чертеже:`

### Фаза 1: Ведомости материалов

```
vedomostBlocks
    │
    ├── ruleBasedExtract() ──▶ если items > 0 → saveFactsToDb('vedomost_materialov')
    │
    └── если items = 0 ─────▶ llmExtractBatch(universal_extraction) → saveFactsToDb
```

**Rule-based экстракторы** (`extraction.ts`):
- `extractMaterialQty()` — для таблиц с "наименование" + колонка количества + "ед.изм". Confidence: 0.95
- `extractElementSpec()` — для таблиц с "марка" + количество. Confidence: 0.9
- `extractSpecElements()` — для таблиц с "поз" + "наименование". Извлекает `construction` (из колонки "наименование элементов") и `extra_params` (из колонки "цвет/RAL/эталон")

### Фаза 2: Спецификации

```
specBlocks (таблицы + текстовые)
    │
    ├── ruleBasedExtract() ──▶ saveFactsToDb('spetsifikatsiya')
    │
    └── Также в LLM если:
        - сложная категория (не material_qty/element_spec/spec_elements)
        - категория unknown
        - rule-based вернул 0 items
        │
        ▼
    llmExtractBatch(universal_extraction)
        │
        ▼
    mergeResults(ruleItems, llmItems) → дедупликация по (name, qty, unit)
        │
        ▼
    Только уникальные LLM-элементы → saveFactsToDb('spetsifikatsiya')
```

`block_type_display` = `'Таблица'` для блоков с таблицами, `'Текст'` для текстовых.

### Фаза 2b: Спецификации сборок

```
assemblyBlocks
    │
    ▼
extractAssemblySpec(table, glossaryMap)
    │
    ├── строка-заголовок (assembly) ──▶ ProductFactItem → product_facts
    │   (определяется через glossaryMap или regex /^[А-ЯA-Z]{1,4}-\d+/)
    │
    └── строка-компонент ─────────────▶ MaterialFactItem (construction = марка сборки)
                                        → material_facts ('assembly_spec')
```

### Фаза 2c: Ведомости изделий

```
productListBlocks → llmExtractBatch(universal_extraction)
    → конвертация MaterialFactItem → ProductFactItem
    → saveProductsToDb('vedomost_izdelij')
```

### Фаза 3: Пироги конструкций

```
imageBlocks (IMAGE разрез/сечение/узел)
    │
    ▼
FOR EACH block (с задержкой 500мс):
    │
    ├── если есть image_url → multipart сообщение (image_url + текст блока)
    └── если нет            → только текст блока
    │
    ▼
    llmExtractImageBlock(layer_cake промпт) → filter(source_snippet)
    → saveFactsToDb('pirog', 'Изображение')
```

### Финализация

- UPDATE `documents`: `status = 'done'`, `prompt_tokens`, `completion_tokens`, `total_tokens`
- Автоматическое скачивание лог-файла сессии

---

## LLM-вызовы

**Клиент:** `llm.ts` → `callLlmJson()` — HTTP POST к OpenRouter API.

| Параметр | Значение |
|----------|----------|
| URL | `https://openrouter.ai/api/v1/chat/completions` |
| Модель | выбирается пользователем, по умолчанию `anthropic/claude-sonnet-4` |
| `response_format` | `{ type: 'json_object' }` |
| Таймаут | 60 сек |
| Retry (429) | экспоненциальный backoff, до 5 попыток |
| Retry (прочие) | 1 повтор через 1 сек |

**Промпты** хранятся в `llm_prompts` (3 ключа: `universal_extraction`, `layer_cake`, `glossary_extraction`).
Фоллбэк на константы в `extraction.ts` если промпт не найден.

**Схема ответа** (Zod): `ExtractionResponseSchema` → `{items: [{raw_name, canonical_name, canonical_key, construction, extra_params, quantity, unit, mark, gost, description, note, source_snippet, confidence}]}`

**Фильтрация ответа LLM:**
1. Обязательно наличие `source_snippet`
2. `filterLlmItems()` — отбрасывает элементы с `quantity=null + confidence<0.85`, генерические имена без количества

---

## Схема БД (ключевые таблицы)

```
projects ──1:N──▶ documents ──1:N──▶ doc_pages ──1:N──▶ doc_blocks
    │                 │                                      │
    │                 │              ┌────────────────────────┤
    │                 │              ▼                        ▼
    │                 ├──1:N──▶ material_facts          doc_glossary
    │                 │         (source_section:
    │                 │          vedomost_materialov |
    │                 │          spetsifikatsiya |
    │                 │          assembly_spec |
    │                 │          pirog)
    │                 │
    │                 ├──1:N──▶ product_facts
    │                 │         (source_section:
    │                 │          assembly_spec |
    │                 │          vedomost_izdelij)
    │                 │
    │                 └──1:N──▶ statements ──1:N──▶ statement_items
    │
    └──1:N──▶ sections

                  VIEW bom_summary
                  = GROUP BY (doc_id, canonical_key, unit)
                    SUM(quantity), COUNT(*), ARRAY_AGG(block_id)
```

### Ключевые поля material_facts

| Поле | Назначение |
|------|-----------|
| `raw_name` | Исходное название из документа |
| `canonical_name` | Нормализованное (редактируемое пользователем) |
| `canonical_key` | Slug для группировки в BOM |
| `source_section` | Источник: откуда извлечено |
| `block_type_display` | Тип блока для UI: Таблица / Текст / Изображение |
| `construction` | Родительская конструкция/сборка |
| `extra_params` | Цвет RAL, доп. параметры |
| `confidence` | Уверенность (0.0–1.0) |
| `source_snippet` | Контекстный отрывок из блока-источника |

---

## Ключевые файлы

| Файл | Роль |
|------|------|
| `src/lib/parser.ts` | Парсинг MD → ParsedDocument |
| `src/hooks/useDocument.ts` | Загрузка файлов, парсинг JSON, сохранение в БД |
| `src/lib/tableClassifier.ts` | Классификация таблиц по заголовкам и контексту |
| `src/hooks/useExtraction.ts` | Оркестратор всех фаз извлечения |
| `src/lib/extraction.ts` | Rule-based экстракторы + LLM-обёртки |
| `src/lib/llm.ts` | HTTP-клиент OpenRouter |
| `src/types/extraction.ts` | Zod-схемы ответов LLM |
| `src/pages/DocumentPage.tsx` | UI: вкладки Блоки / Материалы / Изделия / Сводная ведомость |

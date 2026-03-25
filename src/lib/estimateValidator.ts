/**
 * Phase F: Rule-based валидация сметных кандидатов.
 * Проверяет полноту, согласованность и выявляет проблемы.
 */

import { supabase } from './supabase.ts';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  issue_type: string;
  description: string;
  related_work_item_id?: string;
  related_material_fact_id?: string;
  related_resource_match_id?: string;
  related_rate_match_id?: string;
  suggested_action?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  infos: number;
}

/**
 * Запуск всех проверок для сметы.
 */
export async function validateEstimate(estimateId: string, docId: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  await Promise.all([
    checkUncoveredMaterials(estimateId, docId, issues),
    checkUnitMismatches(estimateId, issues),
    checkDoubleCount(docId, issues),
    checkCrossVolumeDeps(docId, issues),
    checkLayerFacts(docId, issues),
    checkLowCoverage(estimateId, issues),
    checkTgMismatch(estimateId, issues),
  ]);

  // Сохранить в estimate_review_queue
  if (issues.length > 0) {
    const rows = issues.map(issue => ({
      estimate_id: estimateId,
      severity: issue.severity,
      issue_type: issue.issue_type,
      description: issue.description,
      related_work_item_id: issue.related_work_item_id || null,
      related_material_fact_id: issue.related_material_fact_id || null,
      related_resource_match_id: issue.related_resource_match_id || null,
      related_rate_match_id: issue.related_rate_match_id || null,
      suggested_action: issue.suggested_action || null,
    }));

    await supabase.from('estimate_review_queue').insert(rows);
  }

  return {
    issues,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    infos: issues.filter(i => i.severity === 'info').length,
  };
}

/** Материалы без привязки к работам */
async function checkUncoveredMaterials(
  estimateId: string,
  docId: string,
  issues: ValidationIssue[],
): Promise<void> {
  // Все material_facts для документа
  const { data: facts } = await supabase
    .from('material_facts')
    .select('id, canonical_name, fact_type')
    .eq('doc_id', docId)
    .in('fact_type', ['observed', 'derived']);

  if (!facts || facts.length === 0) return;

  // Все material_fact_ids, покрытые work_items
  const { data: workItems } = await supabase
    .from('estimate_work_items')
    .select('source_material_fact_ids')
    .eq('estimate_id', estimateId);

  const coveredIds = new Set<string>();
  for (const wi of workItems || []) {
    for (const id of wi.source_material_fact_ids || []) {
      coveredIds.add(id);
    }
  }

  for (const fact of facts) {
    if (!coveredIds.has(fact.id)) {
      issues.push({
        severity: 'warning',
        issue_type: 'uncovered_material',
        description: `Материал "${fact.canonical_name}" не покрыт ни одним видом работ`,
        related_material_fact_id: fact.id,
        suggested_action: 'Определите вид работы или исключите материал',
      });
    }
  }
}

/** Несовместимые единицы между фактом и ресурсом КСР */
async function checkUnitMismatches(
  estimateId: string,
  issues: ValidationIssue[],
): Promise<void> {
  const { data: matches } = await supabase
    .from('estimate_resource_matches')
    .select('id, fsnb_resource_name, unit_compatible, conversion_formula')
    .eq('estimate_id', estimateId)
    .eq('unit_compatible', false);

  for (const match of matches || []) {
    issues.push({
      severity: 'error',
      issue_type: 'unit_mismatch',
      description: `Несовместимые единицы для ресурса "${match.fsnb_resource_name}"${match.conversion_formula ? `. Предложение: ${match.conversion_formula}` : ''}`,
      related_resource_match_id: match.id,
      suggested_action: 'Проверьте формулу пересчёта единиц',
    });
  }
}

/** Подозрение на двойной счёт */
async function checkDoubleCount(
  docId: string,
  issues: ValidationIssue[],
): Promise<void> {
  // Материалы, которые есть И в vedomost_materialov, И в assembly_total
  const { data: vedomostKeys } = await supabase
    .from('material_facts')
    .select('canonical_key')
    .eq('doc_id', docId)
    .eq('source_section', 'vedomost_materialov')
    .not('canonical_key', 'is', null);

  if (!vedomostKeys || vedomostKeys.length === 0) return;

  const keys = vedomostKeys.map(r => r.canonical_key);

  const { data: assemblyDupes } = await supabase
    .from('material_facts')
    .select('id, canonical_name, canonical_key')
    .eq('doc_id', docId)
    .eq('source_section', 'assembly_total')
    .in('canonical_key', keys);

  for (const dupe of assemblyDupes || []) {
    issues.push({
      severity: 'error',
      issue_type: 'double_count',
      description: `Материал "${dupe.canonical_name}" присутствует и в ведомости, и в расчёте сборок. Возможен двойной счёт.`,
      related_material_fact_id: dupe.id,
      suggested_action: 'Проверьте, не дублируется ли объём',
    });
  }
}

/** Неразрешённые межтомовые зависимости */
async function checkCrossVolumeDeps(
  docId: string,
  issues: ValidationIssue[],
): Promise<void> {
  const { data: deps } = await supabase
    .from('dependency_flags')
    .select('id, referenced_doc_code, dependency_type, description')
    .eq('doc_id', docId)
    .eq('resolved', false);

  for (const dep of deps || []) {
    issues.push({
      severity: 'warning',
      issue_type: 'cross_volume_dep',
      description: `Зависимость от тома ${dep.referenced_doc_code} (${dep.dependency_type || 'неизвестный тип'}) не разрешена`,
      suggested_action: `Загрузите том ${dep.referenced_doc_code} для полного расчёта`,
    });
  }
}

/** Layer facts без геометрической базы */
async function checkLayerFacts(
  docId: string,
  issues: ValidationIssue[],
): Promise<void> {
  const { data: layers } = await supabase
    .from('material_facts')
    .select('id, canonical_name, construction')
    .eq('doc_id', docId)
    .eq('fact_type', 'layer');

  for (const layer of layers || []) {
    issues.push({
      severity: 'info',
      issue_type: 'no_geometry',
      description: `Слой "${layer.canonical_name}" (${layer.construction || 'без привязки'}) — нет геометрической базы для расчёта объёма`,
      related_material_fact_id: layer.id,
      suggested_action: 'Требуется площадь конструкции из раздела КЖ/АР',
    });
  }
}

/** Низкое покрытие ресурсов расценки */
async function checkLowCoverage(
  estimateId: string,
  issues: ValidationIssue[],
): Promise<void> {
  const { data: rates } = await supabase
    .from('estimate_rate_matches')
    .select('id, norm_code, norm_name, resource_coverage')
    .eq('estimate_id', estimateId)
    .lt('resource_coverage', 0.5)
    .not('resource_coverage', 'is', null);

  for (const rate of rates || []) {
    issues.push({
      severity: 'warning',
      issue_type: 'low_coverage',
      description: `Расценка ${rate.norm_code} "${rate.norm_name}" покрывает только ${Math.round((rate.resource_coverage || 0) * 100)}% ресурсов`,
      related_rate_match_id: rate.id,
      suggested_action: 'Рассмотрите альтернативные расценки',
    });
  }
}

/** Ресурс вне ТГ нормы */
async function checkTgMismatch(
  estimateId: string,
  issues: ValidationIssue[],
): Promise<void> {
  // Ресурсы, подобранные fallback (вне ТГ)
  const { data: matches } = await supabase
    .from('estimate_resource_matches')
    .select('id, fsnb_resource_name, match_method, tg_id')
    .eq('estimate_id', estimateId)
    .is('tg_id', null)
    .not('match_method', 'eq', 'manual');

  for (const match of matches || []) {
    if (match.match_method === 'semantic' || match.match_method === 'llm') {
      issues.push({
        severity: 'warning',
        issue_type: 'tg_mismatch',
        description: `Ресурс "${match.fsnb_resource_name}" подобран вне технологической группы нормы`,
        related_resource_match_id: match.id,
        suggested_action: 'Проверьте, допустим ли этот ресурс для данной нормы',
      });
    }
  }
}

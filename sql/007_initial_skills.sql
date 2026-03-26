-- 007_initial_skills.sql
-- Начальные rule-based скиллы для агентов сметного пайплайна
-- Предусловие: 006_estimate_and_skills.sql уже применена

-- ══════════════════════════════════════════════════════════════
-- WORK_CLASSIFIER: section_work_categories (7 разделов)
-- ══════════════════════════════════════════════════════════════

INSERT INTO skill_registry (agent_type, skill_type, name, description, rule_config, created_by, approved_by, is_active)
VALUES
('work_classifier', 'rule', 'section_categories_AR', 'Типичные категории работ для раздела АР',
 '{"match":{"section_code":"АР"},"result":{"typical_categories":["finishing","masonry","flooring","railing","glazing","waterproofing","insulation","openings","roofing"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_KZH', 'Типичные категории работ для раздела КЖ',
 '{"match":{"section_code":"КЖ"},"result":{"typical_categories":["concrete","reinforcement","formwork","earthwork","waterproofing"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_KR', 'Типичные категории работ для раздела КР/КМ',
 '{"match":{"section_code":"КР|КМ|КМД"},"result":{"typical_categories":["metalwork","welding","railing","masonry"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_EOM', 'Типичные категории работ для раздела ЭОМ',
 '{"match":{"section_code":"ЭОМ|ЭМ|ЭС"},"result":{"typical_categories":["electrical","cable_laying","electrical_equipment"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_SS', 'Типичные категории работ для раздела СС',
 '{"match":{"section_code":"СС|СКС|АТ"},"result":{"typical_categories":["low_voltage","communication_equipment","cable_laying"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_OV', 'Типичные категории работ для раздела ОВ',
 '{"match":{"section_code":"ОВ|ОВиК"},"result":{"typical_categories":["piping","ventilation","equipment_installation","pipe_insulation"]},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'section_categories_VK', 'Типичные категории работ для раздела ВК',
 '{"match":{"section_code":"ВК"},"result":{"typical_categories":["piping","plumbing","equipment_installation"]},"confidence":0.9}',
 'system', 'system', true);

-- ══════════════════════════════════════════════════════════════
-- WORK_CLASSIFIER: material_to_work_hints (паттерны материалов → категория)
-- ══════════════════════════════════════════════════════════════

INSERT INTO skill_registry (agent_type, skill_type, name, description, rule_config, created_by, approved_by, is_active)
VALUES
('work_classifier', 'rule', 'mat_hint_brick', 'Кирпич/блок → кладка',
 '{"match":{"material_name":"кирпич|блок кладочный|блок керамич|блок газобетон|блок пенобетон"},"result":{"work_category":"masonry","work_hint":"Кладка стен/перегородок"},"confidence":0.85}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_stone_facing', 'Облицовочный камень/плитка → отделка',
 '{"match":{"material_name":"облицовочн|плитка облицовоч|камень натуральн|гранит облицовоч|известняк облицовоч|мрамор"},"result":{"work_category":"finishing","work_hint":"Облицовка поверхностей натуральным/искусственным камнем"},"confidence":0.85}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_metal_railing', 'Стальное ограждение → монтаж ограждений',
 '{"match":{"material_name":"ограждение металлическ|ограждение стальн|перила стальн|поручень металлическ|прутья стальн|полоса стальная"},"result":{"work_category":"railing","work_hint":"Монтаж металлических ограждений"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_glass_railing', 'Стеклянное ограждение → монтаж ограждений',
 '{"match":{"material_name":"ограждение стеклянн|триплекс|министойк"},"result":{"work_category":"railing","work_hint":"Монтаж стеклянных ограждений"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_cable', 'Кабель/провод → электромонтаж',
 '{"match":{"material_name":"кабель|провод|жгут проводн"},"result":{"work_category":"electrical","work_hint":"Прокладка кабелей/проводов"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_pipe', 'Труба/трубопровод → монтаж трубопроводов',
 '{"match":{"material_name":"труба|трубопровод|фитинг|отвод стальн|тройник|муфта"},"result":{"work_category":"piping","work_hint":"Монтаж трубопроводов"},"confidence":0.85}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_duct', 'Воздуховод → вентиляция',
 '{"match":{"material_name":"воздуховод|диффузор|решётка вентиляц|клапан воздуш"},"result":{"work_category":"ventilation","work_hint":"Монтаж воздуховодов и вентиляционного оборудования"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_drywall', 'ГКЛ/КНАУФ → обшивка/перегородки',
 '{"match":{"material_name":"гипсокартон|ГКЛ|ГСП|КНАУФ|кнауф|гипсоволокн"},"result":{"work_category":"finishing","work_hint":"Устройство перегородок/обшивок из ГКЛ"},"confidence":0.85}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_concrete', 'Бетон/раствор/стяжка → бетонные/отделочные работы',
 '{"match":{"material_name":"бетон|раствор|стяжка|ЦПР|наливной пол"},"result":{"work_category":"concrete","work_hint":"Устройство стяжки/бетонирование"},"confidence":0.8}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_rebar', 'Арматура → армирование',
 '{"match":{"material_name":"арматура|каркас арматурн|сетка арматурн|закладная деталь"},"result":{"work_category":"reinforcement","work_hint":"Армирование конструкций"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_waterproofing', 'Гидроизоляция → гидроизоляционные работы',
 '{"match":{"material_name":"гидроизоляц|битум|мастика гидроизол|мембрана гидроизол|праймер"},"result":{"work_category":"waterproofing","work_hint":"Устройство гидроизоляции"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_insulation', 'Утеплитель → теплоизоляция',
 '{"match":{"material_name":"утеплитель|минват|пенополистирол|ЭППС|экструзионн|теплоизоляц|пенопласт"},"result":{"work_category":"insulation","work_hint":"Устройство теплоизоляции"},"confidence":0.9}',
 'system', 'system', true),

('work_classifier', 'rule', 'mat_hint_fasteners', 'Анкеры/крепёж → группировать с основным материалом',
 '{"match":{"material_name":"анкер|дюбель|шпилька|саморез|болт|гайка|шайба|крепёж|хим.* анкер"},"result":{"work_category":"_fastener","work_hint":"Крепёжный элемент — группировать с основной конструкцией"},"confidence":0.7}',
 'system', 'system', true);

-- ══════════════════════════════════════════════════════════════
-- PRICE_PICKER: norm_collection_hints (категория → сборники ГЭСН)
-- ══════════════════════════════════════════════════════════════

INSERT INTO skill_registry (agent_type, skill_type, name, description, rule_config, created_by, approved_by, is_active)
VALUES
('price_picker', 'rule', 'norm_hint_masonry', 'Каменные работы → сборник 08',
 '{"match":{"work_category":"masonry"},"result":{"gesn_collections":["08"],"search_hints":["кладка стен","кладка перегородок","кирпичная кладка"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_finishing', 'Отделочные работы → сборник 15',
 '{"match":{"work_category":"finishing"},"result":{"gesn_collections":["15","10"],"search_hints":["облицовка стен","штукатурка","обшивка ГКЛ","устройство перегородок"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_flooring', 'Полы → сборник 11',
 '{"match":{"work_category":"flooring"},"result":{"gesn_collections":["11"],"search_hints":["устройство стяжки","покрытие пола","наливной пол"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_concrete', 'Бетонные работы → сборник 06-07',
 '{"match":{"work_category":"concrete"},"result":{"gesn_collections":["06","07"],"search_hints":["бетонирование","укладка бетона","монолитные конструкции"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_metalwork', 'Металлоконструкции → сборник 09',
 '{"match":{"work_category":"metalwork|railing"},"result":{"gesn_collections":["09"],"search_hints":["монтаж металлоконструкций","монтаж ограждений","установка перил"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_electrical', 'Электромонтаж → сборник 08м',
 '{"match":{"work_category":"electrical|cable_laying"},"result":{"gesn_collections":["08м"],"search_hints":["прокладка кабеля","монтаж электрооборудования"]},"confidence":0.8}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_piping', 'Трубопроводы → сборник 16-17',
 '{"match":{"work_category":"piping|plumbing"},"result":{"gesn_collections":["16","17"],"search_hints":["прокладка трубопроводов","монтаж труб","сантехнические работы"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_ventilation', 'Вентиляция → сборник 20',
 '{"match":{"work_category":"ventilation"},"result":{"gesn_collections":["20"],"search_hints":["монтаж воздуховодов","вентиляция"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_waterproofing', 'Гидроизоляция → сборник 13',
 '{"match":{"work_category":"waterproofing"},"result":{"gesn_collections":["13"],"search_hints":["гидроизоляция","обмазочная изоляция"]},"confidence":0.85}',
 'system', 'system', true),

('price_picker', 'rule', 'norm_hint_insulation', 'Теплоизоляция → сборник 26',
 '{"match":{"work_category":"insulation"},"result":{"gesn_collections":["26"],"search_hints":["теплоизоляция стен","утепление"]},"confidence":0.85}',
 'system', 'system', true);

-- ══════════════════════════════════════════════════════════════
-- RESOURCE_MATCHER: unit_conversion_rules
-- ══════════════════════════════════════════════════════════════

INSERT INTO skill_registry (agent_type, skill_type, name, description, rule_config, created_by, approved_by, is_active)
VALUES
('resource_matcher', 'rule', 'unit_m2_to_100m2', 'м2 → 100 м2',
 '{"match":{"from_unit":"м2","to_unit":"100 м2"},"result":{"formula":"value / 100","factor":0.01},"confidence":1.0}',
 'system', 'system', true),

('resource_matcher', 'rule', 'unit_m3_to_1000m3', 'м3 → 1000 м3',
 '{"match":{"from_unit":"м3","to_unit":"1000 м3"},"result":{"formula":"value / 1000","factor":0.001},"confidence":1.0}',
 'system', 'system', true),

('resource_matcher', 'rule', 'unit_sht_to_1000sht', 'шт → 1000 шт',
 '{"match":{"from_unit":"шт","to_unit":"1000 шт"},"result":{"formula":"value / 1000","factor":0.001},"confidence":1.0}',
 'system', 'system', true),

('resource_matcher', 'rule', 'unit_kg_to_t', 'кг → т',
 '{"match":{"from_unit":"кг","to_unit":"т"},"result":{"formula":"value / 1000","factor":0.001},"confidence":1.0}',
 'system', 'system', true),

('resource_matcher', 'rule', 'unit_m_to_100m', 'м → 100 м',
 '{"match":{"from_unit":"м","to_unit":"100 м"},"result":{"formula":"value / 100","factor":0.01},"confidence":1.0}',
 'system', 'system', true);

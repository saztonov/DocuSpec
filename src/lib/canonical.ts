/**
 * Transliterate Russian text to Latin and generate a slug for canonical_key.
 */

const RU_TO_LAT: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(char => RU_TO_LAT[char] ?? char)
    .join('');
}

export function slugify(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric sequences with _
    .replace(/^_+|_+$/g, '')      // Trim leading/trailing underscores
    .replace(/_+/g, '_');          // Collapse multiple underscores
}

/**
 * Generate a canonical_key from a canonical_name (or raw_name as fallback).
 */
export function generateCanonicalKey(name: string): string {
  // Remove common noise phrases
  const cleaned = name
    .replace(/\s*\(или аналог\)/gi, '')
    .replace(/\s*или аналог/gi, '')
    .replace(/\s*аналог/gi, '')
    .replace(/["«»]/g, '')
    .trim();

  return slugify(cleaned);
}

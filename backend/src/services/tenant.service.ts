const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};
export function slugify(input: string): string {
  // Apply TR map BEFORE toLowerCase so uppercase TR chars map to ASCII
  // (otherwise 'İ'.toLowerCase() yields 'i' + combining dot above, inserting a hyphen).
  const mapped = input
    .split('')
    .map((c) => TR_MAP[c] ?? c)
    .join('')
    .toLowerCase();
  return mapped
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function companyNameKey(name: string): string {
  return slugify(name.normalize('NFKC').trim().replace(/\s+/g, ' '));
}

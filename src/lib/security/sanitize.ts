export function sanitizePlainText(value: string): string {
  return value.replace(/[<>]/g, '').trim();
}

export function sanitizeTags(value: string): string[] {
  return value
    .split(',')
    .map((entry) => sanitizePlainText(entry).toLowerCase())
    .filter(Boolean)
    .slice(0, 16);
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => sanitizePlainText(entry))
    .filter(Boolean);
}

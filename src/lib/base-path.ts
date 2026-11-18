/** Alt dizin yayını (örn. /esnaf). Boşsa kökten çalışır. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Uygulama içi mutlak yolu basePath ile önekler (`/api/...`, `/giris` vb.). */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  if (!BASE_PATH) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

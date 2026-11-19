// remembered so returning visitors skip retyping their id
const MANAGER_ID_STORAGE_KEY = 'onze:managerId';

export function parseManagerId(raw: string | null): number | null {
  if (raw === null) return null;
  const managerId = Number(raw);
  return Number.isInteger(managerId) && managerId > 0 ? managerId : null;
}

export function loadStoredManagerId(): number | null {
  try {
    return parseManagerId(localStorage.getItem(MANAGER_ID_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeManagerId(managerId: number): void {
  try {
    localStorage.setItem(MANAGER_ID_STORAGE_KEY, String(managerId));
  } catch {
    // private browsing or storage disabled; nothing to fall back to
  }
}

// Collection store — persists date-range bookmarks per dataset file.
//
// Each imported file gets its own localStorage bucket keyed by
// `collections_{filename}` so that switching between timelines never
// cross-contaminates collections.  Every entry carries a label (user note),
// startMs, endMs and a server-less createdAt timestamp.
//
// Boundary handling:
//   - localStorage may be empty / missing → returns empty array.
//   - Corrupted JSON → returns empty array (graceful degradation).
//   - Non-object entries in the array are silently filtered.
//   - All numeric fields validated with `Number.isFinite`.

export interface CollectionEntry {
  id: string
  label: string
  startMs: number
  endMs: number
  createdAt: number
}

const STORAGE_PREFIX = 'collections_'

function storageKey(filename: string): string {
  // Sanitize: only keep alphanumeric, hyphen, underscore, dot, tilde.
  const safe = filename.replace(/[^a-zA-Z0-9\-_.~]/g, '_')
  return `${STORAGE_PREFIX}${safe}`
}

/** Load all collections for a given filename. */
export function getCollections(filename: string): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(filename))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CollectionEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.label === 'string' &&
        typeof item.startMs === 'number' &&
        typeof item.endMs === 'number' &&
        typeof item.createdAt === 'number' &&
        Number.isFinite(item.startMs) &&
        Number.isFinite(item.endMs) &&
        Number.isFinite(item.createdAt),
    )
  } catch {
    return []
  }
}

/** Add a new collection entry. */
export function addCollection(
  filename: string,
  entry: Omit<CollectionEntry, 'id' | 'createdAt'>,
): CollectionEntry {
  const collections = getCollections(filename)
  const newEntry: CollectionEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  collections.push(newEntry)
  saveCollections(filename, collections)
  return newEntry
}

/** Delete a collection entry by id. */
export function deleteCollection(filename: string, id: string): boolean {
  const collections = getCollections(filename)
  const filtered = collections.filter((item) => item.id !== id)
  if (filtered.length === collections.length) return false
  saveCollections(filename, filtered)
  return true
}

/** Load a single collection entry by id (returns null when not found). */
export function loadCollection(
  filename: string,
  id: string,
): CollectionEntry | null {
  const collections = getCollections(filename)
  return collections.find((item) => item.id === id) ?? null
}

/** Persist the full collection array for a filename. */
function saveCollections(filename: string, items: CollectionEntry[]): void {
  try {
    localStorage.setItem(storageKey(filename), JSON.stringify(items))
  } catch {
    // Quota exceeded or private browsing — silently fail.
    // The UI will show an empty list on next read.
  }
}
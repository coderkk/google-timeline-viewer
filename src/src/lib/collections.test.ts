// Tests for the collections store — localStorage CRUD with filename scoping.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getCollections,
  addCollection,
  deleteCollection,
  loadCollection,
  type CollectionEntry,
} from './collections'

// --- localStorage mock (node env has no built-in localStorage) ---
const mockStore: Record<string, string> = {}

// --- fixtures ---
const SAMPLE_FILE = 'Timeline_2024.json'
const SAFE_FILE = 'file-with_special.chars.json'

function makeEntry(overrides?: Partial<Omit<CollectionEntry, 'id' | 'createdAt'>>): CollectionEntry {
  return {
    id: 'test-id',
    label: overrides?.label ?? 'Test trip',
    startMs: 1704067200000, // 2024-01-01
    endMs: 1706745600000,   // 2024-01-31
    createdAt: 1704067200000,
    ...overrides,
  }
}

// --- helpers ---
function clearStore(): void {
  const keys = Object.keys(mockStore).filter((k) => k.startsWith('collections_'))
  keys.forEach((k) => delete mockStore[k])
}

// Override global localStorage for the duration of tests.
const originalLocalStorage = global.localStorage
beforeEach(() => {
  clearStore()
  // Build a minimal localStorage-like object from the mock store.
  const ls: Storage = {
    length: Object.keys(mockStore).length,
    getItem: (key: string) => mockStore[key] ?? null,
    setItem: (key: string, value: string) => { mockStore[key] = value },
    removeItem: (key: string) => { delete mockStore[key] },
    clear: () => { Object.keys(mockStore).forEach((k) => delete mockStore[k]) },
    key: (index: number) => {
      const keys = Object.keys(mockStore)
      return keys[index] ?? null
    },
    // Index access for the test helpers
    get [Symbol.iterator]() { return Object.keys(mockStore)[Symbol.iterator] },
  } as unknown as Storage
  Object.defineProperty(global, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  Object.defineProperty(global, 'localStorage', {
    value: originalLocalStorage,
    writable: true,
    configurable: true,
  })
})

// --- tests ---
describe('collections store', () => {
  describe('getCollections', () => {
    it('returns empty array when no data exists', () => {
      expect(getCollections(SAMPLE_FILE)).toEqual([])
    })

    it('returns empty array for corrupted JSON', () => {
      mockStore[`collections_${SAFE_FILE}`] = 'not json'
      expect(getCollections(SAFE_FILE)).toEqual([])
    })

    it('returns empty array when value is not an array', () => {
      mockStore[`collections_${SAFE_FILE}`] = '"just a string"'
      expect(getCollections(SAFE_FILE)).toEqual([])
    })

    it('filters out non-object entries', () => {
      mockStore[`collections_${SAFE_FILE}`] = JSON.stringify(['not-an-object', 123, null, true])
      expect(getCollections(SAFE_FILE)).toEqual([])
    })

    it('filters entries missing required fields', () => {
      const entry = { id: 'x', label: 'y' } // missing startMs, endMs, createdAt
      mockStore[`collections_${SAFE_FILE}`] = JSON.stringify([entry])
      expect(getCollections(SAFE_FILE)).toEqual([])
    })

    it('filters entries with non-finite numbers', () => {
      const entry = { ...makeEntry(), startMs: Infinity }
      mockStore[`collections_${SAFE_FILE}`] = JSON.stringify([entry])
      expect(getCollections(SAFE_FILE)).toEqual([])
    })

    it('returns valid entries', () => {
      const entry = makeEntry({ label: 'Valid trip' })
      mockStore[`collections_${SAFE_FILE}`] = JSON.stringify([entry])
      const result = getCollections(SAFE_FILE)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(entry)
    })

    it('uses filename-safe key', () => {
      getCollections(SAMPLE_FILE) // should not throw
      const key = `collections_Timeline_2024.json`
      expect(mockStore[key]).toBeUndefined()
    })
  })

  describe('addCollection', () => {
    it('creates a new entry with generated id and createdAt', () => {
      const entry = addCollection(SAMPLE_FILE, {
        label: 'Thailand Trip',
        startMs: 1704067200000,
        endMs: 1706745600000,
      })
      expect(entry.id).toBeDefined()
      expect(entry.label).toBe('Thailand Trip')
      expect(entry.createdAt).toBeGreaterThan(0)
    })

    it('appends to existing collections', () => {
      addCollection(SAMPLE_FILE, { label: 'First', startMs: 1, endMs: 2 })
      const result = addCollection(SAMPLE_FILE, { label: 'Second', startMs: 3, endMs: 4 })
      const all = getCollections(SAMPLE_FILE)
      expect(all).toHaveLength(2)
      expect(all[1].label).toBe('Second')
      expect(result.label).toBe('Second')
    })

    it('persists to localStorage', () => {
      addCollection(SAMPLE_FILE, { label: 'Persisted', startMs: 1, endMs: 2 })
      const all = getCollections(SAMPLE_FILE)
      expect(all).toHaveLength(1)
      expect(all[0].label).toBe('Persisted')
    })
  })

  describe('deleteCollection', () => {
    it('returns false when id does not exist', () => {
      expect(deleteCollection(SAMPLE_FILE, 'nonexistent')).toBe(false)
    })

    it('removes the matching entry', () => {
      addCollection(SAMPLE_FILE, { label: 'Keep', startMs: 1, endMs: 2 })
      addCollection(SAMPLE_FILE, { label: 'Remove', startMs: 3, endMs: 4 })
      const toRemove = getCollections(SAMPLE_FILE)[1]
      expect(deleteCollection(SAMPLE_FILE, toRemove.id)).toBe(true)
      expect(getCollections(SAMPLE_FILE)).toHaveLength(1)
      expect(getCollections(SAMPLE_FILE)[0].label).toBe('Keep')
    })

    it('clears list when deleting the only entry', () => {
      const entry = addCollection(SAMPLE_FILE, { label: 'Only', startMs: 1, endMs: 2 })
      expect(deleteCollection(SAMPLE_FILE, entry.id)).toBe(true)
      expect(getCollections(SAMPLE_FILE)).toHaveLength(0)
    })
  })

  describe('loadCollection', () => {
    it('returns null when id does not exist', () => {
      expect(loadCollection(SAMPLE_FILE, 'nonexistent')).toBeNull()
    })

    it('returns the matching entry', () => {
      const entry = addCollection(SAMPLE_FILE, { label: 'Loaded', startMs: 1, endMs: 2 })
      const found = loadCollection(SAMPLE_FILE, entry.id)
      expect(found).toEqual(entry)
    })
  })

  describe('filename scoping', () => {
    it('keeps collections separate per filename', () => {
      addCollection('fileA.json', { label: 'A', startMs: 1, endMs: 2 })
      addCollection('fileB.json', { label: 'B', startMs: 3, endMs: 4 })
      expect(getCollections('fileA.json')).toHaveLength(1)
      expect(getCollections('fileA.json')[0].label).toBe('A')
      expect(getCollections('fileB.json')).toHaveLength(1)
      expect(getCollections('fileB.json')[0].label).toBe('B')
    })
  })
})
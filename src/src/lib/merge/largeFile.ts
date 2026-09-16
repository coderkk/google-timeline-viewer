// Merge page large-file guard (T36 fix #3): merging holds BOTH inputs plus the
// growing serialized output in memory at once (peak ≈6× the input size), so a
// combined input over 200MB gets a pre-merge confirm instead of silently
// freezing the tab for minutes. Pure + unit-testable; the MergePage component
// triggers `window.confirm` with the localized `merge.largeConfirm` copy when
// `isLargeMerge` is true (mirroring timelineStore's `import.largeConfirm`
// guard). The practical ceiling note ("over 300MB → export in smaller date
// ranges") lives in the i18n copy, PRD 功能 14 and README.
export const MERGE_LARGE_THRESHOLD_BYTES = 200 * 1024 * 1024

/** Combined byte size of the two selected files (single-file when no main). */
export function mergeInputBytes(
  main: { size: number } | null,
  fresh: { size: number } | null,
): number {
  return (main?.size ?? 0) + (fresh?.size ?? 0)
}

/** True when merging would hold 200MB+ of raw input in memory at once. */
export function isLargeMerge(
  main: { size: number } | null,
  fresh: { size: number } | null,
): boolean {
  return mergeInputBytes(main, fresh) > MERGE_LARGE_THRESHOLD_BYTES
}
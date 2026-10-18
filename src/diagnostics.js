/**
 * @fileoverview No-silent-drop diagnostics for the markdown serializer.
 *
 * content-writer used to return `null` for any node type it did not
 * recognize and `serializeDoc` filtered those nulls out — so an
 * editor-authored node the serializer didn't know about (a `Video`,
 * `card-group`, `FormBlock`, an unmapped mark …) vanished on write with
 * no signal. That silent loss was the original sin this module closes.
 *
 * The contract now: a node or mark the serializer can't represent is
 * still dropped from the output (we can't invent a markdown form for it),
 * but it is reported loudly instead of silently — a type outside the
 * vocabulary, or a genuine, tracked capability gap. ⛔ Until 2026-10-18 an
 * editor's own names were mapped onto the vocabulary first
 * (`normalizeDialect`); an editor writes the vocabulary itself now.
 *
 * Warnings dedupe per type so a build pipeline processing many documents
 * reports each unmapped construct once, not once per occurrence.
 */

const warnedNodes = new Set()
const warnedMarks = new Set()

/* The reporter is injectable so callers (and tests) can collect rather
 * than print. Defaults to console.warn. */
let report = (message) => console.warn(message)

/**
 * Override the diagnostics reporter (e.g. to collect warnings in tests
 * or route them into a build log). Pass no argument to restore the
 * default console.warn reporter.
 * @param {(message: string) => void} [fn]
 */
export function setDiagnosticsReporter(fn) {
  report = typeof fn === 'function' ? fn : (message) => console.warn(message)
}

/**
 * Clear the dedupe memory. Tests call this between cases so a warning
 * emitted once earlier doesn't suppress the assertion in a later case.
 */
export function resetDiagnostics() {
  warnedNodes.clear()
  warnedMarks.clear()
}

/** Set while `collectOmittedNodes` runs: the node types the write leaves out. */
let omitted = null

/**
 * Run a write and return the node types it left out, instead of reporting them.
 * For a caller that must refuse rather than lose content — a pull, whose next
 * push would delete whatever the file does not hold.
 *
 * @template T
 * @param {() => T} run
 * @returns {{ result: T, omitted: string[] }}
 */
export function collectOmittedNodes(run) {
  const previous = omitted
  omitted = new Set()
  try {
    const result = run()
    return { result, omitted: [...omitted] }
  } finally {
    omitted = previous
  }
}

/**
 * Report a ProseMirror node the serializer has no markdown form for.
 * @param {Object} node - The unmapped node ({ type, attrs, ... })
 */
export function warnUnmappedNode(node) {
  const type = node?.type || 'unknown'
  // A caller collecting what a write leaves out is told every time, not once per type.
  if (omitted) {
    omitted.add(type)
    return
  }
  if (warnedNodes.has(type)) return
  warnedNodes.add(type)
  report(
    `[content-writer] No markdown serializer for node type "${type}" — ` +
      `it was omitted from the output. A document holds the content ` +
      `vocabulary (@uniweb/content-reader's getBaseSchema); a type outside ` +
      `it has no markdown form, and one inside it is a tracked capability gap.`
  )
}

/**
 * Report an inline mark the serializer has no markdown form for. The
 * marked text itself is still emitted (unstyled); only the styling is
 * dropped.
 * @param {string} type - The unmapped mark type
 */
export function warnUnmappedMark(type) {
  const key = type || 'unknown'
  if (warnedMarks.has(key)) return
  warnedMarks.add(key)
  report(
    `[content-writer] No markdown serializer for mark "${key}" — the text ` +
      `was kept but its styling was dropped. Tracked capability gap.`
  )
}

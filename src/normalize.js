/**
 * @fileoverview Editor-dialect → framework-dialect ProseMirror normalizer.
 *
 * Two ProseMirror dialects flow through Uniweb:
 *
 *   - the **framework-markdown dialect** that content-reader produces and
 *     content-writer's serializers are written against (`image` with a
 *     `role`, `divider`, `dataBlock`, `inset_ref`, marks `bold/italic/
 *     link/button/code/span`), and
 *   - the **editor (TipTap) dialect** (`DividerBlock`, `card-group`,
 *     `FormBlock`, colour/highlight marks …).
 *
 * A ProseMirror document handed to content-writer may be in either dialect,
 * or a mix (file-origin content is framework-dialect; editor-authored
 * content is editor-dialect). Rather than teach the serializers both
 * vocabularies, we normalize the editor dialect onto the framework dialect
 * FIRST, then serialize one canonical dialect. semantic-parser's
 * `sequence.js` is the reference for what each editor construct means.
 *
 * This is the "normalize-first" half of the codec. It is **idempotent on
 * framework-dialect input**: every framework node
 * passes through unchanged, so running it on already-canonical content is
 * a structural no-op (the existing round-trip tests stay green).
 *
 * ## What this maps today (zero-guess cells only)
 *
 *   - `DividerBlock` / `horizontalRule` → `divider`
 *   - on a `table`, the editor's `layout` → `placement` (`mapTableLayout`)
 *   - `emoji` → its character
 *
 * ## What it deliberately does NOT map (left for the serializer's
 * no-silent-drop guard to report — a tracked capability gap)
 *
 *   - The editor's media and icon nodes — `ImageBlock`, `Video`, `UniwebIcon`,
 *     `Icon`. ⛔ Until 2026-10-18 they were mapped onto `image`, with
 *     `direction` → `placement` and `credit` → `author`; the editor saves
 *     framework's `image` since 2026-10-17, and the mapping was removed with
 *     the rest of its old vocabulary [Diego, 2026-10-18].
 *   - `FormBlock` — the editor node carries `activeSchemaId` + filled
 *     `data`; the framework `yaml:form` block carries a form *definition*.
 *     Different shapes; mapping needs a decision, not a guess.
 *   - `card-group`/`document-group` — open mapping decisions (🟥 gaps).
 *
 *   The editor's pre-concept containers — `WarningBlock`, `details`,
 *   `detailsSummary`, `detailsContent` — used to be mapped here. The editor
 *   now registers `concept_block` and its rows directly, so it never emits
 *   them and the conversion was dead code; it was deleted when the
 *   regenerated fixture in `_contracts/editor-vocabulary-diff.test.js`
 *   stopped listing them. That fixture is the signal, and it is the only one
 *   there is — no message announces it.
 *   - a colour that is not a named style (`textStyle` with a raw value), and
 *     `underline` — neither has a markdown form. `highlight` and the named
 *     styles (`accent`, `highlight`, `callout`, `muted`) ARE mapped, onto the
 *     `span` mark (`mapEditorMark`), and `strike` serializes as `~~text~~`.
 *     ⛔ This line listed all of them as awaiting a decision until 2026-10-14,
 *     long after the mapping shipped.
 *
 * Each unmapped construct reaches content-writer's serializer as-is and
 * is reported by the no-silent-drop guard (diagnostics.js) — never lost
 * silently.
 */

/**
 * The editor's `layout` on a table, as the vocabulary's `placement`: `wide`
 * takes the table out of the text column; `center`, the text column, is no
 * placement at all.
 */
const PLACEMENT_FOR_TABLE_LAYOUT = { wide: 'wide' }

/**
 * A table holding the editor's `layout`, with the vocabulary's `placement`
 * instead. A table that holds a placement already keeps it.
 * @returns {Object|null} the table, or null when it holds no `layout`
 */
function mapTableLayout(node) {
  const { layout, ...attrs } = node.attrs || {}
  if (layout === undefined) return null
  const placement = attrs.placement || PLACEMENT_FOR_TABLE_LAYOUT[layout]
  return { ...node, attrs: placement ? { ...attrs, placement } : attrs }
}

/**
 * Map a single node from editor dialect to framework dialect.
 * @returns {Object|null} a framework-dialect node, or null when there is
 *   no faithful mapping (the original node is then kept and reported by
 *   the serializer's no-silent-drop guard).
 */
function mapEditorNode(node) {
  switch (node.type) {
    case 'DividerBlock':
    case 'horizontalRule':
      return { type: 'divider', attrs: {} }
    case 'table':
      return mapTableLayout(node)
    case 'emoji':
      // The node carries the character alongside a name; the character is the
      // whole markdown form. Guarded rather than assumed to be populated.
      return node.attrs?.emoji ? { type: 'text', text: node.attrs.emoji } : null
    // A standalone "\n" text node is NOT mapped here, deliberately.
    //
    // It used to be: content-reader once spelled a hard break that way, and
    // this healed old documents onto the node form. The migration is done —
    // content-reader has emitted a `hardBreak` node for both markdown
    // spellings for some time, and no persisted document carries the legacy
    // form (confirmed 2026-07-26).
    //
    // Keeping the rule past that point made it wrong. content-reader still
    // produces a lone "\n" node, but for a SOFT break — a newline lands in
    // its own node whenever the spans on both sides are marked, as in
    // "`--heading` → `text-heading`" followed by another such line. Healing
    // that turned an ordinary wrapped line into a visible break: the sync
    // wrote a trailing "\", and the next read made it a real <br>, so the
    // page reflowed one round trip after the edit.
    default:
      return null
  }
}

/**
 * Recursively normalize one node: map it to the framework dialect (if it
 * is a recognized editor node with a faithful mapping), then normalize
 * its children. Nodes without a mapping pass through unchanged so any
 * editor-dialect descendants are still caught.
 */
/**
 * The editor's named inline styles, and the framework spelling of each.
 *
 * These are theme tokens, not colours. The editor's picker offers exactly this
 * closed set — the attribute is *named* `color` but holds a token, which its
 * extension renders as `var(--<token>)`. So they map onto the `span` mark the
 * framework already round-trips as `[text]{token}`, and nothing is lost.
 *
 * A value outside this set (a hex from a paste, until the editor gates its
 * `parseHTML`) is deliberately NOT mapped: it falls through to the
 * no-silent-drop guard rather than writing a raw colour into markdown, where
 * it would contradict the theming model and not survive a change of brand.
 */
const NAMED_INLINE_STYLES = new Set(['accent', 'highlight', 'callout', 'muted'])

/** A mark that carries nothing and should be removed rather than reported. */
const DROP_MARK = Symbol('drop-mark')

/**
 * Map an editor-dialect mark to the framework dialect.
 *
 * @param {Object} mark
 * @returns {Object|Symbol|null} a framework mark, `DROP_MARK` when the mark
 *   carries no styling at all, or null when there is no mapping (the original
 *   is kept and reported by the no-silent-drop guard)
 */
function mapEditorMark(mark) {
  if (mark?.type === 'highlight') {
    // Effectively boolean in the editor: its extension hardcodes the
    // background and ignores the attribute.
    return { type: 'span', attrs: { highlight: true } }
  }

  if (mark?.type === 'textStyle') {
    const token = mark.attrs?.color
    // The picker's "Normal" option. Nothing is being dropped, so reporting it
    // would be noise in a guard whose value depends on staying quiet.
    if (!token) return DROP_MARK
    if (!NAMED_INLINE_STYLES.has(token)) return null // a colour, not a token
    return { type: 'span', attrs: { [token]: true } }
  }

  return null
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return node

  let result = mapEditorNode(node) || node

  if (Array.isArray(result.marks) && result.marks.length) {
    // An unmapped mark is kept, so the no-silent-drop guard still reports it.
    result = {
      ...result,
      marks: result.marks.map(m => mapEditorMark(m) || m).filter(m => m !== DROP_MARK),
    }
  }

  if (Array.isArray(result.content)) {
    return { ...result, content: result.content.map(normalizeNode) }
  }
  return result
}

/**
 * Normalize an editor-dialect (or mixed-dialect) ProseMirror document to
 * the framework dialect that content-writer's serializers consume.
 * Idempotent on framework-dialect input.
 *
 * @param {Object} doc - ProseMirror document ({ type:'doc', content:[…] })
 * @returns {Object} a framework-dialect document
 */
export function normalizeDialect(doc) {
  if (!doc || !Array.isArray(doc.content)) return doc
  return { ...doc, content: doc.content.map(normalizeNode) }
}

/**
 * @fileoverview Editor-dialect → framework-dialect ProseMirror normalizer.
 *
 * Two ProseMirror dialects flow through Uniweb:
 *
 *   - the **framework-markdown dialect** that content-reader produces and
 *     content-writer's serializers are written against (`image` with a
 *     `role`, `divider`, `dataBlock`, `inset_ref`, marks `bold/italic/
 *     link/button/code/span`), and
 *   - the **editor (TipTap) dialect** (`ImageBlock`, `Video`,
 *     `UniwebIcon`/`Icon`, `DividerBlock`, `card-group`, `FormBlock`,
 *     `WarningBlock`, `details`, colour/highlight marks …).
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
 *   - `Video`      → `image{role:'video'}`  — only when a real media URL
 *                    is present (`src`)
 *   - `ImageBlock` → `image`                — only when a real URL is
 *                    present (`url`/`src`)
 *   - `UniwebIcon` → `image{role:'icon'}`   — only the `library`+`name`
 *                    form (`![](lib-name)`)
 *
 * ## What it deliberately does NOT map (left for the serializer's
 * no-silent-drop guard to report — a tracked capability gap)
 *
 *   - Media that carries only a structured asset identifier (no direct
 *     `url`/`src`) or an inline `svg` blob. Media references are written
 *     VERBATIM — the codec does not resolve or render; the kit Image/Video
 *     components resolve the reference at render time. The common case (a
 *     `url`/`src` on the node) is handled by writing it verbatim; an
 *     identifier-only node is the edge (carry it verbatim once its form is
 *     confirmed), and inline `svg` blobs hit the guard.
 *   - `FormBlock` — the editor node carries `activeSchemaId` + filled
 *     `data`; the framework `yaml:form` block carries a form *definition*.
 *     Different shapes; mapping needs a decision, not a guess.
 *   - `card-group`/`document-group`, `details`, `WarningBlock` — open
 *     mapping decisions (items vs insets; 🟥 gaps).
 *   - colour/highlight/strike/underline marks — need the named-inline-
 *     style convention decision.
 *
 * Each unmapped construct reaches content-writer's serializer as-is and
 * is reported by the no-silent-drop guard (diagnostics.js) — never lost
 * silently.
 */

/**
 * Editor-transient image attrs that have no on-disk markdown meaning and
 * are dropped by design (not data loss — they're editor UI/upload state
 * or layout hints the markdown form doesn't carry).
 */
const DROPPED_IMAGE_ATTRS = new Set([
  'url',
  'src',
  'info',
  'direction',
  'credit',
  'theme',
  'filter',
  'targetId',
  'contentId',
  'uploading',
  'uploadingObject',
  'loading_progress',
  'aspect_ratio',
])

/**
 * Markdown-meaningful image/media attrs we carry through, when present
 * with a real value. Mirrors content-reader's image schema + the media
 * attrs documented in content-structure.md (role/poster/href/etc.).
 */
const KEPT_IMAGE_ATTRS = [
  'alt',
  'caption',
  'href',
  'target',
  'width',
  'height',
  'loading',
  'poster',
  'preview',
  'autoplay',
  'muted',
  'loop',
  'controls',
  'fit',
  'position',
  'class',
  'id',
]

/** Pick the non-empty markdown-meaningful attrs from an editor image node. */
function keptImageAttrs(attrs) {
  const out = {}
  for (const key of KEPT_IMAGE_ATTRS) {
    const value = attrs[key]
    if (value === null || value === undefined || value === '') continue
    out[key] = value
  }
  return out
}

/**
 * Map an editor `ImageBlock` to a framework `image` node.
 * @returns {Object|null} framework image node, or null if unresolvable
 *   (identifier-only asset → leave for the guard to report).
 */
function mapImageBlock(node) {
  const attrs = node.attrs || {}
  const src = attrs.url || attrs.src
  if (!src) return null // identifier-only / not yet uploaded → can't resolve to a URL

  const out = { src, ...keptImageAttrs(attrs) }
  if (attrs.role && attrs.role !== 'image') out.role = attrs.role
  return { type: 'image', attrs: out }
}

/**
 * Map an editor `Video` to a framework `image{role:'video'}` node
 * (the framework expresses video as media-by-role; there is no Video
 * node by design).
 * @returns {Object|null}
 */
function mapVideo(node) {
  const attrs = node.attrs || {}
  const src = attrs.src
  if (!src) return null // identifier-only → asset channel, not a URL

  const out = { src, role: 'video', ...keptImageAttrs(attrs) }
  // The editor carries the poster as a coverImg object; only a real URL
  // (not an identifier) has a markdown home.
  const poster = attrs.coverImg?.src
  if (poster) out.poster = poster
  return { type: 'image', attrs: out }
}

/**
 * Map an editor `UniwebIcon` to a framework `image{role:'icon'}` node.
 * Only the `library`+`name` form (e.g. `![](lu-home)`) is mapped — an
 * inline `svg` blob or a bare `url` has no clean markdown home yet.
 * @returns {Object|null}
 */
function mapUniwebIcon(node) {
  const attrs = node.attrs || {}

  // The insert path stores a single colon-joined `family:id` name (built from
  // the icon CDN URL) and leaves `library` unset — so requiring both dropped
  // every icon the editor actually produces. The separate-attr form is kept
  // for content that already carries it.
  let { library, name } = attrs
  if (!library && typeof name === 'string' && name.includes(':')) {
    const [family, ...rest] = name.split(':')
    library = family
    name = rest.join(':')
  }
  if (!library || !name) return null

  const out = { role: 'icon', library, name }
  if (attrs.size) out.size = attrs.size
  if (attrs.color) out.color = attrs.color
  return { type: 'image', attrs: out }
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
    case 'ImageBlock':
      return mapImageBlock(node)
    case 'Video':
      return mapVideo(node)
    case 'UniwebIcon':
    case 'Icon':
      return mapUniwebIcon(node)
    case 'WarningBlock':
    case 'details':
      return EDITOR_CONTAINERS[node.type](node)
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

/**
 * Editor container nodes → the framework's `inset_block`, as an explicit table.
 *
 * Deliberately not derived from the node name. The editor's node is
 * `WarningBlock` while the component is `Alert`, and its `type` defaults to
 * `info` rather than `warning` — a name-derived mapping drops exactly that row,
 * which is how `mapUniwebIcon` came to lose every icon the editor produces. A
 * missing entry here is a visible gap rather than a silent assumption.
 */
const EDITOR_CONTAINERS = {
  // A callout's SEVERITY is the concept, not a parameter on one — a warning and
  // a note are different kinds of thing, so they are different tags. This is
  // where the editor's `type` attribute goes.
  WarningBlock: node => ({
    type: 'concept_block',
    attrs: { tag: node.attrs?.type || 'info' },
    content: asBlocks(node.content),
  }),
  // The summary becomes the leading HEADING rather than a paragraph, which is
  // what makes the mapping lossless in both directions: a concept block's items
  // come from its headings, so the summary recovers as that item's title and
  // the body as its paragraphs. Flattening it to a paragraph — what this did
  // while the target was an inset — made the two indistinguishable on the way
  // back.
  details: node => ({
    type: 'concept_block',
    attrs: { tag: 'details' },
    content: detailsBody(node),
  }),
}

/** Inline node types, for deciding whether a container's body needs wrapping. */
const INLINE_TYPES = new Set([
  'text',
  'hardBreak',
  'image',
  'math_inline',
  'inset_ref',
  'emoji',
  'UniwebIcon',
])

/**
 * A container body as block content.
 *
 * `WarningBlock` holds `text*` today and `block+` after the editor's widening,
 * so both shapes arrive here. Inline content is wrapped in one paragraph;
 * block content passes through.
 *
 * @param {Array} content
 * @returns {Array}
 */
function asBlocks(content) {
  if (!content?.length) return []
  return content.every(node => INLINE_TYPES.has(node.type))
    ? [{ type: 'paragraph', content }]
    : content
}

/**
 * Flatten the editor's `details` › `detailsSummary` + `detailsContent` into a
 * concept block's body, summary first — as a HEADING.
 *
 * The heading is what makes the mapping lossless. A concept block's items come
 * from its headings, so a summary written as `# …` recovers as that item's
 * title and the body as its paragraphs; written as a paragraph (which is what
 * this did while the target was an inset) the two become indistinguishable on
 * the way back, and a disclosure loses which half was its label.
 *
 * The summary stays inline content rather than moving to an attribute for the
 * original reason: `detailsSummary` can carry marks, and `summary="…"` would
 * flatten emphasis and links.
 *
 * @param {Object} node
 * @returns {Array}
 */
function detailsBody(node) {
  const body = []
  for (const child of node.content || []) {
    if (child.type === 'detailsSummary') {
      if (child.content?.length) {
        body.push({ type: 'heading', attrs: { level: 1 }, content: child.content })
      }
    } else if (child.type === 'detailsContent') body.push(...(child.content || []))
    else body.push(child)
  }
  return body
}

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

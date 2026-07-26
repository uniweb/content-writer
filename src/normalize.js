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
  if (!attrs.library || !attrs.name) return null

  const out = { role: 'icon', library: attrs.library, name: attrs.name }
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
      return mapUniwebIcon(node)
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
function normalizeNode(node) {
  if (!node || typeof node !== 'object') return node

  const result = mapEditorNode(node) || node

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

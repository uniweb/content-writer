/**
 * @fileoverview Serialize inline ProseMirror content (text nodes with marks) to markdown
 *
 * Handles mark interleaving, link/button/span wrapping, and bold/italic nesting.
 */

import { serializeAttributes } from './attributes.js'
import { decodeMarkupEntities } from './entities.js'
import { warnUnmappedMark, warnUnmappedNode } from './diagnostics.js'

/**
 * Marks the markdown serializer can represent. Any other mark on an
 * inline node has its styling dropped (the text is still emitted) and is
 * reported by the no-silent-drop guard — e.g. editor-dialect `highlight`,
 * `textStyle` (colour), `highlight`, `underline`, `uniqueID`, which need a
 * named-inline-style mapping decision.
 */
const KNOWN_MARKS = new Set(['bold', 'italic', 'code', 'strike', 'link', 'button', 'span'])

/** Report any inline mark we have no markdown form for (deduped per type). */
function reportUnknownMarks(content) {
  for (const node of content) {
    if (!node?.marks) continue
    for (const mark of node.marks) {
      if (!KNOWN_MARKS.has(mark.type)) warnUnmappedMark(mark.type)
    }
  }
}

/**
 * Check if two marks are the same (same type and same attrs for link/button/span).
 */
function marksEqual(a, b) {
  if (a.type !== b.type) return false
  if (a.type === 'link' || a.type === 'button' || a.type === 'span') {
    return JSON.stringify(a.attrs) === JSON.stringify(b.attrs)
  }
  return true
}

/**
 * Would `inner` on its own re-parse to exactly this link?
 *
 * An author who writes a bare `https://example.com` gets a link mark whose
 * href equals its text. Writing that back as `[https://example.com](https://example.com)`
 * is content-identical but rewrites the author's file — and content-writer is
 * what the editor uses to sync back to a developer's repository, so every save
 * would churn every bare URL in it.
 *
 * Kept deliberately narrow. The bare form is only emitted when the mark
 * carries nothing but an href, the text IS that href (or its address, for
 * mailto), and the URL is one GFM autolinking will recapture with the same
 * bounds: no whitespace or brackets, and no trailing punctuation, which
 * autolink detection excludes from the match. Anything else keeps the
 * explicit form, which is always correct if more verbose.
 */
const AUTOLINK_SAFE = /^[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]$/

function isBareAutolink(mark, inner) {
  const { href, title, ...rest } = mark.attrs || {}
  if (!href || title || Object.keys(rest).length > 0) return false
  if (href === inner) return /^https?:\/\//.test(href) && AUTOLINK_SAFE.test(href)
  if (href === `mailto:${inner}`) return AUTOLINK_SAFE.test(inner) && inner.includes('@')
  return false
}

/**
 * Serialize a link mark's suffix: (href "title"){attrs}
 */
function serializeLinkSuffix(mark) {
  const { href, title, ...rest } = mark.attrs || {}
  const titlePart = title ? ` "${title}"` : ''
  const attrStr = serializeAttributes(rest, ['href', 'title'])
  return `(${href}${titlePart})${attrStr}`
}

/**
 * Serialize a button mark's suffix: (button:href "title"){attrs}
 */
function serializeButtonSuffix(mark) {
  const { href, title, variant, ...rest } = mark.attrs || {}
  const titlePart = title ? ` "${title}"` : ''
  // Build attrs with variant first for consistent ordering
  const extraAttrs = {}
  if (variant && variant !== 'primary') {
    extraAttrs.variant = variant
  }
  Object.assign(extraAttrs, rest)
  const attrStr = serializeAttributes(extraAttrs, ['href', 'title'])
  return `(button:${href}${titlePart})${attrStr}`
}

/**
 * Serialize a span mark's suffix: {.class #id attrs}
 */
function serializeSpanSuffix(mark) {
  return serializeAttributes(mark.attrs || {})
}

/**
 * Serialize an inset_ref node (a foundation-component reference) back to
 * markdown. Shared by both the block path (the document-level node
 * serializer) and the inline path (mid-prose insets, cites, refs) so a
 * single definition stays the inverse of the content-reader parser.
 *
 *   visual  (the `!` form, default)  → ![label](@Component){attrs}
 *   text    (embedKind: 'text')      → [label](@Component){attrs}
 *   Cite/Ref text-inset with a key   → [@key] / [#id] {attrs}  (sigil shorthand)
 *
 * `label` is the reference key (keyed form) when present, else the alt
 * text. `component`/`embedKind`/`alt`/`key` are structural and consumed
 * here; everything else in attrs becomes curly-brace attributes.
 *
 * Visual is the parser's default (block.js treats `embedKind !== 'text'`
 * as visual, and the inset extractor omits the default), so the `!` is
 * emitted unless `embedKind` is explicitly `'text'`.
 */
export function serializeInsetRef(node) {
  const { component, embedKind, alt, key, ...rest } = node.attrs || {}
  const attrStr = serializeAttributes(rest)
  const isText = embedKind === 'text'

  // A keyed Cite/Ref text-inset round-trips to its sigil shorthand —
  // [@key] / [#id] — the cleanest canonical form and exactly what the
  // cite/ref tokenizers produce. (key already carries its @/# sigil.)
  if (isText && key && (component === 'Cite' || component === 'Ref')) {
    return `[${key}]${attrStr}`
  }

  const label = key ?? alt ?? ''
  const bang = isText ? '' : '!'
  return `${bang}[${label}](@${component})${attrStr}`
}

/**
 * Icon library short codes, mirroring content-reader's `ICON_FAMILIES_SHORT`.
 *
 * The two spellings are not interchangeable on the way back in: the reader
 * accepts `family:name` for ANY family but `family-name` only for a short
 * code, deliberately, so a dash form stays unambiguous against an ordinary
 * relative path. Emitting the dash form for a full family name produced
 * `![](lucide-star)`, which reads back as a plain image with
 * `src: "lucide-star"` — the icon destroyed, and stable in that state.
 */
const ICON_SHORT_CODES = new Set([
  'lu', 'hi', 'hi2', 'pi', 'tb', 'fi', 'bs', 'md', 'ai',
  'ri', 'si', 'io5', 'bi', 'vsc', 'wi', 'gi', 'fa', 'fa6',
])

/**
 * Spell an icon reference so the reader parses it back as an icon.
 * @param {string} library
 * @param {string} name
 * @returns {string}
 */
function iconRef(library, name) {
  return ICON_SHORT_CODES.has(library) ? `${library}-${name}` : `${library}:${name}`
}

/**
 * Serialize an inline image node (icon within a paragraph).
 */
function serializeInlineImage(node) {
  const { src, alt, caption, role, library, name, ...rest } = node.attrs || {}

  // Icon with library+name → dash for a short code, colon otherwise
  if (library && name) {
    const iconSrc = iconRef(library, name)
    const extraAttrs = { ...rest }
    // Remove icon-derived attrs from extra attrs
    delete extraAttrs.size
    delete extraAttrs.color
    // Add back size and color if they exist
    if (node.attrs.size) extraAttrs.size = node.attrs.size
    if (node.attrs.color) extraAttrs.color = node.attrs.color
    const attrStr = serializeAttributes(extraAttrs)
    const altPart = alt || ''
    return `![${altPart}](${iconSrc})${attrStr}`
  }

  // Icon with src and role=icon → icon:src prefix
  if (role === 'icon' && src) {
    const attrStr = serializeAttributes(rest, ['role'])
    const altPart = alt || ''
    const captionPart = caption ? ` "${caption}"` : ''
    return `![${altPart}](icon:${src}${captionPart})${attrStr}`
  }

  // Regular image (shouldn't normally appear inline, but handle it)
  return serializeBlockImage(node)
}

/**
 * Serialize a block-level image node.
 */
export function serializeBlockImage(node) {
  const { src, alt, caption, role, library, name, ...rest } = node.attrs || {}

  // Icon with library+name → dash for a short code, colon otherwise
  if (library && name) {
    const iconSrc = iconRef(library, name)
    const extraAttrs = { ...rest }
    const attrStr = serializeAttributes(extraAttrs)
    const altPart = alt || ''
    return `![${altPart}](${iconSrc})${attrStr}`
  }

  // Build the src part
  let srcPart = src || ''

  // For non-default roles, use role:src prefix format (except for video/pdf which use attrs)
  // Build attrs with role first for consistent ordering
  const attrsToSerialize = {}
  if (role && role !== 'image') {
    if (role === 'icon' && src) {
      srcPart = `icon:${src}`
    } else {
      attrsToSerialize.role = role
    }
  }
  Object.assign(attrsToSerialize, rest)

  const altPart = alt || ''
  const captionPart = caption ? ` "${caption}"` : ''
  const attrStr = serializeAttributes(attrsToSerialize)
  return `![${altPart}](${srcPart}${captionPart})${attrStr}`
}

/**
 * Serialize an array of inline ProseMirror nodes to a markdown string.
 *
 * @param {Array} content - Array of text/image nodes with optional marks
 * @returns {string} Markdown string
 */
export function serializeInlineContent(content) {
  if (!content || content.length === 0) return ''

  // No silent drops: flag any mark we can't represent before serializing.
  reportUnknownMarks(content)

  return serializeRuns(content)
}

/**
 * Serialize a run of inline nodes, honoring mark nesting.
 *
 * `node.marks` is **ordered, innermost first** — the reader records which mark
 * the author wrapped around which. `**\`x\`**` gives `[code, bold]`;
 * `[**x**](url)` gives `[bold, link]`; `**[x](url)**` gives `[link, bold]`.
 * The semantic parser already reads that order (it renders
 * `<strong><code>x</code></strong>`), and this serializer now does too.
 *
 * The algorithm is one rule applied recursively: take the OUTERMOST mark of
 * the first node, absorb every following node that shares it, strip that one
 * mark from the group, recurse, then wrap the result once.
 *
 * Absorbing the neighbours is what keeps a mark that spans several nodes from
 * being re-emitted around each of them. `**Preview with \`pnpm dev\`.**` is
 * three text nodes — `[bold]`, `[code, bold]`, `[bold]` — and wrapping each
 * separately produced the invalid `**Preview with **\`pnpm dev\`**.**`.
 *
 * @param {Array} nodes - Inline nodes
 * @returns {string} Markdown string
 */
function serializeRuns(nodes) {
  const out = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]
    const outer = node.type === 'text' ? outermostMark(node) : null

    if (!outer) {
      out.push(serializePlainNode(node))
      i++
      continue
    }

    // Absorb the consecutive text nodes wrapped by this same mark.
    const group = []
    let j = i
    while (j < nodes.length && nodes[j].type === 'text') {
      const candidate = outermostMark(nodes[j])
      if (!candidate || !marksEqual(candidate, outer)) break
      group.push(withoutOutermostMark(nodes[j]))
      j++
    }

    out.push(applyMark(serializeRuns(group), outer))
    i = j
  }

  return out.join('')
}

/**
 * The mark an author wrapped outermost — the last entry, since marks are
 * ordered innermost first.
 *
 * @param {Object} node
 * @returns {Object|null}
 */
function outermostMark(node) {
  const marks = node.marks || []
  return marks.length ? marks[marks.length - 1] : null
}

/**
 * The same node with its outermost mark peeled off.
 * @param {Object} node
 * @returns {Object}
 */
function withoutOutermostMark(node) {
  return { ...node, marks: (node.marks || []).slice(0, -1) }
}

/**
 * Wrap already-serialized inner markdown in one mark.
 *
 * A mark with no markdown form leaves the text alone — the no-silent-drop
 * guard has already reported it.
 *
 * @param {string} inner - Serialized inner content
 * @param {Object} mark
 * @returns {string}
 */
function applyMark(inner, mark) {
  switch (mark.type) {
    case 'code':
      // Leaving HTML-land: a code span is the one place the reader leaves
      // `&lt;`/`&gt;` escaped (see entities.js).
      return serializeCodeSpan(decodeMarkupEntities(inner))
    case 'bold':
      return `**${inner}**`
    case 'italic':
      return `*${inner}*`
    case 'strike':
      // GFM. The editor's strike mark is author-reachable (input rule, paste
      // rule, Mod-Shift-s) and had no markdown form, so it was dropped.
      return `~~${inner}~~`
    case 'link':
      return isBareAutolink(mark, inner) ? inner : `[${inner}]${serializeLinkSuffix(mark)}`
    case 'button':
      return `[${inner}]${serializeButtonSuffix(mark)}`
    case 'span':
      return `[${inner}]${serializeSpanSuffix(mark)}`
    default:
      return inner
  }
}

/**
 * Serialize a plain node (no wrapping mark).
 */
function serializePlainNode(node) {
  if (node.type === 'image') {
    return serializeInlineImage(node)
  }
  if (node.type === 'inset_ref') {
    return serializeInsetRef(node)
  }
  if (node.type === 'math_inline') {
    const latex = node.attrs?.latex || ''
    return node.attrs?.display ? '$$' + latex + '$$' : '$' + latex + '$'
  }
  if (node.type === 'hardBreak') {
    // Backslash rather than the two-trailing-spaces spelling: it survives
    // editors, formatters and pre-commit hooks that strip trailing whitespace,
    // and it is visible in a diff. Both spellings read back as a hard break.
    return '\\\n'
  }
  if (node.type !== 'text') {
    // No silent drops: an inline node we have no markdown form for is
    // still omitted (we can't invent one) but reported loudly, the same
    // contract the block path follows.
    warnUnmappedNode(node)
    return ''
  }
  return serializeTextWithMarks(node.text, node.marks || [])
}

/**
 * Wrap text in code-span backticks, picking a delimiter it can survive.
 *
 * A code span holding backticks needs a longer run to delimit it, and one
 * that begins or ends with a backtick needs a padding space (the parser
 * strips exactly one from each end). A single backtick emitted regardless
 * mangles anything documenting markdown itself — `` ` ```math ` `` came back
 * as ` ````math` `, which is a different, broken span.
 *
 * @param {string} text - Code span content
 * @returns {string} The delimited span
 */
function serializeCodeSpan(text) {
  const content = String(text)
  const runs = (content.match(/`+/g) || []).map(run => run.length)

  // The shortest run length not already present, so the delimiter is
  // unambiguous — CommonMark matches on equal-length runs.
  let width = 1
  while (runs.includes(width)) width++
  const fence = '`'.repeat(width)

  // A leading or trailing backtick would fuse with the delimiter.
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : ''

  return `${fence}${pad}${content}${pad}${fence}`
}

/**
 * Serialize one text node's own marks, innermost first.
 *
 * Only reached for a lone node — `serializeRuns` handles anything that shares
 * a mark with its neighbours.
 */
function serializeTextWithMarks(text, marks) {
  if (!marks || marks.length === 0) return text
  return marks.reduce((inner, mark) => applyMark(inner, mark), text)
}

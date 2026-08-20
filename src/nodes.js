/**
 * @fileoverview Block-level node serializers
 *
 * Each function takes a ProseMirror node and returns a markdown string.
 */

import yaml from 'js-yaml'
import { serializeInlineContent, serializeBlockImage, serializeInsetRef } from './marks.js'
import { serializeAttributes } from './attributes.js'

// inset_ref serialization is shared with the inline path; it lives in
// marks.js (alongside the other inline-attribute serializers) and is
// re-exported here so the document-level node serializer can register it.
export { serializeInsetRef }

/**
 * Serialize a heading node.
 * @param {Object} node - Heading node with attrs.level and content
 * @returns {string} Markdown heading
 */
export function serializeHeading(node) {
  const prefix = '#'.repeat(node.attrs?.level || 1)
  const text = serializeInlineContent(node.content)
  // A `#>` label line (pretitle). The hash count carries the authored
  // spelling only — `#>` and `##>` mean the same thing — so emitting the
  // stored level keeps the file byte-identical through a round-trip.
  if (node.attrs?.role === 'pretitle') {
    return `${prefix}> ${text}`
  }
  return `${prefix} ${text}`
}

/**
 * Serialize a paragraph node.
 * @param {Object} node - Paragraph node with content
 * @returns {string} Markdown paragraph text
 */
export function serializeParagraph(node) {
  return serializeInlineContent(node.content)
}

/**
 * Serialize an image node (block-level).
 * @param {Object} node - Image node with attrs
 * @returns {string} Markdown image
 */
export function serializeImage(node) {
  return serializeBlockImage(node)
}

/**
 * Serialize a code block node.
 * @param {Object} node - Code block node with attrs.language and content
 * @returns {string} Fenced code block
 */
export function serializeCodeBlock(node) {
  const lang = node.attrs?.language || ''
  const tag = node.attrs?.tag ? `:${node.attrs.tag}` : ''
  const text = node.content?.[0]?.text || ''
  const fence = '`'.repeat(fenceWidthFor(text))
  return `${fence}${lang}${tag}\n${text}\n${fence}`
}

/**
 * How many backticks this content needs as a fence.
 *
 * A fence must be longer than the longest backtick run inside it, or the
 * block ends early — which is why documentation that shows fenced markdown
 * is itself fenced in four backticks. Emitting three unconditionally
 * truncated those blocks and spilled their remainder into the page as prose.
 *
 * @param {string} text - The code block's content
 * @returns {number} Fence length, never fewer than three
 */
function fenceWidthFor(text) {
  const runs = String(text).match(/`+/g) || []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  return Math.max(3, longest + 1)
}

/**
 * Serialize a display-math node back to markdown.
 *
 * Labeled math (with an id) always uses the fenced form `` ```math:<id> ``
 * because `$$...$$` has no label syntax.
 *
 * Single-line LaTeX uses `$$...$$` (compact, ecosystem-standard).
 * Multi-line LaTeX uses fenced ```math (friendlier diffs, no ambiguity
 * with paragraphs that contain a stray `$$`).
 *
 * @param {Object} node - math_display node with attrs.latex and optional attrs.id
 * @returns {string} Markdown math block
 */
export function serializeMathDisplay(node) {
  const latex = node.attrs?.latex || ''
  const id = node.attrs?.id
  if (id) {
    return '```math:' + id + '\n' + latex + '\n```'
  }
  return latex.includes('\n')
    ? '```math\n' + latex + '\n```'
    : '$$' + latex + '$$'
}

/**
 * Serialize a container node back to its fence.
 *
 * The inverse of content-reader's `@Component{params}` fence. The info string
 * is the inset's own token, so a container is byte-for-byte the block form of
 * an inset — same concept, two levels.
 *
 * The fence widens past any backtick run in the body, which is what lets a
 * container hold a code sample: `fenceWidthFor` is the same computation the
 * plain code-block path uses.
 *
 * @param {Object} node - inset_block node with attrs.component + params
 * @returns {string} Fenced container
 */
export function serializeInsetBlock(node) {
  const { component, ...params } = node.attrs || {}
  if (!component) return ''

  const { serializeNode } = await_serializer()
  const body = (node.content || [])
    .map(child => serializeNode(child))
    .filter(Boolean)
    .join('\n\n')

  const fence = '`'.repeat(fenceWidthFor(body))
  const attrStr = serializeAttributes(params)

  return `${fence}@${component}${attrStr}\n${body}\n${fence}`
}

/**
 * Serialize a concept block back to its ```md:<tag> fence.
 *
 * The inverse of content-reader's concept-block branch. The body is real block
 * content, so it serializes through the ordinary node path — a concept block is
 * the section pipeline one level down, and its body is markdown at both ends.
 *
 * The fence widens past any backtick run in the body, for the same reason a
 * container's does: an answer that shows a code sample is ordinary
 * documentation, and a three-backtick fence would close on the sample's own
 * fence and spill the remainder into the page as prose.
 *
 * A missing serializer here is not a cosmetic gap. `serializeNode` omits an
 * unmapped node, so the whole block — the author's prose with it — would
 * vanish from the file on the next write-back and from the per-page markdown
 * projection. That is why the round-trip test asserts the BODY rather than
 * just the fence line.
 *
 * @param {Object} node - concept_block node with attrs.tag + block content
 * @returns {string} Fenced concept block
 */
export function serializeConceptBlock(node) {
  const { tag, syntax } = node.attrs || {}
  if (!tag) return ''

  const { serializeNode } = await_serializer()
  const body = (node.content || [])
    .map(child => serializeNode(child))
    .filter(Boolean)
    .join('\n\n')

  // Write back the spelling the author wrote. One node, two surfaces — a
  // ```md:<tag> fence and GitHub's `> [!WARNING]` — and `syntax` is how the
  // reader records which. Normalizing instead would rewrite someone's file on
  // the next editor sync, which is exactly what `dataBlock.language` was added
  // to stop when a ```yaml block came back as ```json.
  if (syntax === 'gfm') {
    // Every line of a blockquote carries its own marker, including the blank
    // ones between blocks — a bare `>` rather than `> ` so no trailing space
    // is written into the author's file.
    const quoted = body
      .split('\n')
      .map(line => (line ? `> ${line}` : '>'))
      .join('\n')
    return `> [!${tag.toUpperCase()}]\n${quoted}`
  }

  const fence = '`'.repeat(fenceWidthFor(body))

  return `${fence}md:${tag}\n${body}\n${fence}`
}

/**
 * Serialize a data block node.
 *
 * Emits the serialization the author wrote, which `attrs.language` records.
 * This used to hardcode JSON, so a ```yaml:nav block came back as ```json:nav
 * — same data, rewritten source, on every editor sync.
 *
 * **YAML is the fallback when `language` is absent**, not JSON. A node without
 * it predates the reader recording it, and YAML is both the form the docs
 * teach and the friendlier one to leave in someone's file; JSON is still
 * emitted whenever it is what the author actually chose.
 *
 * @param {Object} node - Data block node with attrs.tag, attrs.data, attrs.language
 * @returns {string} Tagged fenced code block with serialized data
 */
export function serializeDataBlock(node) {
  const { tag, data, language } = node.attrs || {}

  if ((language || '').toLowerCase() === 'json') {
    return `\`\`\`json:${tag}\n${JSON.stringify(data, null, 2)}\n\`\`\``
  }

  // `yaml` and `yml` are both valid fences; echo back whichever was written.
  const fence = language || 'yaml'
  const serialized = yaml
    .dump(data, {
      lineWidth: -1, // Don't wrap long lines
      quotingType: "'", // Use single quotes when quoting is needed
      forceQuotes: false, // Only quote when necessary
      noRefs: true, // Don't use YAML references
    })
    .trimEnd()

  return `\`\`\`${fence}:${tag}\n${serialized}\n\`\`\``
}

/**
 * Serialize a blockquote node.
 * @param {Object} node - Blockquote node with content
 * @returns {string} Blockquote with > prefix
 */
export function serializeBlockquote(node) {
  if (!node.content) return '>'

  // Recursively serialize the blockquote's content
  const { serializeNode } = await_serializer()
  const innerLines = node.content
    .map(child => serializeNode(child))
    .filter(Boolean)
    .join('\n\n')

  return innerLines
    .split('\n')
    .map(line => line ? `> ${line}` : '>')
    .join('\n')
}

/**
 * Serialize a bullet list node.
 *
 * `pad` is the literal indentation this list sits at — the parent item's
 * CONTENT COLUMN, not a level count. See serializeListItem for why.
 *
 * @param {Object} node - Bullet list node with content (listItem nodes)
 * @param {string} [pad=''] - Indentation prefix for every marker in this list
 * @returns {string} Markdown bullet list
 */
export function serializeBulletList(node, pad = '') {
  if (!node.content) return ''
  return node.content
    .map(item => serializeListItem(item, `${pad}- `, isLoose(node)))
    .join(itemSeparator(node))
}

/**
 * Serialize an ordered list node.
 *
 * `pad` is the literal indentation this list sits at — see serializeBulletList.
 *
 * @param {Object} node - Ordered list node with attrs.start and content
 * @param {string} [pad=''] - Indentation prefix for every marker in this list
 * @returns {string} Markdown ordered list
 */
export function serializeOrderedList(node, pad = '') {
  if (!node.content) return ''
  const start = node.attrs?.start || 1
  return node.content
    .map((item, i) => serializeListItem(item, `${pad}${start + i}. `, isLoose(node)))
    .join(itemSeparator(node))
}

/**
 * What goes between two list items.
 *
 * A loose list — one the author spaced out with blank lines — keeps that
 * spacing. `attrs.loose` is recorded by content-reader; a list without it is
 * tight, which is both the common case and the safe default for documents
 * written before the flag existed.
 *
 * @param {Object} node - A bulletList or orderedList node
 * @returns {string}
 */
function itemSeparator(node) {
  return isLoose(node) ? '\n\n' : '\n'
}

/**
 * Did the author space this list out?
 * @param {Object} node - A bulletList or orderedList node
 * @returns {boolean}
 */
function isLoose(node) {
  return Boolean(node.attrs?.loose)
}

/**
 * Serialize a list item.
 *
 * A nested list is indented to this item's CONTENT COLUMN — `bullet.length` —
 * not by a fixed two spaces per level. The marker's width varies (`- ` is 2,
 * `9. ` is 3, `10. ` is 4), and a child indented less than the parent's
 * content column is not a child at all: markdown reads it as ending the
 * outer list. That is a source-corrupting bug, not a cosmetic one — a
 * three-item ordered list with a nested bullet list came back as three
 * separate top-level nodes.
 *
 * `pad` already computes that column for every other block in the item; nested
 * lists now use the same value instead of their own count.
 *
 * @param {Object} node - List item node with content
 * @param {string} bullet - The bullet prefix (e.g., "- " or "1. ")
 * @param {boolean} [loose=false] - Whether the parent list is loose
 * @returns {string} Markdown list item
 */
function serializeListItem(node, bullet, loose = false) {
  if (!node.content) return bullet

  const parts = []
  const pad = ' '.repeat(bullet.length)

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i]

    // Nested lists carry their own indentation.
    if (child.type === 'bulletList') {
      parts.push(serializeBulletList(child, pad))
      continue
    }
    if (child.type === 'orderedList') {
      parts.push(serializeOrderedList(child, pad))
      continue
    }

    // Anything else is an ordinary block. A paragraph is inline content; a
    // code block, blockquote or table goes through the node serializer, the
    // same way a blockquote's children do. Every one of those used to fall
    // off the end of this loop and be dropped without a trace.
    const text =
      child.type === 'paragraph'
        ? serializeInlineContent(child.content)
        : await_serializer().serializeNode(child) || ''

    parts.push(indentBlock(text, i === 0 ? bullet : pad, pad))
  }

  // In a loose list the item's own blocks are blank-line separated too — the
  // spacing is a property of the whole list, not just the gaps between items.
  return parts.join(loose ? '\n\n' : '\n')
}

/**
 * Place a block's lines inside a list item.
 *
 * The first line carries the bullet (or aligns under it, for a block that is
 * not the item's opening one); every later line aligns under the bullet so it
 * stays part of the item instead of ending the list.
 *
 * @param {string} text - Serialized block, possibly multi-line
 * @param {string} firstPrefix - Prefix for the first line
 * @param {string} pad - Prefix for continuation lines
 * @returns {string}
 */
function indentBlock(text, firstPrefix, pad) {
  const [first = '', ...rest] = String(text).split('\n')
  const head = firstPrefix + first
  if (rest.length === 0) return head
  return [head, ...rest.map(line => (line ? pad + line : ''))].join('\n')
}

/**
 * Serialize a divider node.
 *
 * Emits the attribute spelling only when `type` carries a non-default value, so
 * an ordinary rule stays `---` and no existing document is rewritten. `style` and
 * `size` are deliberately NOT emitted: they are dead attrs (nothing reads them,
 * no spelling sets them) and writing them would put vocabulary into every
 * author's file that the framework is trying to retire.
 *
 * @param {Object} [node] - Divider node
 * @returns {string} Markdown thematic break, with `{type=…}` when meaningful
 */
export function serializeDivider(node) {
  const type = node?.attrs?.type
  if (typeof type === 'string' && type && type !== 'hr') {
    return `---{type=${type}}`
  }
  return '---'
}

/**
 * Serialize a table node.
 * @param {Object} node - Table node with content (tableRow nodes)
 * @returns {string} GFM table
 */
export function serializeTable(node) {
  if (!node.content || node.content.length === 0) return ''

  const rows = node.content
  const headerRow = rows[0]
  // A row with no cells is legal ProseMirror — `tableRow` is
  // `(tableCell | tableHeader)*`, a star — and PM's toJSON omits `content`
  // entirely for an empty node. Reading it unguarded threw.
  const cellsOf = row => row?.content ?? []
  const bodyRows = rows.slice(1)

  // Serialize header cells
  const headerCells = cellsOf(headerRow).map(cell => serializeTableCell(cell))

  // Build alignment row from header cell attrs
  const alignments = cellsOf(headerRow).map(cell => {
    const align = cell.attrs?.align
    if (align === 'left') return ':---'
    if (align === 'center') return ':---:'
    if (align === 'right') return '---:'
    return '---'
  })

  // Serialize body rows
  const bodyLines = bodyRows.map(row =>
    '| ' + cellsOf(row).map(cell => serializeTableCell(cell)).join(' | ') + ' |'
  )

  const headerLine = '| ' + headerCells.join(' | ') + ' |'
  const alignLine = '| ' + alignments.join(' | ') + ' |'

  return [headerLine, alignLine, ...bodyLines].join('\n')
}

/**
 * Serialize a table cell's content.
 * @param {Object} cell - Table cell node
 * @returns {string} Cell content as inline markdown
 */
function serializeTableCell(cell) {
  if (!cell.content) return ''
  // Table cells contain paragraphs; serialize their inline content
  const text = cell.content
    .map(child => {
      if (child.type === 'paragraph') {
        return serializeInlineContent(child.content)
      }
      return ''
    })
    .join(' ')

  return escapeTableCell(text)
}

/**
 * Escape the one character a table cell cannot contain literally.
 *
 * A pipe inside a cell ends it, so markdown spells a literal one `\|` and the
 * parser hands back the unescaped character. Writing that back out unescaped
 * splits the cell and shifts every column after it — the table silently gains
 * a column and stops lining up with its header.
 *
 * Only the pipe needs this: the cell's other content has already been through
 * the inline serializers, and a row is a single line by construction.
 *
 * @param {string} text - Serialized inline content of one cell
 * @returns {string}
 */
function escapeTableCell(text) {
  // Leave an already-escaped pipe alone rather than doubling its backslash.
  return text.replace(/\\?\|/g, '\\|')
}

// Lazy reference to serializeNode to handle circular dependency with blockquote
let _serializeNode = null
function await_serializer() {
  if (!_serializeNode) {
    throw new Error('Serializer not initialized — call setSerializer() first')
  }
  return { serializeNode: _serializeNode }
}

/**
 * Set the serializer reference for recursive node serialization (blockquotes).
 * @param {Function} fn - The serializeNode function from serializer.js
 */
export function setSerializer(fn) {
  _serializeNode = fn
}

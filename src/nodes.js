/**
 * @fileoverview Block-level node serializers
 *
 * Each function takes a ProseMirror node and returns a markdown string.
 */

import yaml from 'js-yaml'
import { serializeInlineContent, serializeBlockImage, serializeInsetRef } from './marks.js'

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
 * @param {Object} node - Bullet list node with content (listItem nodes)
 * @param {number} [indent=0] - Indentation level
 * @returns {string} Markdown bullet list
 */
export function serializeBulletList(node, indent = 0) {
  if (!node.content) return ''
  const prefix = '  '.repeat(indent)
  return node.content
    .map(item => serializeListItem(item, `${prefix}- `, indent, isLoose(node)))
    .join(itemSeparator(node))
}

/**
 * Serialize an ordered list node.
 * @param {Object} node - Ordered list node with attrs.start and content
 * @param {number} [indent=0] - Indentation level
 * @returns {string} Markdown ordered list
 */
export function serializeOrderedList(node, indent = 0) {
  if (!node.content) return ''
  const start = node.attrs?.start || 1
  const prefix = '  '.repeat(indent)
  return node.content
    .map((item, i) => serializeListItem(item, `${prefix}${start + i}. `, indent, isLoose(node)))
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
 * @param {Object} node - List item node with content
 * @param {string} bullet - The bullet prefix (e.g., "- " or "1. ")
 * @param {number} indent - Current indentation level
 * @param {boolean} [loose=false] - Whether the parent list is loose
 * @returns {string} Markdown list item
 */
function serializeListItem(node, bullet, indent, loose = false) {
  if (!node.content) return bullet

  const parts = []

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i]

    if (i === 0 && child.type === 'paragraph') {
      // First child paragraph is the item text
      parts.push(bullet + serializeInlineContent(child.content))
    } else if (child.type === 'bulletList') {
      parts.push(serializeBulletList(child, indent + 1))
    } else if (child.type === 'orderedList') {
      parts.push(serializeOrderedList(child, indent + 1))
    } else if (child.type === 'paragraph') {
      // Additional paragraphs in the same list item
      const pad = ' '.repeat(bullet.length)
      parts.push(pad + serializeInlineContent(child.content))
    }
  }

  // In a loose list the item's own blocks are blank-line separated too — the
  // spacing is a property of the whole list, not just the gaps between items.
  return parts.join(loose ? '\n\n' : '\n')
}

/**
 * Serialize a divider node.
 * @returns {string} Markdown horizontal rule
 */
export function serializeDivider() {
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
  const bodyRows = rows.slice(1)

  // Serialize header cells
  const headerCells = headerRow.content.map(cell => serializeTableCell(cell))

  // Build alignment row from header cell attrs
  const alignments = headerRow.content.map(cell => {
    const align = cell.attrs?.align
    if (align === 'left') return ':---'
    if (align === 'center') return ':---:'
    if (align === 'right') return '---:'
    return '---'
  })

  // Serialize body rows
  const bodyLines = bodyRows.map(row =>
    '| ' + row.content.map(cell => serializeTableCell(cell)).join(' | ') + ' |'
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

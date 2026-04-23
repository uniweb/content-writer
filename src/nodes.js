/**
 * @fileoverview Block-level node serializers
 *
 * Each function takes a ProseMirror node and returns a markdown string.
 */

import { serializeInlineContent, serializeBlockImage } from './marks.js'
import { serializeAttributes } from './attributes.js'

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
 * Serialize an inset_ref node (component reference).
 * @param {Object} node - Inset ref node with attrs.component
 * @returns {string} Markdown component reference
 */
export function serializeInsetRef(node) {
  const { component, alt, ...rest } = node.attrs || {}
  const altPart = alt || ''
  const attrStr = serializeAttributes(rest)
  return `![${altPart}](@${component})${attrStr}`
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
  return `\`\`\`${lang}${tag}\n${text}\n\`\`\``
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
 * @param {Object} node - Data block node with attrs.tag and attrs.data
 * @returns {string} Tagged fenced code block with serialized data
 */
export function serializeDataBlock(node) {
  const { tag, data } = node.attrs || {}
  const serialized = JSON.stringify(data, null, 2)
  return `\`\`\`json:${tag}\n${serialized}\n\`\`\``
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
    .map(item => serializeListItem(item, `${prefix}- `, indent))
    .join('\n')
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
    .map((item, i) => serializeListItem(item, `${prefix}${start + i}. `, indent))
    .join('\n')
}

/**
 * Serialize a list item.
 * @param {Object} node - List item node with content
 * @param {string} bullet - The bullet prefix (e.g., "- " or "1. ")
 * @param {number} indent - Current indentation level
 * @returns {string} Markdown list item
 */
function serializeListItem(node, bullet, indent) {
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

  return parts.join('\n')
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
  return cell.content
    .map(child => {
      if (child.type === 'paragraph') {
        return serializeInlineContent(child.content)
      }
      return ''
    })
    .join(' ')
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

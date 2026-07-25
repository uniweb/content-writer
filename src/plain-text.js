/**
 * @fileoverview Convert ProseMirror documents to plain text
 *
 * Strips all markdown formatting, returning just the text content
 * with newlines for structure. Useful for word counting, search
 * indexing, and generating summaries.
 *
 * "Plain" is meant literally: PM text nodes carry HTML (see `entities.js`),
 * so every text run is stripped of raw inline tags and its entities resolved
 * to the characters a reader would see. Without that, a summary can ship
 * `&lt;` or a stray `<span>` into whatever consumes it.
 */

import { toPlainCharacters } from './entities.js'

/**
 * Extract plain text from a ProseMirror document.
 *
 * @param {Object} doc - ProseMirror document ({ type: "doc", content: [...] })
 * @returns {string} Plain text with newlines between blocks
 */
export function docToPlainText(doc) {
  if (!doc?.content) return ''

  return doc.content
    .map(node => nodeToPlainText(node))
    .filter(s => s !== '')
    .join('\n\n')
}

/**
 * Summarize a ProseMirror document in one sentence-ish line.
 *
 * Reads the document's **first paragraph**, not the whole document: pages
 * routinely open with an `# H1`, and `docToPlainText` would hand back that
 * title as the summary. A page with no paragraph at the top level returns
 * `''` — callers are expected to have an authored fallback.
 *
 * The result is plain characters (tags stripped, entities resolved), so
 * truncating on a sentence boundary lands on a real sentence boundary
 * rather than somewhere inside a tag or an entity.
 *
 * @param {Object} doc - ProseMirror document
 * @param {Object} [options]
 * @param {number} [options.maxChars=200] - Soft upper bound on the result
 * @returns {string} A single-line summary, or '' when there is nothing to say
 */
export function docSummaryText(doc, { maxChars = 200 } = {}) {
  if (!doc?.content) return ''

  let text = ''
  for (const node of doc.content) {
    if (node.type !== 'paragraph') continue
    text = inlineToPlainText(node.content).trim()
    if (text) break
  }
  if (!text) return ''

  // Collapse internal whitespace — a summary is one line.
  text = text.replace(/\s+/g, ' ')

  return truncateAtSentence(text, maxChars)
}

/**
 * Trim to `maxChars`, preferring a sentence boundary, then a word boundary.
 *
 * @param {string} text - Already-collapsed plain text
 * @param {number} maxChars
 * @returns {string}
 */
function truncateAtSentence(text, maxChars) {
  if (text.length <= maxChars) return text

  const window = text.slice(0, maxChars)

  // A sentence end is terminal punctuation followed by whitespace — so
  // "5 minutes." ends a sentence but the dot in "site.yml" does not. Take the
  // last one in the window, to keep as much of the paragraph as fits.
  const ends = [...window.matchAll(/[.!?](?=\s|$)/g)]
  const lastEnd = ends.length ? ends[ends.length - 1].index : -1
  if (lastEnd > 0) return window.slice(0, lastEnd + 1)

  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window
  return `${cut.replace(/[,;:—–-]$/, '').trimEnd()}…`
}

/**
 * Extract plain text from a single ProseMirror node.
 * @param {Object} node
 * @returns {string}
 */
function nodeToPlainText(node) {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
      return inlineToPlainText(node.content)

    case 'codeBlock':
      return node.content?.[0]?.text || ''

    case 'blockquote':
      if (!node.content) return ''
      return node.content
        .map(child => nodeToPlainText(child))
        .filter(Boolean)
        .join('\n\n')

    case 'bulletList':
    case 'orderedList':
      return listToPlainText(node)

    case 'table':
      return tableToPlainText(node)

    case 'dataBlock':
    case 'divider':
    case 'image':
    case 'inset_ref':
      return ''

    default:
      return ''
  }
}

/**
 * Extract plain text from inline content (array of text/image nodes).
 * @param {Array} content
 * @returns {string}
 */
function inlineToPlainText(content) {
  if (!content) return ''
  return toPlainCharacters(
    content
      .filter(node => node.type === 'text')
      .map(node => node.text || '')
      .join('')
  )
}

/**
 * Extract plain text from a list node.
 * @param {Object} node - bulletList or orderedList
 * @returns {string}
 */
function listToPlainText(node) {
  if (!node.content) return ''
  return node.content
    .map(item => listItemToPlainText(item))
    .filter(Boolean)
    .join('\n')
}

/**
 * Extract plain text from a list item.
 * @param {Object} node - listItem node
 * @returns {string}
 */
function listItemToPlainText(node) {
  if (!node.content) return ''
  return node.content
    .map(child => {
      if (child.type === 'paragraph') return inlineToPlainText(child.content)
      if (child.type === 'bulletList' || child.type === 'orderedList') return listToPlainText(child)
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Extract plain text from a table node.
 * @param {Object} node - table node
 * @returns {string}
 */
function tableToPlainText(node) {
  if (!node.content) return ''
  return node.content
    .map(row => {
      if (!row.content) return ''
      return row.content
        .map(cell => inlineToPlainText(cell.content?.[0]?.type === 'paragraph' ? cell.content[0].content : null))
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
    .join('\n')
}

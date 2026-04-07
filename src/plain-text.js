/**
 * @fileoverview Convert ProseMirror documents to plain text
 *
 * Strips all markdown formatting, returning just the text content
 * with newlines for structure. Useful for word counting, search
 * indexing, and generating summaries.
 */

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
  return content
    .filter(node => node.type === 'text')
    .map(node => node.text || '')
    .join('')
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

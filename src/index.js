/**
 * @fileoverview ProseMirror document to Markdown converter
 *
 * The inverse of @uniweb/content-reader. Serializes ProseMirror JSON
 * documents back to Markdown text.
 */

export { serializeDoc as proseMirrorToMarkdown } from './serializer.js'
export { serializeFrontmatter } from './frontmatter.js'
export { docToPlainText } from './plain-text.js'

import { serializeDoc } from './serializer.js'
import { serializeFrontmatter } from './frontmatter.js'

/**
 * Serialize a complete section file (frontmatter + body).
 *
 * @param {Object} params - Frontmatter parameters (type, alignment, etc.)
 * @param {Object} doc - ProseMirror document JSON
 * @returns {string} Complete markdown file content
 */
export function serializeSection(params, doc) {
  const frontmatter = serializeFrontmatter(params)
  const body = serializeDoc(doc)

  if (frontmatter && body) {
    return `${frontmatter}\n\n${body}\n`
  }
  if (frontmatter) {
    return `${frontmatter}\n`
  }
  if (body) {
    return `${body}\n`
  }
  return ''
}

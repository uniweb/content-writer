/**
 * @fileoverview Core ProseMirror document serializer
 *
 * Iterates doc.content and dispatches to node serializers.
 */

import {
  serializeHeading,
  serializeParagraph,
  serializeImage,
  serializeInsetRef,
  serializeInsetBlock,
  serializeCodeBlock,
  serializeDataBlock,
  serializeBlockquote,
  serializeBulletList,
  serializeOrderedList,
  serializeDivider,
  serializeTable,
  serializeMathDisplay,
  setSerializer,
} from './nodes.js'
import { normalizeDialect } from './normalize.js'
import { warnUnmappedNode } from './diagnostics.js'

const NODE_SERIALIZERS = {
  heading: serializeHeading,
  paragraph: serializeParagraph,
  image: serializeImage,
  inset_ref: serializeInsetRef,
  inset_block: serializeInsetBlock,
  codeBlock: serializeCodeBlock,
  dataBlock: serializeDataBlock,
  blockquote: serializeBlockquote,
  bulletList: serializeBulletList,
  orderedList: serializeOrderedList,
  divider: serializeDivider,
  table: serializeTable,
  math_display: serializeMathDisplay,
}

/**
 * Serialize a single ProseMirror node to markdown.
 * @param {Object} node - ProseMirror node
 * @returns {string|null} Markdown string or null
 */
export function serializeNode(node) {
  const serializer = NODE_SERIALIZERS[node.type]
  if (!serializer) {
    // No silent drops: an unmapped node is still omitted (we have no
    // markdown form for it) but reported loudly. Editor-dialect content
    // should be normalized first (normalizeDialect); whatever reaches
    // here unmapped is a tracked capability gap (§8).
    warnUnmappedNode(node)
    return null
  }
  return serializer(node)
}

// Wire up the circular reference for blockquotes
setSerializer(serializeNode)

/**
 * Serialize a ProseMirror document to markdown.
 * @param {Object} doc - ProseMirror document ({ type: "doc", content: [...] })
 * @returns {string} Markdown string
 */
export function serializeDoc(doc) {
  if (!doc?.content) return ''

  // Normalize editor-dialect (or mixed-dialect) input onto the framework
  // dialect the node serializers consume. No-op for framework-dialect docs.
  doc = normalizeDialect(doc)

  return doc.content
    .map(node => serializeNode(node))
    .filter(s => s !== null && s !== undefined)
    .join('\n\n')
}

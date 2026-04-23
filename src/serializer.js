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

const NODE_SERIALIZERS = {
  heading: serializeHeading,
  paragraph: serializeParagraph,
  image: serializeImage,
  inset_ref: serializeInsetRef,
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
  if (!serializer) return null
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

  return doc.content
    .map(node => serializeNode(node))
    .filter(s => s !== null && s !== undefined)
    .join('\n\n')
}

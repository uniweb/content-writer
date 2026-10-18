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
  serializeConceptBlock,
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
import { warnUnmappedNode, collectOmittedNodes } from './diagnostics.js'

const NODE_SERIALIZERS = {
  heading: serializeHeading,
  paragraph: serializeParagraph,
  image: serializeImage,
  inset_ref: serializeInsetRef,
  inset_block: serializeInsetBlock,
  concept_block: serializeConceptBlock,
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
    // markdown form for it) but reported loudly — a node outside the
    // vocabulary, or a tracked capability gap (§8).
    warnUnmappedNode(node)
    return null
  }
  return serializer(node)
}

// Wire up the circular reference for blockquotes
setSerializer(serializeNode)

/**
 * The node types a document holds that markdown cannot carry — what writing it
 * to a file would leave out. A caller that writes files from stored content (a
 * pull) asks first, so content is never dropped on its way to a file and then
 * deleted by the push after it.
 *
 * @param {Object} doc - ProseMirror document
 * @returns {string[]} the node types left out; empty when the whole doc fits
 */
export function unwritableNodes(doc) {
  return collectOmittedNodes(() => serializeDoc(doc)).omitted
}

/**
 * Serialize a ProseMirror document to markdown.
 * @param {Object} doc - ProseMirror document ({ type: "doc", content: [...] })
 * @returns {string} Markdown string
 */
export function serializeDoc(doc) {
  if (!doc?.content) return ''

  // ⭐ The document holds the vocabulary, and nothing maps an editor's own names
  // onto it. ⛔ Until 2026-10-18 `normalizeDialect` ran here first: an editor's
  // `DividerBlock` and `horizontalRule` became a `divider`, a table's `layout` a
  // `placement`, an `emoji` its character, and the `textStyle` and `highlight`
  // marks a `span`. Each is now reported and left out, like any node or mark
  // outside the vocabulary.
  return doc.content
    .map(node => serializeNode(node))
    .filter(s => s !== null && s !== undefined)
    .join('\n\n')
}

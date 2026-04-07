/**
 * @fileoverview Serialize inline ProseMirror content (text nodes with marks) to markdown
 *
 * Handles mark interleaving, link/button/span wrapping, and bold/italic nesting.
 */

import { serializeAttributes } from './attributes.js'

/**
 * Check if a node has a specific mark type.
 * @param {Object} node - ProseMirror inline node
 * @param {string} type - Mark type
 * @returns {Object|undefined} The mark object if found
 */
function findMark(node, type) {
  return node.marks?.find(m => m.type === type)
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
 * Serialize an inline image node (icon within a paragraph).
 */
function serializeInlineImage(node) {
  const { src, alt, caption, role, library, name, ...rest } = node.attrs || {}

  // Icon with library+name → compact dash format
  if (library && name) {
    const iconSrc = `${library}-${name}`
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

  // Icon with library+name → compact dash format
  if (library && name) {
    const iconSrc = `${library}-${name}`
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

  // Pre-process: group nodes by wrapping marks (link, button, span)
  const segments = groupByWrappingMarks(content)
  return segments.map(seg => serializeSegment(seg)).join('')
}

/**
 * Group consecutive nodes by shared wrapping marks (link, button, span).
 * Returns an array of segments, where each segment is either:
 * - { type: 'link'|'button'|'span', mark, nodes } — wrapped group
 * - { type: 'plain', nodes } — unwrapped nodes
 */
function groupByWrappingMarks(content) {
  const segments = []
  let i = 0

  while (i < content.length) {
    const node = content[i]

    // Check for wrapping marks: link, button, span
    const linkMark = findMark(node, 'link')
    const buttonMark = findMark(node, 'button')
    const spanMark = findMark(node, 'span')
    const wrappingMark = buttonMark || linkMark || spanMark

    if (wrappingMark && node.type === 'text') {
      // Collect consecutive nodes with the same wrapping mark
      const group = [node]
      let j = i + 1
      while (j < content.length && content[j].type === 'text') {
        const nextMark = findMark(content[j], wrappingMark.type)
        if (nextMark && marksEqual(nextMark, wrappingMark)) {
          group.push(content[j])
          j++
        } else {
          break
        }
      }
      segments.push({ type: wrappingMark.type, mark: wrappingMark, nodes: group })
      i = j
    } else {
      // Plain node (no wrapping mark, or an image node)
      segments.push({ type: 'plain', nodes: [node] })
      i++
    }
  }

  return segments
}

/**
 * Serialize a segment (group of nodes with a common wrapping mark, or plain nodes).
 */
function serializeSegment(segment) {
  if (segment.type === 'plain') {
    return segment.nodes.map(n => serializePlainNode(n)).join('')
  }

  // Wrapped segment: serialize inner content (with the wrapping mark stripped)
  const innerText = segment.nodes.map(node => {
    // Strip the wrapping mark from this node's marks for inner serialization
    const innerMarks = (node.marks || []).filter(m => !marksEqual(m, segment.mark))
    return serializeTextWithMarks(node.text, innerMarks)
  }).join('')

  if (segment.type === 'link') {
    return `[${innerText}]${serializeLinkSuffix(segment.mark)}`
  }
  if (segment.type === 'button') {
    return `[${innerText}]${serializeButtonSuffix(segment.mark)}`
  }
  if (segment.type === 'span') {
    return `[${innerText}]${serializeSpanSuffix(segment.mark)}`
  }

  return innerText
}

/**
 * Serialize a plain node (no wrapping mark).
 */
function serializePlainNode(node) {
  if (node.type === 'image') {
    return serializeInlineImage(node)
  }
  if (node.type !== 'text') return ''
  return serializeTextWithMarks(node.text, node.marks || [])
}

/**
 * Serialize text with formatting marks (bold, italic, code).
 */
function serializeTextWithMarks(text, marks) {
  if (!marks || marks.length === 0) return text

  const hasCode = marks.some(m => m.type === 'code')
  if (hasCode) {
    return `\`${text}\``
  }

  const hasBold = marks.some(m => m.type === 'bold')
  const hasItalic = marks.some(m => m.type === 'italic')

  if (hasBold && hasItalic) {
    return `***${text}***`
  }
  if (hasBold) {
    return `**${text}**`
  }
  if (hasItalic) {
    return `*${text}*`
  }

  return text
}

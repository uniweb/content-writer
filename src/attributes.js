/**
 * @fileoverview Serialize attributes to curly brace syntax
 *
 * Inverse of content-reader's attributes.js.
 * Produces syntax like: {role=hero width=1200 .class #id autoplay}
 */

/**
 * Serialize an attributes object to curly brace syntax.
 *
 * @param {Object} attrs - Attributes object
 * @param {string[]} [skipKeys=[]] - Keys to skip (already encoded elsewhere)
 * @returns {string} Serialized attributes string (e.g., "{role=hero width=1200}") or empty string
 */
export function serializeAttributes(attrs, skipKeys = []) {
  if (!attrs || typeof attrs !== 'object') return ''

  const parts = []
  const skipSet = new Set(skipKeys)

  for (const [key, value] of Object.entries(attrs)) {
    if (skipSet.has(key)) continue
    if (value === null || value === undefined) continue

    if (key === 'class') {
      // Split class string into individual .class entries
      const classes = String(value).split(/\s+/).filter(Boolean)
      for (const cls of classes) {
        parts.push(`.${cls}`)
      }
    } else if (key === 'id') {
      parts.push(`#${value}`)
    } else if (value === true) {
      // Boolean attribute
      parts.push(key)
    } else {
      // Key=value pair
      const strValue = String(value)
      if (strValue.includes(' ')) {
        parts.push(`${key}="${strValue}"`)
      } else {
        parts.push(`${key}=${strValue}`)
      }
    }
  }

  if (parts.length === 0) return ''
  return `{${parts.join(' ')}}`
}

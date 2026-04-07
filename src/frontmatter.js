/**
 * @fileoverview YAML frontmatter serialization
 */

import yaml from 'js-yaml'

/**
 * Serialize a params object to YAML frontmatter.
 *
 * @param {Object} params - Frontmatter parameters
 * @returns {string} YAML frontmatter block (with --- fences) or empty string
 */
export function serializeFrontmatter(params) {
  if (!params || typeof params !== 'object') return ''

  // Filter out null/undefined values
  const filtered = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      filtered[key] = value
    }
  }

  if (Object.keys(filtered).length === 0) return ''

  const yamlStr = yaml.dump(filtered, {
    lineWidth: -1,        // Don't wrap long lines
    quotingType: "'",     // Use single quotes when quoting is needed
    forceQuotes: false,   // Only quote when necessary
    noRefs: true,         // Don't use YAML references
  }).trimEnd()

  return `---\n${yamlStr}\n---`
}

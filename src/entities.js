/**
 * @fileoverview Undo the HTML escaping that ProseMirror text nodes carry.
 *
 * Text in a PM node is HTML, because the render path injects it as HTML
 * (`kit`'s `SafeHtml` / `Text` use `dangerouslySetInnerHTML`). A literal `<`
 * the author typed inside a code span therefore has to be *stored* escaped —
 * `<code><x></code>` would have the browser swallow `<x>` as an unknown tag.
 *
 * `content-reader` encodes that asymmetry deliberately: it decodes `&amp;`,
 * `&quot;` and `&#39;` back to plain characters and leaves `&lt;` / `&gt;`
 * escaped. Verified against the parser (`parser/inline.js`) — raw HTML an
 * author writes in prose is preserved verbatim through the `html` token, so
 * only *machine-escaped* text carries entities on the way out.
 *
 * Two exports, because "leaving HTML-land" means different things depending
 * on where the text is going:
 *
 * - `decodeMarkupEntities` — the markdown lane. Undoes only the pair the
 *   reader left behind, so serializing is the reader's exact inverse.
 * - `decodeTextEntities` — the plain-text lane. The target is not HTML at
 *   all, so every entity resolves to the character a reader would see.
 */

/**
 * Undo the escaping `content-reader` leaves in place (`&lt;` / `&gt;`).
 *
 * Deliberately narrow. `&amp;`, `&quot;` and `&#39;` are already decoded by
 * the reader, so a PM node holding one of those means the author wrote the
 * entity themselves — decoding it again would corrupt their source.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeMarkupEntities(text) {
  if (!text || !text.includes('&')) return text
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * Escape a code span's text for storage in a ProseMirror text node.
 *
 * The exact inverse of {@link decodeMarkupEntities}, and the other half of the
 * invariant: a code span's content is rendered by injecting it as HTML, so a
 * literal `<` has to be stored escaped or `<code><x></code>` has the browser
 * swallow `<x>` and the span renders empty.
 *
 * Exported for **producers other than content-reader**. Any tool that writes a
 * ProseMirror code span — an editor, a converter — needs this rule, and the
 * rule living in prose rather than in code is what let two producers diverge.
 * Import it instead of reimplementing it.
 *
 * Only `<` and `>`: every other character is safe inside an HTML text node,
 * and escaping `&` here would double-encode an entity the author typed.
 *
 * @param {string} text - Raw code span content, as the author typed it
 * @returns {string} Text safe to store in a PM code-marked node
 */
export function encodeMarkupEntities(text) {
  if (!text) return text
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Resolve every entity to the character a reader would actually see.
 *
 * `&amp;` is decoded **last** so `&amp;lt;` yields `&lt;` rather than `<` —
 * one decoding pass, not a cascade.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeTextEntities(text) {
  if (!text || !text.includes('&')) return text
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Drop raw inline HTML an author wrote in prose (`<br>`, `<span …>`).
 *
 * Only for the plain-text lane. Runs **before** entity decoding, so text the
 * author escaped on purpose (`&lt;b&gt;`, meaning a literal `<b>`) survives
 * as characters instead of being mistaken for a tag and stripped.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripInlineHtml(text) {
  if (!text || !text.includes('<')) return text
  return text.replace(/<\/?[a-zA-Z][^>]*>/g, '')
}

/**
 * The plain-text cleanup, in the order the two steps have to run.
 *
 * @param {string} text
 * @returns {string}
 */
export function toPlainCharacters(text) {
  return decodeTextEntities(stripInlineHtml(text))
}

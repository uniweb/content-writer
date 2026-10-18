/**
 * The no-silent-drop guard: content-writer writes the vocabulary, and reports
 * what it cannot write instead of losing it silently.
 *
 * ⛔ Until 2026-10-18 it also mapped an editor's own names onto the vocabulary
 * first (`normalizeDialect`): `DividerBlock` and `horizontalRule` became a
 * `divider`, a table's `layout` a `placement`, an `emoji` its character, and
 * the `textStyle` and `highlight` marks a `span`. An editor writes the
 * vocabulary itself now, so each of those is reported and left out, like any
 * node or mark outside the vocabulary.
 */

import { beforeEach, afterEach } from 'vitest'
import { markdownToProseMirror } from '@uniweb/content-reader'
import * as writer from '../src/index.js'
import {
  proseMirrorToMarkdown,
  unwritableNodes,
  setDiagnosticsReporter,
  resetDiagnostics,
} from '../src/index.js'

const doc = (...content) => ({ type: 'doc', content })
const para = (...content) => ({ type: 'paragraph', content })

describe('a vocabulary document', () => {
  test('round-trips through the reader', () => {
    const md = '# Title\n\nSome **bold** text.\n\n---\n\n![Hero](./hero.jpg){role=banner}'
    const frameworkDoc = markdownToProseMirror(md)
    expect(markdownToProseMirror(proseMirrorToMarkdown(frameworkDoc))).toEqual(frameworkDoc)
  })
})

describe('no-silent-drop guard: unmappable nodes are reported, not lost', () => {
  let warnings

  beforeEach(() => {
    warnings = []
    resetDiagnostics()
    setDiagnosticsReporter((m) => warnings.push(m))
  })

  afterEach(() => {
    setDiagnosticsReporter() // restore console.warn
    resetDiagnostics()
  })

  test('an unmapped editor container (card-group) warns', () => {
    proseMirrorToMarkdown(
      doc({
        type: 'card-group',
        content: [{ type: 'card', attrs: { title: 'A' } }],
      })
    )
    expect(warnings.some((m) => m.includes('card-group'))).toBe(true)
  })

  test.each([
    { type: 'FormBlock', attrs: { activeSchemaId: 'stats', data: [{ number: '42' }] } },
    { type: 'StructuredContent', attrs: { activeSchemaId: 'stats', data: [{ number: '42' }] } },
  ])("the editor's form node, $type, warns — a form's data is a tagged data block", (node) => {
    proseMirrorToMarkdown(doc(node))
    expect(warnings.some((m) => m.includes(node.type))).toBe(true)
  })

  test.each([
    { type: 'ImageBlock', attrs: { url: './hero.jpg', alt: 'Hero' } },
    { type: 'Video', attrs: { src: './tour.mp4', coverImg: { src: './poster.jpg' } } },
    { type: 'Icon', attrs: { svg: '<svg/>' } },
    { type: 'DividerBlock', attrs: { type: 'dot' } },
    { type: 'horizontalRule' },
  ])("the editor's retired $type is reported and writes nothing", (node) => {
    // ⛔ The media were mapped onto `image` until 2026-10-18, and the dividers
    // onto `divider` until later that day; the editor writes both itself.
    expect(proseMirrorToMarkdown(doc(node)).trim()).toBe('')
    expect(warnings.some((m) => m.includes(node.type))).toBe(true)
    expect(unwritableNodes(doc(node))).toEqual([node.type])
  })

  test.each([
    { type: 'UniwebIcon', attrs: { library: 'lu', name: 'home' } },
    { type: 'emoji', attrs: { name: 'star', emoji: '⭐' } },
  ])("the editor's inline $type is reported and writes nothing", (node) => {
    expect(proseMirrorToMarkdown(doc(para(node))).trim()).toBe('')
    expect(warnings.some((m) => m.includes(node.type))).toBe(true)
  })

  test.each([
    [{ type: 'highlight' }],
    [{ type: 'textStyle', attrs: { color: 'accent' } }],
  ])("the editor's %o mark warns and keeps the text, unstyled", (mark) => {
    // ⛔ Mapped onto `span` until 2026-10-18 — `[x]{highlight}`, `[x]{accent}`.
    // The editor saves `span` itself.
    const md = proseMirrorToMarkdown(doc(para({ type: 'text', text: 'important', marks: [mark] })))
    expect(md).toBe('important')
    expect(warnings.some((m) => m.includes(mark.type))).toBe(true)
  })

  test("a table's `layout` is not read: the table writes with no placement", () => {
    // ⛔ `layout: 'wide'` was written as `{placement=wide}` until 2026-10-18.
    // An editor writes `placement` itself.
    const TABLE = '| Plan | Price |\n| --- | --- |\n| Basic | $10 |'
    const plain = proseMirrorToMarkdown(markdownToProseMirror(TABLE))
    const withLayout = markdownToProseMirror(TABLE)
    withLayout.content[0].attrs = { ...withLayout.content[0].attrs, layout: 'wide' }
    expect(proseMirrorToMarkdown(withLayout)).toBe(plain)
  })

  test('nothing maps the editor dialect: `normalizeDialect` is no export', () => {
    expect(writer).not.toHaveProperty('normalizeDialect')
  })

  test('a known framework document produces no warnings', () => {
    proseMirrorToMarkdown(
      markdownToProseMirror('# Hi\n\nSome **bold** and a [link](/x).')
    )
    expect(warnings).toEqual([])
  })

  test('an inline inset_ref is serialized, not silently dropped', () => {
    const md = proseMirrorToMarkdown(
      doc(
        para(
          { type: 'text', text: 'See ' },
          { type: 'inset_ref', attrs: { component: 'Cite', embedKind: 'text', key: '@darwin', alt: null } },
          { type: 'text', text: ' here.' }
        )
      )
    )
    expect(md).toBe('See [@darwin] here.')
    expect(warnings).toEqual([]) // a known inline node — no warning
  })

  test('an unmapped inline node warns rather than vanishing', () => {
    const md = proseMirrorToMarkdown(
      doc(
        para(
          { type: 'text', text: 'before ' },
          { type: 'FancyInlineWidget', attrs: { id: 'x' } },
          { type: 'text', text: ' after' }
        )
      )
    )
    // the surrounding text survives; the unmapped node is omitted but reported
    expect(md).toBe('before  after')
    expect(warnings.some((m) => m.includes('FancyInlineWidget'))).toBe(true)
  })

  test('a standalone "\\n" text node is a soft break, not a hard one', () => {
    // content-reader emits a lone "\n" node for a SOFT break whenever the
    // spans on both sides are marked. This used to be healed into a hard
    // break, on the assumption it could only be the legacy spelling of one —
    // which turned a wrapped line into a visible <br> one round trip later.
    const md = proseMirrorToMarkdown(
      doc(
        para(
          { type: 'text', text: 'line one' },
          { type: 'text', text: '\n' },
          { type: 'text', text: 'line two' }
        )
      )
    )
    expect(md.trim()).toBe('line one\nline two')
    expect(warnings).toEqual([])
  })

  test('a hard break is the hardBreak node, and still serializes as one', () => {
    const md = proseMirrorToMarkdown(
      doc(para({ type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' }))
    )
    expect(md.trim()).toBe('line one\\\nline two')
  })

  test('a newline INSIDE a text node is a soft break and must not be converted', () => {
    // The narrow rule matters: this is an ordinary wrapped paragraph, which is
    // a space. Converting it would inject a break into every wrapped paragraph.
    const md = proseMirrorToMarkdown(
      doc(para({ type: 'text', text: 'wrapped\nparagraph' }))
    )
    expect(md.trim()).toBe('wrapped\nparagraph')
  })
})

describe('icon spelling round-trips', () => {
  test('a full family name keeps the colon form', () => {
    // `![](lucide-star)` reads back as a plain image with src "lucide-star" —
    // the dash spelling is short-codes-only, by design in the reader, so that
    // the form stays unambiguous against a relative path.
    for (const md of ['![](lucide:star)', '![](heroicons2:arrow-right)', '![](lu-star)']) {
      const out = proseMirrorToMarkdown(markdownToProseMirror(md)).trim()
      const attrs = markdownToProseMirror(out).content[0].content[0].attrs
      expect(attrs.role).toBe('icon')
    }
  })
})

/**
 * Editor-dialect normalization + no-silent-drop guard.
 *
 * Verifies that content-writer maps the editor (TipTap) dialect onto the
 * framework markdown dialect for the zero-guess constructs, that it stays
 * a no-op on framework-dialect input, and that anything it can't map is
 * reported loudly instead of silently dropped.
 *
 * Editor-node attr shapes are modelled on the editor block definitions and
 * the committed semantic-parser fixtures.
 */

import { beforeEach, afterEach } from 'vitest'
import { markdownToProseMirror } from '@uniweb/content-reader'
import {
  proseMirrorToMarkdown,
  normalizeDialect,
  setDiagnosticsReporter,
  resetDiagnostics,
} from '../src/index.js'

const doc = (...content) => ({ type: 'doc', content })
const para = (...content) => ({ type: 'paragraph', content })

/** Assert an editor doc serializes to expected markdown and is a fixed point. */
function expectMarkdown(editorDoc, expected) {
  const md = proseMirrorToMarkdown(editorDoc)
  expect(md).toBe(expected)
  // Re-parsing and re-serializing the framework markdown must be stable.
  const md2 = proseMirrorToMarkdown(markdownToProseMirror(md))
  expect(md2).toBe(md)
}

describe('normalizeDialect: idempotent on framework dialect', () => {
  test('a framework-dialect document is unchanged through normalization', () => {
    const md =
      '# Title\n\nSome **bold** text.\n\n---\n\n![Hero](./hero.jpg){role=banner}'
    const frameworkDoc = markdownToProseMirror(md)
    // normalize then serialize === serialize (serializeDoc normalizes internally)
    expect(proseMirrorToMarkdown(normalizeDialect(frameworkDoc))).toBe(
      proseMirrorToMarkdown(frameworkDoc)
    )
    // and the round trip is preserved
    expect(markdownToProseMirror(proseMirrorToMarkdown(frameworkDoc))).toEqual(
      frameworkDoc
    )
  })
})

describe('normalizeDialect: editor blocks → framework markdown', () => {
  test('DividerBlock → ---', () => {
    expectMarkdown(doc({ type: 'DividerBlock', attrs: { type: 'dot' } }), '---')
  })

  test('horizontalRule → ---', () => {
    expectMarkdown(doc({ type: 'horizontalRule' }), '---')
  })

  test('ImageBlock (url) → ![](){role}', () => {
    expectMarkdown(
      doc({
        type: 'ImageBlock',
        attrs: {
          url: './hero.jpg',
          role: 'banner',
          alt: 'Hero',
          direction: 'center', // editor layout state — intentionally dropped
          info: { identifier: '' },
        },
      }),
      '![Hero](./hero.jpg){role=banner}'
    )
  })

  test('ImageBlock without a role serializes as a plain image', () => {
    expectMarkdown(
      doc({ type: 'ImageBlock', attrs: { url: './photo.jpg', alt: 'Photo' } }),
      '![Photo](./photo.jpg)'
    )
  })

  test('Video (src + coverImg) → ![](){role=video poster}', () => {
    expectMarkdown(
      doc({
        type: 'Video',
        attrs: {
          src: './demo.mp4',
          alt: 'Demo',
          coverImg: { src: './poster.jpg', identifier: null },
          direction: 'center',
        },
      }),
      '![Demo](./demo.mp4){role=video poster=./poster.jpg}'
    )
  })

  test('UniwebIcon (library+name) → ![](lib-name)', () => {
    expectMarkdown(
      doc(para({ type: 'UniwebIcon', attrs: { library: 'lu', name: 'home' } })),
      '![](lu-home)'
    )
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

  test('FormBlock warns (activeSchemaId has no markdown home yet)', () => {
    proseMirrorToMarkdown(
      doc({
        type: 'FormBlock',
        attrs: { activeSchemaId: 'stats', data: [{ number: '42' }] },
      })
    )
    expect(warnings.some((m) => m.includes('FormBlock'))).toBe(true)
  })

  test('media with only an asset identifier (no URL) warns rather than guessing a src', () => {
    proseMirrorToMarkdown(
      doc({
        type: 'ImageBlock',
        attrs: { url: null, src: null, info: { identifier: 'v1/base.jpg' } },
      })
    )
    expect(warnings.some((m) => m.includes('ImageBlock'))).toBe(true)
  })

  test('an unmapped mark (highlight) warns but keeps the text', () => {
    const md = proseMirrorToMarkdown(
      doc(
        para({
          type: 'text',
          text: 'important',
          marks: [{ type: 'highlight' }],
        })
      )
    )
    expect(md).toBe('important') // text preserved, styling dropped
    expect(warnings.some((m) => m.includes('highlight'))).toBe(true)
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

  test('a legacy standalone "\\n" text node self-heals to a hard break', () => {
    const md = proseMirrorToMarkdown(
      doc(
        para(
          { type: 'text', text: 'line one' },
          { type: 'text', text: '\n' },
          { type: 'text', text: 'line two' }
        )
      )
    )
    expect(md.trim()).toBe('line one\\\nline two')
    expect(warnings).toEqual([]) // healed, not reported as unmapped
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

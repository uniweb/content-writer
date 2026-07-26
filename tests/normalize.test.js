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
    // `highlight` used to have no markdown form and was reported as an
    // unmapped mark. It is now a named inline style — the editor stores a
    // theme token rather than a colour — so it maps onto the span mark and
    // nothing is dropped or reported.
    expect(md).toBe('[important]{highlight}')
    expect(warnings).toEqual([])
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

describe('editor named inline styles map onto the span mark', () => {
  let warnings

  beforeEach(() => {
    warnings = []
    resetDiagnostics()
    setDiagnosticsReporter(m => warnings.push(m))
  })

  const styled = marks => proseMirrorToMarkdown(doc(para({ type: 'text', text: 'x', marks }))).trim()

  test('a textStyle token becomes a named inline style', () => {
    // The editor's picker offers a closed set of theme tokens, not colours —
    // the attribute is only *named* `color`. So they round-trip through the
    // span mark the framework already has, and nothing is lost.
    expect(styled([{ type: 'textStyle', attrs: { color: 'accent' } }])).toBe('[x]{accent}')
    expect(styled([{ type: 'textStyle', attrs: { color: 'muted' } }])).toBe('[x]{muted}')
    expect(styled([{ type: 'textStyle', attrs: { color: 'callout' } }])).toBe('[x]{callout}')
  })

  test('highlight is effectively boolean and maps the same way', () => {
    expect(styled([{ type: 'highlight' }])).toBe('[x]{highlight}')
  })

  test('the "Normal" option carries no styling', () => {
    expect(styled([{ type: 'textStyle', attrs: { color: '' } }])).toBe('x')
    expect(warnings).toEqual([])
  })

  test('a raw colour is NOT mapped — it is reported, not written into markdown', () => {
    // Reachable today via a paste carrying inline style; the editor is gating
    // its parseHTML. A hex in markdown would contradict the theming model and
    // would not survive a change of brand, so it must not be invented here.
    expect(styled([{ type: 'textStyle', attrs: { color: '#ff0000' } }])).toBe('x')
    expect(warnings.some(m => m.includes('textStyle'))).toBe(true)
  })

  test('a mapped style round-trips back through the reader', () => {
    expect(styled([{ type: 'textStyle', attrs: { color: 'accent' } }])).toBe('[x]{accent}')
  })
})

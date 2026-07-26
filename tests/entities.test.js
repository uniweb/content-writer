/**
 * Entity handling on the way out of ProseMirror.
 *
 * The invariant these tests pin down (verified against `content-reader`'s
 * `parser/inline.js`): a PM text node holds HTML. The reader decodes `&amp;`,
 * `&quot;` and `&#39;` and leaves `&lt;`/`&gt;` escaped, because the render
 * path injects the string as HTML. Serializing has to undo exactly that, and
 * exactly there — decoding more, or decoding in prose, corrupts source.
 */

import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown, docSummaryText, docToPlainText } from '../src/index.js'
import { encodeMarkupEntities, decodeMarkupEntities, decodeTextEntities } from '../src/entities.js'

const md = s => proseMirrorToMarkdown(markdownToProseMirror(s)).trim()

describe('decodeMarkupEntities', () => {
  test('undoes the pair the reader leaves escaped', () => {
    expect(decodeMarkupEntities('/data/&lt;name&gt;.json')).toBe('/data/<name>.json')
  })

  test('leaves entities the reader already decoded alone', () => {
    // A PM node holding these means the author typed them.
    expect(decodeMarkupEntities('a &amp; b')).toBe('a &amp; b')
    expect(decodeMarkupEntities('say &quot;hi&quot;')).toBe('say &quot;hi&quot;')
  })

  test('is a no-op on text with no entities', () => {
    expect(decodeMarkupEntities('plain text')).toBe('plain text')
  })
})

describe('decodeTextEntities', () => {
  test('resolves every entity to the character a reader sees', () => {
    expect(decodeTextEntities('&lt;b&gt; &amp; &quot;q&quot; &#39;a&#39;')).toBe(`<b> & "q" 'a'`)
  })

  test('decodes &amp; last, so &amp;lt; yields &lt; and not <', () => {
    expect(decodeTextEntities('&amp;lt;')).toBe('&lt;')
  })
})

describe('D1 — code spans round-trip a literal < >', () => {
  test('the reported defect', () => {
    expect(md('Read `/data/<name>.json` for the cascade.')).toBe(
      'Read `/data/<name>.json` for the cascade.'
    )
  })

  test('inside a heading', () => {
    expect(md('# The `<slug>` folder')).toBe('# The `<slug>` folder')
  })

  test('inside a table cell', () => {
    expect(md('| Col |\n| --- |\n| `<x>` |')).toContain('`<x>`')
  })

  test('inside a link', () => {
    expect(md('[the `<x>` doc](/a)')).toBe('[the `<x>` doc](/a)')
  })
})

describe('D1 — what the fix must NOT touch', () => {
  test('prose entities stay escaped (decoding them would render as a tag)', () => {
    expect(md('Literal &lt;name&gt; in prose.')).toBe('Literal &lt;name&gt; in prose.')
  })

  test('raw inline HTML in prose is preserved verbatim', () => {
    expect(md('A <name> tag in prose.')).toBe('A <name> tag in prose.')
  })

  test('an authored &amp; inside a code span survives', () => {
    expect(md('Code `a &amp; b` here.')).toBe('Code `a &amp; b` here.')
  })

  test('code blocks are raw text and are left alone', () => {
    const source = '```js\nconst x = a < b && c > d;\n```'
    expect(md(source)).toBe(source)
  })

  test('quotes and apostrophes in code spans are untouched', () => {
    expect(md(`Code \`say "hi" it's\` here.`)).toBe(`Code \`say "hi" it's\` here.`)
  })
})

describe('docSummaryText', () => {
  const summary = (source, opts) => docSummaryText(markdownToProseMirror(source), opts)

  test('skips the H1 and reads the first paragraph', () => {
    expect(summary('# Quickstart\n\nCreate your first Uniweb site in 5 minutes.')).toBe(
      'Create your first Uniweb site in 5 minutes.'
    )
  })

  test('returns plain text — no anchors, no mark tags', () => {
    expect(summary('# T\n\nSee **the [docs](/docs)** for *more*.')).toBe(
      'See the docs for more.'
    )
  })

  test('resolves entities and drops raw inline HTML', () => {
    expect(summary('# T\n\nUse `<name>` and &lt;slug&gt; and <br> here.')).toBe(
      'Use <name> and <slug> and here.'
    )
  })

  test('truncates at a sentence boundary', () => {
    const text = 'One sentence here. Two sentence here. Three sentence here.'
    expect(summary(`# T\n\n${text}`, { maxChars: 40 })).toBe('One sentence here. Two sentence here.')
  })

  test('falls back to a word boundary with an ellipsis', () => {
    const text = 'Collections let you manage repeating content across many files'
    expect(summary(`# T\n\n${text}`, { maxChars: 40 })).toBe(
      'Collections let you manage repeating…'
    )
  })

  test('a dot inside a filename does not end a sentence', () => {
    expect(summary('# T\n\nEdit site.yml then run the build now please.', { maxChars: 20 }))
      .toBe('Edit site.yml then…')
  })

  test('returns empty string when there is no paragraph', () => {
    expect(summary('# Only a heading')).toBe('')
    expect(docSummaryText(null)).toBe('')
  })

  test('collapses newlines into one line', () => {
    expect(summary('# T\n\nA line\nand another.')).toBe('A line and another.')
  })
})

describe('docToPlainText also yields plain characters', () => {
  test('strips tags and resolves entities', () => {
    // Note the doubled space where <br> was: this primitive does not
    // normalize whitespace, and its consumers (word counts, search tokens)
    // do not care. `docSummaryText` is the one that promises a single line.
    expect(docToPlainText(markdownToProseMirror('Use &lt;x&gt; and <br> here.'))).toBe(
      'Use <x> and  here.'
    )
  })
})

describe('encodeMarkupEntities — the producer-side half', () => {
  test('is the exact inverse of decodeMarkupEntities', () => {
    const raw = '/data/<name>.json'
    expect(encodeMarkupEntities(raw)).toBe('/data/&lt;name&gt;.json')
    expect(decodeMarkupEntities(encodeMarkupEntities(raw))).toBe(raw)
  })

  test('does not touch &, so an authored entity is not double-encoded', () => {
    expect(encodeMarkupEntities('a & b')).toBe('a & b')
    expect(encodeMarkupEntities('&amp;')).toBe('&amp;')
  })

  test('round-trips what an author types in a code span', () => {
    for (const raw of ['<div>', 'a < b && c > d', 'a & b', 'plain']) {
      expect(decodeMarkupEntities(encodeMarkupEntities(raw))).toBe(raw)
    }
  })

  test('the one input it does NOT round-trip: literal entity text', () => {
    // `<div>` and `&lt;div&gt;` both store as `&lt;div&gt;`, so the pair
    // cannot tell them apart and resolves to the decoded form.
    //
    // Accepted deliberately, because the loss happened earlier and elsewhere:
    // a code span is rendered by injecting its text as HTML, so an author who
    // typed `&lt;div&gt;` already sees `<div>` on the page. Decoding makes the
    // file agree with the page rather than destroying something a reader could
    // otherwise see. Escaping `&` as well would make the pair lossless, at the
    // cost of changing what every existing code span stores.
    expect(decodeMarkupEntities(encodeMarkupEntities('&lt;div&gt;'))).toBe('<div>')
  })
})

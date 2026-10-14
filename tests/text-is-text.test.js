import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown, docToPlainText } from '../src/index.js'
import { serializeInlineContent } from '../src/marks.js'

/**
 * A text node holds the characters a reader sees, so the writer escapes what
 * the reader would otherwise decode — and nothing else.
 *
 * Until 2026-10-14 a text node held HTML and was written verbatim, with a code
 * span's `&lt;` decoded on the way out. Now the reader decodes every value, and
 * the property that matters is the one these pin: read(write(text)) is the
 * same text, whatever characters it holds.
 */

const paragraph = (content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] })
const text = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const readBack = (markdown) =>
  markdownToProseMirror(markdown)
    .content[0].content.map((n) => (n.type === 'text' ? n.text : `[${n.type}]`))
    .join('')

describe('text round-trips as the characters it is', () => {
  test.each([
    'if a<b then swap',
    'x < y and y > z',
    'a <img src=x onerror=alert(1)> b',
    'the &copy; reference, typed',
    'R&D and AT&T',
    'a tag-like </div> and <!-- not a comment -->',
    '<https://x.test> is not a link here',
  ])('%s', (value) => {
    const markdown = proseMirrorToMarkdown(paragraph([text(value)]))
    expect(readBack(markdown)).toBe(value)
  })

  test('only what the reader would decode is escaped', () => {
    expect(serializeInlineContent([text('a<b, x < y, R&D, &copy;')])).toBe('a\\<b, x < y, R&D, \\&copy;')
  })

  test('a code span is written as its characters', () => {
    expect(serializeInlineContent([text('Use '), text('<div> & &lt;', [{ type: 'code' }])])).toBe(
      'Use `<div> & &lt;`',
    )
    expect(readBack('Use `<div> & &lt;`')).toBe('Use <div> & &lt;')
  })

  test('a run the reader split at an escape is written whole', () => {
    // `\<name>` reads back as two nodes, `<` and `name>`.
    const doc = markdownToProseMirror('A literal \\<name> here.')
    expect(proseMirrorToMarkdown(doc).trim()).toBe('A literal \\<name> here.')
  })
})

describe('a hard break', () => {
  const brk = { type: 'hardBreak' }

  test('in a paragraph is a trailing backslash', () => {
    expect(serializeInlineContent([text('a'), brk, text('b')])).toBe('a\\\nb')
  })

  test('in a heading, which is one line, is <br/> — and reads back as the same break', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [text('Launch'), brk, text('yours')] }] }
    const markdown = proseMirrorToMarkdown(doc).trim()
    expect(markdown).toBe('# Launch<br/>yours')
    expect(markdownToProseMirror(markdown).content[0].content.map((n) => n.text ?? n.type)).toEqual([
      'Launch',
      'hardBreak',
      'yours',
    ])
  })
})

describe('plain text', () => {
  test('is the characters, with nothing stripped', () => {
    expect(docToPlainText(paragraph([text('Write '), text('<div>', [{ type: 'code' }]), text(' & go')]))).toBe(
      'Write <div> & go',
    )
  })
})

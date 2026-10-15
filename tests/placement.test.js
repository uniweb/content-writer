/**
 * What the reader takes from the end of a line, written back: a heading's
 * `{#id}`, and a table's caption line —
 *
 *     : Plans and prices {placement=wide #tbl-plans}
 *
 * — and an image's `{placement=…}`, which its attribute block writes like any
 * other attribute.
 */
import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown } from '../src/index.js'

const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |'

/** The markdown comes back as written, and reads back to the same document. */
function expectStable(markdown) {
  const doc = markdownToProseMirror(markdown)
  const written = proseMirrorToMarkdown(doc)
  expect(written).toBe(markdown)
  expect(markdownToProseMirror(written)).toEqual(doc)
}

/** A table node holding `attrs`, with the rows of TABLE. */
function tableWith(attrs) {
  const [table] = markdownToProseMirror(TABLE).content
  return { type: 'doc', content: [{ ...table, attrs }] }
}

describe("a heading's {#id}", () => {
  test('is written back, so a pull keeps the cross-reference target', () => {
    expectStable('## Method {#sec-method}\n\nText.')
  })

  test('on a label line too', () => {
    expectStable('#> Chapter one {#ch-1}')
  })

  test('an id the reader would not take back is not written', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2, id: 'not an id' }, content: [{ type: 'text', text: 'Method' }] }] }
    expect(proseMirrorToMarkdown(doc)).toBe('## Method')
  })
})

describe("a table's caption line", () => {
  test('caption, placement and id', () => {
    expectStable(`${TABLE}\n\n: Plans and prices {placement=wide #tbl-plans}`)
  })

  test('a caption alone', () => {
    expectStable(`${TABLE}\n\n: Plans and prices`)
  })

  test('no caption: `: {…}` alone', () => {
    expectStable(`${TABLE}\n\n: {placement=full}`)
  })

  test('a table with none of the three writes no line', () => {
    expectStable(TABLE)
  })

  test('in a blockquote', () => {
    expectStable('> | a |\n> | --- |\n> | 1 |\n>\n> : In a quote {#tbl-q}')
  })

  test.each([
    'Price *from* $10 to $20 [net]',
    'snake_case and _em_',
    'Revenue by {year}',
    'Ends with {#x}',
    'Ends with {placement=wide}',
    'Back\\slash & R&amp;D <b>',
    'a ~~b~~ `c`',
  ])('a caption is plain text, and comes back as it was: %s', (caption) => {
    const written = proseMirrorToMarkdown(tableWith({ caption }))
    const warnings = []
    const [table] = markdownToProseMirror(written, { onWarning: (w) => warnings.push(w) }).content
    expect(table.attrs).toEqual({ caption })
    expect(warnings).toEqual([])
  })

  test('a caption on several lines is written on one', () => {
    expect(proseMirrorToMarkdown(tableWith({ caption: 'Plans and\nprices' }))).toBe(`${TABLE}\n\n: Plans and prices`)
  })
})

describe("an image's {placement=…}", () => {
  test('is written in its attribute block', () => {
    expectStable('![The harbour at dawn](harbour.jpg){placement=wide}')
  })

  test("on a video, after its role", () => {
    expectStable('![](tour.mp4){role=video placement=full}')
  })
})

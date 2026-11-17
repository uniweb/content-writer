import { describe, it, expect } from 'vitest'
import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown } from '../src/index.js'
import { serializeInlineContent } from '../src/marks.js'

/**
 * ⭐ Underline, superscript and subscript are written in a bracket, `[x]{underline}`, `[2]{sup}`,
 * `[2]{sub}` (2026-11-17) — content-reader's spelling, read back as the same marks. A text's span and
 * these share one bracket, since the reader reads no bracket inside another, and a link goes around
 * it; anything else keeps the order it was read in, so an author's file comes back as written.
 */
const text = (t, ...marks) => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) })
const doc = (...content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] })
const round = (d) => markdownToProseMirror(proseMirrorToMarkdown(d)).content[0].content

describe('a bracket for the marks it writes', () => {
  it('⭐ writes each in the reader\'s words', () => {
    expect(serializeInlineContent([text('CO'), text('2', { type: 'subscript' }), text(' m'), text('2', { type: 'superscript' }), text(' '), text('this', { type: 'underline' })])).toBe(
      'CO[2]{sub} m[2]{sup} [this]{underline}',
    )
  })

  it('⭐ one bracket for a span and its marks, where the outermost of them was', () => {
    const d = doc(text('x', { type: 'span', attrs: { accent: true } }, { type: 'bold' }, { type: 'underline' }))
    expect(proseMirrorToMarkdown(d).trim()).toBe('[**x**]{underline accent}')
    expect(round(d)).toEqual([text('x', { type: 'bold' }, { type: 'underline' }, { type: 'span', attrs: { accent: true } })])
  })

  it('⭐ an author\'s formatting inside a bracket is written back as it was', () => {
    const md = '[**bold** words]{accent} and CO[2]{sub}'
    expect(proseMirrorToMarkdown(markdownToProseMirror(md)).trim()).toBe(md)
  })

  it('a link around one is a link holding a span, and reads back as it was', () => {
    const d = doc(text('1', { type: 'superscript' }, { type: 'link', attrs: { href: 'https://x.test', title: null } }))
    expect(proseMirrorToMarkdown(d).trim()).toBe('[[1]{sup}](https://x.test)')
    expect(round(d)).toEqual(d.content[0].content)
  })

  it('a bracket an editor put around a link goes inside it, so both read back', () => {
    const d = doc(text('x', { type: 'link', attrs: { href: 'https://x.test', title: null } }, { type: 'underline' }))
    expect(proseMirrorToMarkdown(d).trim()).toBe('[[x]{underline}](https://x.test)')
    expect(round(d)).toEqual([text('x', { type: 'underline' }, { type: 'link', attrs: { href: 'https://x.test', title: null } })])
  })

  it('CONTROL — a text with neither keeps its marks as written', () => {
    expect(serializeInlineContent([text('x', { type: 'italic' }, { type: 'bold' })])).toBe('***x***')
  })
})

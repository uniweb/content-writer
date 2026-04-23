/**
 * Math round-trip tests: markdown → content-reader → content-writer → content-reader.
 *
 * The identity we check is at the ProseMirror-doc level, not the markdown
 * string — content-writer is free to normalise whitespace or attribute
 * order as long as the re-parsed doc matches the original.
 *
 * The `mathml` attribute is expected to drift across the round trip only
 * if Temml output is non-deterministic; in practice it is stable, so we
 * assert both `latex` and `mathml` survive.
 */

import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown } from '../src/index.js'

function roundTrip(markdown) {
  const parsed = markdownToProseMirror(markdown)
  const serialized = proseMirrorToMarkdown(parsed)
  const reparsed = markdownToProseMirror(serialized)
  return { parsed, serialized, reparsed }
}

describe('Math round-trip', () => {
  test('inline math: $x^2$', () => {
    const { parsed, reparsed } = roundTrip('Let $x^2$ be a square.')
    expect(reparsed).toEqual(parsed)
  })

  test('block display math: $$...$$', () => {
    const { parsed, reparsed } = roundTrip('$$\\sum_{i=1}^n i$$')
    expect(reparsed).toEqual(parsed)
  })

  test('multi-line block math uses fenced ```math form', () => {
    const input = '```math\n\\int_0^\\infty\ne^{-x}\\,dx\n```'
    const { parsed, serialized, reparsed } = roundTrip(input)
    expect(serialized.startsWith('```math')).toBe(true)
    expect(reparsed).toEqual(parsed)
  })

  test('mixed paragraph: text, inline math, more text', () => {
    const { parsed, reparsed } = roundTrip(
      'Given $a + b$ we derive $c$.',
    )
    expect(reparsed).toEqual(parsed)
  })

  test('inline math_display via $$...$$ mid-paragraph', () => {
    const { parsed, reparsed } = roundTrip('text $$x^2$$ more')
    expect(reparsed).toEqual(parsed)
  })

  test('inline math serializes with single $ delimiters', () => {
    const { serialized } = roundTrip('value is $\\pi$.')
    expect(serialized).toContain('$\\pi$')
  })

  test('block math serializes with $$ delimiters on single line', () => {
    const { serialized } = roundTrip('$$E = mc^2$$')
    expect(serialized).toContain('$$E = mc^2$$')
  })

  test('labeled fenced math preserves id through roundtrip', () => {
    const input = '```math:einstein\nE = mc^2\n```'
    const { parsed, serialized, reparsed } = roundTrip(input)
    expect(serialized).toContain('```math:einstein')
    expect(reparsed).toEqual(parsed)
    // The id is carried as an attribute on math_display.
    const node = parsed.content.find((n) => n.type === 'math_display')
    expect(node?.attrs?.id).toBe('einstein')
  })
})

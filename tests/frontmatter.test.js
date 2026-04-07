import { serializeFrontmatter } from '../src/frontmatter.js'

describe('Frontmatter Serialization', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(serializeFrontmatter(null)).toBe('')
    expect(serializeFrontmatter(undefined)).toBe('')
    expect(serializeFrontmatter({})).toBe('')
  })

  test('serializes simple params', () => {
    const result = serializeFrontmatter({ type: 'Hero' })
    expect(result).toBe('---\ntype: Hero\n---')
  })

  test('serializes multiple params', () => {
    const result = serializeFrontmatter({
      type: 'Hero',
      alignment: 'center',
    })
    expect(result).toBe('---\ntype: Hero\nalignment: center\n---')
  })

  test('skips null and undefined values', () => {
    const result = serializeFrontmatter({
      type: 'Hero',
      background: null,
      variant: undefined,
      alignment: 'center',
    })
    expect(result).toBe('---\ntype: Hero\nalignment: center\n---')
  })

  test('returns empty string when all values are null', () => {
    expect(serializeFrontmatter({ a: null, b: undefined })).toBe('')
  })

  test('serializes nested objects', () => {
    const result = serializeFrontmatter({
      type: 'Section',
      params: { width: 1200, layout: 'grid' },
    })
    expect(result).toContain('type: Section')
    expect(result).toContain('params:')
    expect(result).toContain('width: 1200')
    expect(result).toContain('layout: grid')
    expect(result).toMatch(/^---\n/)
    expect(result).toMatch(/\n---$/)
  })

  test('serializes boolean values', () => {
    const result = serializeFrontmatter({ hidden: true })
    expect(result).toBe('---\nhidden: true\n---')
  })

  test('serializes numeric values', () => {
    const result = serializeFrontmatter({ order: 3 })
    expect(result).toBe('---\norder: 3\n---')
  })

  test('serializes arrays', () => {
    const result = serializeFrontmatter({
      type: 'Page',
      tags: ['featured', 'news'],
    })
    expect(result).toContain('tags:')
    expect(result).toContain('- featured')
    expect(result).toContain('- news')
  })
})

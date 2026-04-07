import { serializeAttributes } from '../src/attributes.js'

describe('Attribute Serialization', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(serializeAttributes(null)).toBe('')
    expect(serializeAttributes(undefined)).toBe('')
    expect(serializeAttributes({})).toBe('')
  })

  test('skips null and undefined values', () => {
    expect(serializeAttributes({ role: null, src: undefined })).toBe('')
  })

  test('serializes key=value pairs', () => {
    expect(serializeAttributes({ role: 'hero' })).toBe('{role=hero}')
  })

  test('serializes multiple key=value pairs', () => {
    expect(serializeAttributes({ width: 800, height: 600 })).toBe('{width=800 height=600}')
  })

  test('quotes values with spaces', () => {
    expect(serializeAttributes({ rel: 'noopener noreferrer' })).toBe('{rel="noopener noreferrer"}')
  })

  test('serializes boolean attributes', () => {
    expect(serializeAttributes({ autoplay: true, muted: true })).toBe('{autoplay muted}')
  })

  test('serializes class as dot notation', () => {
    expect(serializeAttributes({ class: 'featured' })).toBe('{.featured}')
  })

  test('serializes multiple classes', () => {
    expect(serializeAttributes({ class: 'featured rounded shadow' })).toBe('{.featured .rounded .shadow}')
  })

  test('serializes id as hash notation', () => {
    expect(serializeAttributes({ id: 'main-logo' })).toBe('{#main-logo}')
  })

  test('serializes mixed attributes', () => {
    const result = serializeAttributes({
      class: 'featured',
      id: 'main-logo',
      width: 800,
      loading: 'lazy',
    })
    expect(result).toBe('{.featured #main-logo width=800 loading=lazy}')
  })

  test('skips specified keys', () => {
    const result = serializeAttributes(
      { src: './image.jpg', alt: 'Photo', role: 'hero' },
      ['src', 'alt']
    )
    expect(result).toBe('{role=hero}')
  })

  test('skips all keys if all are in skipKeys', () => {
    const result = serializeAttributes(
      { src: './image.jpg', alt: 'Photo' },
      ['src', 'alt']
    )
    expect(result).toBe('')
  })

  test('serializes video attributes', () => {
    const result = serializeAttributes({
      role: 'video',
      poster: './poster.jpg',
      autoplay: true,
      muted: true,
      loop: true,
    })
    expect(result).toBe('{role=video poster=./poster.jpg autoplay muted loop}')
  })

  test('serializes boolean with other attributes', () => {
    const result = serializeAttributes({
      role: 'video',
      controls: true,
      muted: true,
    })
    expect(result).toBe('{role=video controls muted}')
  })

  test('serializes download with string value', () => {
    expect(serializeAttributes({ download: 'annual-report.pdf' })).toBe('{download=annual-report.pdf}')
  })

  test('serializes download as boolean', () => {
    expect(serializeAttributes({ download: true })).toBe('{download}')
  })

  test('serializes data attributes', () => {
    const result = serializeAttributes({
      class: 'info',
      'data-tooltip': 'More info',
    })
    expect(result).toBe('{.info data-tooltip="More info"}')
  })
})

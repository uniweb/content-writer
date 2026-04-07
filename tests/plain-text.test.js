import { docToPlainText } from '../src/plain-text.js'

describe('docToPlainText', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(docToPlainText(null)).toBe('')
    expect(docToPlainText(undefined)).toBe('')
    expect(docToPlainText({})).toBe('')
    expect(docToPlainText({ type: 'doc' })).toBe('')
    expect(docToPlainText({ type: 'doc', content: [] })).toBe('')
  })

  test('extracts heading text without # prefix', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Subtitle' }] }
      ]
    }
    expect(docToPlainText(doc)).toBe('Hello World\n\nSubtitle')
  })

  test('extracts paragraph text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] }
      ]
    }
    expect(docToPlainText(doc)).toBe('First paragraph.\n\nSecond paragraph.')
  })

  test('strips bold/italic/code marks', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Some ' },
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'code', marks: [{ type: 'code' }] },
          { type: 'text', text: ' text' }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Some bold and italic and code text')
  })

  test('strips link marks, keeping link text', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Click ' },
          { type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
          { type: 'text', text: ' for more.' }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Click here for more.')
  })

  test('extracts list item text without bullet/number prefixes', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] }] }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('First item\nSecond item')
  })

  test('extracts ordered list text without number prefixes', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step one' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step two' }] }] }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Step one\nStep two')
  })

  test('extracts nested list text', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }
              ]
            }
          ]
        }]
      }]
    }
    expect(docToPlainText(doc)).toBe('Parent\nChild')
  })

  test('extracts code block content', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'js' },
        content: [{ type: 'text', text: 'const x = 1' }]
      }]
    }
    expect(docToPlainText(doc)).toBe('const x = 1')
  })

  test('extracts blockquote text', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Quoted text' }] }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Quoted text')
  })

  test('extracts table cell text', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }] }
            ]
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '30' }] }] }
            ]
          }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Name Age\nAlice 30')
  })

  test('skips images, dividers, inset refs, and data blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'image', attrs: { src: 'photo.jpg' } },
        { type: 'divider' },
        { type: 'inset_ref', attrs: { component: 'Chart' } },
        { type: 'dataBlock', attrs: { tag: 'items', data: [] } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }
      ]
    }
    expect(docToPlainText(doc)).toBe('Before\n\nAfter')
  })

  test('skips inline images within paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Text with ' },
          { type: 'image', attrs: { src: 'icon.svg', library: 'lu', name: 'star' } },
          { type: 'text', text: ' icon' }
        ]
      }]
    }
    expect(docToPlainText(doc)).toBe('Text with  icon')
  })

  test('handles mixed content document', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Introduction.' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point A' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point B' }] }] }
          ]
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Conclusion.' }] }
      ]
    }
    expect(docToPlainText(doc)).toBe('Title\n\nIntroduction.\n\nPoint A\nPoint B\n\nConclusion.')
  })
})

import { serializeInlineContent } from '../src/marks.js'

describe('Inline Content Serialization', () => {
  test('serializes plain text', () => {
    const content = [{ type: 'text', text: 'Hello world' }]
    expect(serializeInlineContent(content)).toBe('Hello world')
  })

  test('serializes bold text', () => {
    const content = [
      { type: 'text', text: 'Some ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' text' },
    ]
    expect(serializeInlineContent(content)).toBe('Some **bold** text')
  })

  test('serializes italic text', () => {
    const content = [
      { type: 'text', text: 'Some ' },
      { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' text' },
    ]
    expect(serializeInlineContent(content)).toBe('Some *italic* text')
  })

  test('serializes bold italic text', () => {
    const content = [
      {
        type: 'text',
        text: 'bold italic both',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('***bold italic both***')
  })

  test('serializes nested formatting (bold with italic inside)', () => {
    const content = [
      { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
      {
        type: 'text',
        text: 'then italic',
        marks: [{ type: 'italic' }, { type: 'bold' }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('**bold *****then italic***')
  })

  test('serializes inline code', () => {
    const content = [
      { type: 'text', text: 'Use the ' },
      { type: 'text', text: "console.log('test')", marks: [{ type: 'code' }] },
      { type: 'text', text: ' function.' },
    ]
    expect(serializeInlineContent(content)).toBe("Use the `console.log('test')` function.")
  })

  test('serializes simple link', () => {
    const content = [
      {
        type: 'text',
        text: 'Link text',
        marks: [
          { type: 'link', attrs: { href: 'https://example.com', title: 'Title' } },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[Link text](https://example.com "Title")')
  })

  test('serializes link without title', () => {
    const content = [
      {
        type: 'text',
        text: 'Link',
        marks: [
          { type: 'link', attrs: { href: 'https://example.com', title: null } },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[Link](https://example.com)')
  })

  test('serializes link with attributes', () => {
    const content = [
      {
        type: 'text',
        text: 'External Link',
        marks: [
          {
            type: 'link',
            attrs: {
              href: 'https://example.com',
              title: null,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe(
      '[External Link](https://example.com){target=_blank rel="noopener noreferrer"}'
    )
  })

  test('serializes download link (boolean)', () => {
    const content = [
      {
        type: 'text',
        text: 'Download PDF',
        marks: [
          {
            type: 'link',
            attrs: { href: './document.pdf', title: null, download: true },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[Download PDF](./document.pdf){download}')
  })

  test('serializes download link with filename', () => {
    const content = [
      {
        type: 'text',
        text: 'Get Report',
        marks: [
          {
            type: 'link',
            attrs: { href: './data.pdf', title: null, download: 'annual-report.pdf' },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe(
      '[Get Report](./data.pdf){download=annual-report.pdf}'
    )
  })

  test('serializes button link', () => {
    const content = [
      {
        type: 'text',
        text: 'Button Text',
        marks: [
          {
            type: 'button',
            attrs: { href: 'https://example.com', title: null, variant: 'primary' },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[Button Text](button:https://example.com)')
  })

  test('serializes button with non-default variant', () => {
    const content = [
      {
        type: 'text',
        text: 'Get Started',
        marks: [
          {
            type: 'button',
            attrs: { href: 'https://example.com', title: null, variant: 'secondary', size: 'lg' },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe(
      '[Get Started](button:https://example.com){variant=secondary size=lg}'
    )
  })

  test('serializes button with icon', () => {
    const content = [
      {
        type: 'text',
        text: 'Learn More',
        marks: [
          {
            type: 'button',
            attrs: { href: 'https://example.com', title: null, variant: 'primary', icon: 'arrow-right' },
          },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe(
      '[Learn More](button:https://example.com){icon=arrow-right}'
    )
  })

  test('serializes span with class', () => {
    const content = [
      { type: 'text', text: 'This is ' },
      {
        type: 'text',
        text: 'highlighted text',
        marks: [{ type: 'span', attrs: { class: 'highlight' } }],
      },
      { type: 'text', text: ' in a sentence.' },
    ]
    expect(serializeInlineContent(content)).toBe(
      'This is [highlighted text]{.highlight} in a sentence.'
    )
  })

  test('serializes span with multiple classes', () => {
    const content = [
      {
        type: 'text',
        text: 'important note',
        marks: [{ type: 'span', attrs: { class: 'callout bold' } }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[important note]{.callout .bold}')
  })

  test('serializes span with id and class', () => {
    const content = [
      {
        type: 'text',
        text: 'key term',
        marks: [{ type: 'span', attrs: { class: 'highlight', id: 'glossary-term' } }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[key term]{.highlight #glossary-term}')
  })

  test('serializes span with custom attributes', () => {
    const content = [
      {
        type: 'text',
        text: 'tooltip text',
        marks: [{ type: 'span', attrs: { class: 'info', 'data-tooltip': 'More info' } }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[tooltip text]{.info data-tooltip="More info"}')
  })

  test('serializes inline icon image', () => {
    const content = [
      {
        type: 'image',
        attrs: {
          src: null,
          caption: null,
          alt: null,
          role: 'icon',
          library: 'lu',
          name: 'home',
        },
      },
      { type: 'text', text: ' ' },
      {
        type: 'text',
        text: 'Sports',
        marks: [
          { type: 'link', attrs: { href: '/sports', title: null } },
        ],
      },
    ]
    expect(serializeInlineContent(content)).toBe('![](lu-home) [Sports](/sports)')
  })

  test('serializes multiple spans in same paragraph', () => {
    const content = [
      {
        type: 'text',
        text: 'first',
        marks: [{ type: 'span', attrs: { class: 'highlight' } }],
      },
      { type: 'text', text: ' normal ' },
      {
        type: 'text',
        text: 'second',
        marks: [{ type: 'span', attrs: { class: 'muted' } }],
      },
    ]
    expect(serializeInlineContent(content)).toBe('[first]{.highlight} normal [second]{.muted}')
  })

  test('serializes link and span in same paragraph', () => {
    const content = [
      {
        type: 'text',
        text: 'Link',
        marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
      },
      { type: 'text', text: ' and ' },
      {
        type: 'text',
        text: 'span',
        marks: [{ type: 'span', attrs: { class: 'highlight' } }],
      },
    ]
    expect(serializeInlineContent(content)).toBe(
      '[Link](https://example.com) and [span]{.highlight}'
    )
  })

  test('returns empty string for empty content', () => {
    expect(serializeInlineContent([])).toBe('')
    expect(serializeInlineContent(null)).toBe('')
    expect(serializeInlineContent(undefined)).toBe('')
  })

  test('serializes text with special characters', () => {
    const content = [
      { type: 'text', text: `text with 'single', "double", & specials` },
    ]
    expect(serializeInlineContent(content)).toBe(`text with 'single', "double", & specials`)
  })
})

import { serializeDoc } from '../src/serializer.js'

describe('Document Serialization', () => {
  test('serializes plain text paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('Hello world')
  })

  test('serializes multiple paragraphs with blank line separation', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    }
    expect(serializeDoc(doc)).toBe('First\n\nSecond')
  })

  test('serializes headings', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, id: null },
          content: [{ type: 'text', text: 'Main Title' }],
        },
        {
          type: 'heading',
          attrs: { level: 2, id: null },
          content: [{ type: 'text', text: 'Subtitle' }],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('# Main Title\n\n## Subtitle')
  })

  test('serializes formatted text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Some ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' text' },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('Some **bold** and *italic* text')
  })

  test('serializes dividers', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] },
        { type: 'divider', attrs: { style: 'line', size: 'normal' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'More text' }] },
      ],
    }
    expect(serializeDoc(doc)).toBe('Text\n\n---\n\nMore text')
  })
})

describe('Image Serialization', () => {
  test('serializes basic image', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'path/to/image.svg', caption: null, alt: 'Alt Text', role: 'image' },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Alt Text](path/to/image.svg)')
  })

  test('serializes image with caption', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './photo.jpg',
            alt: 'Photo',
            caption: 'A beautiful photo',
            role: 'image',
            width: 800,
            height: 600,
            loading: 'lazy',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe(
      '![Photo](./photo.jpg "A beautiful photo"){width=800 height=600 loading=lazy}'
    )
  })

  test('serializes image with role attribute', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: './hero.jpg', alt: 'Hero Image', caption: null, role: 'hero' },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Hero Image](./hero.jpg){role=hero}')
  })

  test('serializes video with attributes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './intro.mp4',
            alt: 'Intro Video',
            caption: null,
            role: 'video',
            poster: './poster.jpg',
            autoplay: true,
            muted: true,
            loop: true,
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe(
      '![Intro Video](./intro.mp4){role=video poster=./poster.jpg autoplay muted loop}'
    )
  })

  test('serializes PDF with preview', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './guide.pdf',
            alt: 'User Guide',
            caption: null,
            role: 'pdf',
            preview: './guide-preview.jpg',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![User Guide](./guide.pdf){role=pdf preview=./guide-preview.jpg}')
  })

  test('serializes image with class and id', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './logo.svg',
            alt: 'Logo',
            caption: null,
            role: 'image',
            class: 'featured',
            id: 'main-logo',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Logo](./logo.svg){.featured #main-logo}')
  })

  test('serializes image with multiple classes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './photo.jpg',
            alt: 'Gallery',
            caption: null,
            role: 'image',
            class: 'featured rounded shadow',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Gallery](./photo.jpg){.featured .rounded .shadow}')
  })

  test('serializes image with fit and position', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: './bg.jpg',
            alt: 'Background',
            caption: null,
            role: 'image',
            fit: 'cover',
            position: 'center',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Background](./bg.jpg){fit=cover position=center}')
  })

  test('serializes icon with library and name (dash format)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
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
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![](lu-home)')
  })

  test('serializes icon with src (icon: prefix)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'path/to/image.svg',
                caption: 'Caption text',
                alt: 'Alt Text',
                role: 'icon',
              },
            },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('![Alt Text](icon:path/to/image.svg "Caption text")')
  })
})

describe('Component References', () => {
  test('serializes bare @ComponentName', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'inset_ref', attrs: { component: 'Hero', alt: null } },
      ],
    }
    expect(serializeDoc(doc)).toBe('![](@Hero)')
  })

  test('serializes @ComponentName with alt and params', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'inset_ref',
          attrs: {
            component: 'NetworkDiagram',
            alt: 'Architecture diagram',
            variant: 'compact',
            size: 'lg',
          },
        },
      ],
    }
    expect(serializeDoc(doc)).toBe(
      '![Architecture diagram](@NetworkDiagram){variant=compact size=lg}'
    )
  })

  test('serializes multiple component refs', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'inset_ref', attrs: { component: 'Widget', alt: null } },
        { type: 'inset_ref', attrs: { component: 'Chart', alt: null } },
      ],
    }
    expect(serializeDoc(doc)).toBe('![](@Widget)\n\n![](@Chart)')
  })
})

describe('Code Blocks', () => {
  test('serializes fenced code block with language', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: "const x = 1;\nconsole.log('x:', x);" }],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe("```javascript\nconst x = 1;\nconsole.log('x:', x);\n```")
  })

  test('serializes code block without language', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'line 1\n\nline 2' }],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('```\nline 1\n\nline 2\n```')
  })

  test('serializes data block', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'dataBlock',
          attrs: { tag: 'nav-links', data: [{ label: 'Home' }] },
        },
      ],
    }
    const expected = '```json:nav-links\n[\n  {\n    "label": "Home"\n  }\n]\n```'
    expect(serializeDoc(doc)).toBe(expected)
  })
})

describe('Blockquotes', () => {
  test('serializes simple blockquote', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Quoted text' }] },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('> Quoted text')
  })

  test('serializes multi-paragraph blockquote', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('> First paragraph\n>\n> Second paragraph')
  })
})

describe('Lists', () => {
  test('serializes bullet list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third item' }] }] },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('- First item\n- Second item\n- Third item')
  })

  test('serializes ordered list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third item' }] }] },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe('1. First item\n2. Second item\n3. Third item')
  })

  test('serializes nested lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'First item' }] },
                {
                  type: 'bulletList',
                  content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested item 1' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested item 2' }] }] },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] },
                {
                  type: 'orderedList',
                  attrs: { start: 1 },
                  content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested ordered 1' }] }] },
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested ordered 2' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const expected = [
      '- First item',
      '  - Nested item 1',
      '  - Nested item 2',
      '- Second item',
      '  1. Nested ordered 1',
      '  2. Nested ordered 2',
    ].join('\n')
    expect(serializeDoc(doc)).toBe(expected)
  })

  test('serializes list items with formatted text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Item with ' },
                    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
                    { type: 'text', text: ' text' },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Item with ' },
                    {
                      type: 'text',
                      text: 'link',
                      marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(serializeDoc(doc)).toBe(
      '- Item with **bold** text\n- Item with [link](https://example.com)'
    )
  })
})

describe('Tables', () => {
  test('serializes basic table', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column 1' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column 2' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }] },
              ],
            },
          ],
        },
      ],
    }
    const expected = [
      '| Column 1 | Column 2 |',
      '| --- | --- |',
      '| Cell 1 | Cell 2 |',
    ].join('\n')
    expect(serializeDoc(doc)).toBe(expected)
  })

  test('serializes table with alignments', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'left', header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'center', header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Center' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'right', header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'left', header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'center', header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'right', header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '3' }] }] },
              ],
            },
          ],
        },
      ],
    }
    const expected = [
      '| Left | Center | Right |',
      '| :--- | :---: | ---: |',
      '| 1 | 2 | 3 |',
    ].join('\n')
    expect(serializeDoc(doc)).toBe(expected)
  })

  test('serializes table with formatted content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Style' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Example' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: null, header: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'text', marks: [{ type: 'bold' }] }] }] },
              ],
            },
          ],
        },
      ],
    }
    const expected = [
      '| Style | Example |',
      '| --- | --- |',
      '| Bold | **text** |',
    ].join('\n')
    expect(serializeDoc(doc)).toBe(expected)
  })
})

describe('Edge Cases', () => {
  test('handles empty document', () => {
    expect(serializeDoc({ type: 'doc', content: [] })).toBe('')
    expect(serializeDoc({ type: 'doc' })).toBe('')
    expect(serializeDoc(null)).toBe('')
  })

  test('skips unknown node types', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] },
        { type: 'unknownNode', attrs: {} },
        { type: 'paragraph', content: [{ type: 'text', text: 'More' }] },
      ],
    }
    expect(serializeDoc(doc)).toBe('Text\n\nMore')
  })
})

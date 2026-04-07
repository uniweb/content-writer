/**
 * Round-trip tests: markdown → content-reader → content-writer → content-reader
 *
 * Verifies that ProseMirror documents survive the round trip without
 * information loss. Output markdown may differ in formatting (whitespace,
 * attribute order) but must parse to the same ProseMirror structure.
 */

import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown } from '../src/index.js'

/**
 * Test that markdown survives a round trip through reader → writer → reader.
 * Compares ProseMirror documents, not markdown strings.
 */
function testRoundTrip(markdown, description) {
  test(description || markdown.trim().slice(0, 60), () => {
    const parsed = markdownToProseMirror(markdown)
    const serialized = proseMirrorToMarkdown(parsed)
    const reparsed = markdownToProseMirror(serialized)
    expect(reparsed).toEqual(parsed)
  })
}

describe('Round-trip: Basic Formatting', () => {
  testRoundTrip('Hello world', 'plain text')

  testRoundTrip(
    `text with 'single', "double", & specials`,
    'special characters'
  )

  testRoundTrip(
    'Some **bold** and *italic* text',
    'bold and italic'
  )

  testRoundTrip(
    '***bold italic both***',
    'triple bold italic'
  )

  testRoundTrip(
    '# Main Title\n\n## Subtitle',
    'headings'
  )

  testRoundTrip(
    'Text\n\n---\n\nMore text',
    'dividers'
  )
})

describe('Round-trip: Links', () => {
  testRoundTrip(
    '[Link text](https://example.com "Title")',
    'link with title'
  )

  testRoundTrip(
    '[Link](https://example.com)',
    'link without title'
  )

  testRoundTrip(
    '[External Link](https://example.com){target=_blank rel="noopener noreferrer"}',
    'link with attributes'
  )

  testRoundTrip(
    '[Download PDF](./document.pdf){download}',
    'download link (boolean)'
  )

  testRoundTrip(
    '[Get Report](./data.pdf){download="annual-report.pdf"}',
    'download link with filename'
  )
})

describe('Round-trip: Buttons', () => {
  testRoundTrip(
    '[Button Text](button:https://example.com)',
    'basic button'
  )

  // Note: .button class syntax round-trips to button: prefix (both are equivalent)
  test('button with variant and size', () => {
    // .button class → button: prefix is expected normalization
    const markdown = '[Get Started](https://example.com){.button variant=secondary size=lg}'
    const parsed = markdownToProseMirror(markdown)
    const serialized = proseMirrorToMarkdown(parsed)
    const reparsed = markdownToProseMirror(serialized)
    expect(reparsed).toEqual(parsed)
  })

  test('button with icon', () => {
    const markdown = '[Learn More](https://example.com){.button icon=arrow-right}'
    const parsed = markdownToProseMirror(markdown)
    const serialized = proseMirrorToMarkdown(parsed)
    const reparsed = markdownToProseMirror(serialized)
    expect(reparsed).toEqual(parsed)
  })
})

describe('Round-trip: Images', () => {
  testRoundTrip(
    '![Alt Text](path/to/image.svg)',
    'basic image'
  )

  testRoundTrip(
    '![Alt Text](https://test.com)',
    'image with URL'
  )

  testRoundTrip(
    '![Hero Image](./hero.jpg){role=hero}',
    'image with role'
  )

  testRoundTrip(
    '![Photo](./photo.jpg "A beautiful photo"){width=800 height=600 loading=lazy}',
    'image with caption and attributes'
  )

  testRoundTrip(
    '![Logo](./logo.svg){.featured #main-logo}',
    'image with class and id'
  )

  testRoundTrip(
    '![Gallery](./photo.jpg){.featured .rounded .shadow}',
    'image with multiple classes'
  )

  testRoundTrip(
    '![Background](./bg.jpg){fit=cover position=center}',
    'image with fit and position'
  )
})

describe('Round-trip: Video and PDF', () => {
  testRoundTrip(
    '![Intro Video](./intro.mp4){role=video poster=./poster.jpg autoplay muted loop}',
    'video with attributes'
  )

  testRoundTrip(
    '![Demo Video](./demo.mp4){role=video controls muted}',
    'video with controls'
  )

  testRoundTrip(
    '![User Guide](./guide.pdf){role=pdf preview=./guide-preview.jpg}',
    'PDF with preview'
  )
})

describe('Round-trip: Icons', () => {
  testRoundTrip(
    '![](lu-home)',
    'icon dash format'
  )

  testRoundTrip(
    '![](lu-home) [Sports](/sports)',
    'icon with adjacent link'
  )

  test('icon colon format normalizes to dash format', () => {
    // lu:home → lu-home is expected normalization
    const markdown = '![](lu:home)'
    const parsed = markdownToProseMirror(markdown)
    const serialized = proseMirrorToMarkdown(parsed)
    expect(serialized).toBe('![](lu-home)')
    const reparsed = markdownToProseMirror(serialized)
    expect(reparsed).toEqual(parsed)
  })
})

describe('Round-trip: Spans', () => {
  testRoundTrip(
    'This is [highlighted text]{.highlight} in a sentence.',
    'span with class'
  )

  testRoundTrip(
    '[important note]{.callout .bold}',
    'span with multiple classes'
  )

  testRoundTrip(
    '[key term]{.highlight #glossary-term}',
    'span with id and class'
  )

  testRoundTrip(
    '[tooltip text]{.info data-tooltip="More info"}',
    'span with custom attributes'
  )

  testRoundTrip(
    '[first]{.highlight} normal [second]{.muted}',
    'multiple spans'
  )

  testRoundTrip(
    '[Link](https://example.com) and [span]{.highlight}',
    'link and span in same paragraph'
  )
})

describe('Round-trip: Component References', () => {
  testRoundTrip(
    '![](@Hero)',
    'bare component ref'
  )

  testRoundTrip(
    '![Architecture diagram](@NetworkDiagram){variant=compact size=lg}',
    'component ref with alt and params'
  )

  testRoundTrip(
    '![](@Widget)\n\n![](@Chart)',
    'multiple component refs'
  )
})

describe('Round-trip: Code', () => {
  testRoundTrip(
    '```javascript\nconst x = 1;\nconsole.log(\'x:\', x);\n```',
    'fenced code block'
  )

  testRoundTrip(
    '```\nline 1\n\nline 2\n```',
    'code block without language'
  )

  testRoundTrip(
    'Use the `console.log(\'test\')` function.',
    'inline code'
  )

  testRoundTrip(
    '```json:nav-links\n[{"label": "Home"}]\n```',
    'tagged data block'
  )
})

describe('Round-trip: Lists', () => {
  testRoundTrip(
    '- First item\n- Second item\n- Third item',
    'bullet list'
  )

  testRoundTrip(
    '1. First item\n2. Second item\n3. Third item',
    'ordered list'
  )

  testRoundTrip(
    '- First item\n  - Nested item 1\n  - Nested item 2\n- Second item\n  1. Nested ordered 1\n  2. Nested ordered 2',
    'nested lists'
  )

  testRoundTrip(
    '- Item with **bold** text\n- Item with *italic* text\n- Item with [link](https://example.com)',
    'list items with formatted text'
  )
})

describe('Round-trip: Tables', () => {
  testRoundTrip(
    '| Column 1 | Column 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n| Cell 3   | Cell 4   |',
    'basic table'
  )

  testRoundTrip(
    '| Left | Center | Right |\n|:-----|:------:|------:|\n| 1    |   2    |     3 |',
    'table with alignments'
  )

  testRoundTrip(
    '| Style | Example |\n|-------|--------|\n| Bold | **text** |\n| Link | [link](https://example.com) |',
    'table with formatted content'
  )
})

describe('Round-trip: Mixed Content', () => {
  testRoundTrip(
    '# Title\n\nSome text with **bold** and *italic*.\n\n---\n\n![Image](./photo.jpg)\n\nMore text.',
    'mixed content document'
  )

  test('paragraph with extracted image', () => {
    // "Text ![img](src) more" → reader extracts image to block level
    // Writer must handle the extracted structure correctly
    const markdown = 'Some text before\n\n![Widget](./widget.png)\n\nand after'
    const parsed = markdownToProseMirror(markdown)
    const serialized = proseMirrorToMarkdown(parsed)
    const reparsed = markdownToProseMirror(serialized)
    expect(reparsed).toEqual(parsed)
  })
})

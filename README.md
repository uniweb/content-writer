# Content Writer

A JavaScript library for converting ProseMirror/TipTap document JSON back to Markdown. The inverse of [@uniweb/content-reader](https://github.com/uniweb/content-reader).

## Features

- Full round-trip fidelity with `@uniweb/content-reader`
- Headings, paragraphs, blockquotes, horizontal rules
- Bold, italic, inline code, and nested formatting
- Links with title, attributes, and download support
- Buttons with variant, size, and icon attributes
- Bracketed spans with class, ID, and custom attributes
- Images with role, caption, dimensions, fit/position
- Video and PDF media with playback/preview attributes
- Icons (library+name dash format and `icon:` prefix)
- Component references (`@ComponentName` inset syntax)
- Fenced code blocks with language and tagged data blocks
- Bullet and ordered lists with nesting
- GFM tables with column alignment
- YAML frontmatter serialization
- Plain text extraction (no formatting, just content)

## Installation

```bash
npm install @uniweb/content-writer
```

## Usage

### Convert ProseMirror to Markdown

```javascript
import { proseMirrorToMarkdown } from '@uniweb/content-writer'

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Hello World' }]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' text.' }
      ]
    }
  ]
}

const markdown = proseMirrorToMarkdown(doc)
// # Hello World
//
// This is **bold** text.
```

### Serialize a Complete Section File

```javascript
import { serializeSection } from '@uniweb/content-writer'

const params = { type: 'Hero', alignment: 'center' }
const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome' }] }
  ]
}

const file = serializeSection(params, doc)
// ---
// type: Hero
// alignment: center
// ---
//
// # Welcome
```

### Serialize Frontmatter Only

```javascript
import { serializeFrontmatter } from '@uniweb/content-writer'

const yaml = serializeFrontmatter({ type: 'Hero', hidden: true })
// ---
// type: Hero
// hidden: true
// ---
```

### Extract Plain Text

Strip all formatting and return just the text content. Useful for word counting, search indexing, and generating summaries.

```javascript
import { docToPlainText } from '@uniweb/content-writer'

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Click ' },
        { type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: '/page' } }] },
        { type: 'text', text: ' for details.' }
      ]
    }
  ]
}

const text = docToPlainText(doc)
// Title
//
// Click here for details.
```

`docToPlainText` preserves text from headings, paragraphs, lists, code blocks, blockquotes, and tables. It strips all marks (bold, italic, links) and skips images, dividers, component references, and data blocks.

### Using with TipTap

```javascript
import { Editor } from '@tiptap/core'
import { proseMirrorToMarkdown } from '@uniweb/content-writer'

// Get markdown from editor state
const markdown = proseMirrorToMarkdown(editor.getJSON())
```

## Extended Syntax

The serializer handles the same extended syntax as `@uniweb/content-reader`:

### Curly Brace Attributes

```markdown
![Hero](./hero.jpg){role=hero width=1200 fit=cover}
[Styled text]{.highlight .large}
[Download](./file.pdf){download="report.pdf"}
```

### Buttons

```markdown
[Get Started](button:https://example.com){variant=primary size=lg}
[Learn More](button:/docs){variant=secondary icon=arrow-right}
```

### Icons

```markdown
![](lu-house)
![Logo](icon:./logo.svg)
```

### Component References

```markdown
![description](@ComponentName){param=value}
```

### Tables with Alignment

```markdown
| Left | Center | Right |
| :--- | :----: | ----: |
| Text |  Text  |  Text |
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `proseMirrorToMarkdown` | `(doc) => string` | Convert ProseMirror document JSON to markdown |
| `serializeSection` | `(params, doc) => string` | Serialize frontmatter + body as a complete file |
| `serializeFrontmatter` | `(params) => string` | Serialize an object to a YAML frontmatter block |
| `docToPlainText` | `(doc) => string` | Extract plain text content (no formatting) |

## Development

```bash
git clone https://github.com/uniweb/content-writer.git
cd content-writer
npm install
npm test
```

## License

GPL-3.0-or-later

/**
 * Source-fidelity round trip: does `source.md` survive reader → writer as the
 * *same text*, not merely as the same ProseMirror structure?
 *
 * `roundtrip.test.js` already asserts the structural fixed point (reparse the
 * output, compare documents). That test cannot catch a whole class of defect:
 * the file-lane bug where the second pass is stable but the *first* pass has
 * already rewritten the author's source. D1 was exactly that shape — a code
 * span holding `<name>` re-serialized as `&lt;name&gt;`, which reparses to
 * the same document forever after.
 *
 * That matters beyond tidiness. `content-writer` is what the editor uses to
 * sync ProseMirror back to markdown files, so anything this test tolerates is
 * something the editor will eventually write into a developer's repository.
 * The app lane has no source file to diff against, so this is the only place
 * the codec can be checked at all.
 *
 * Known defects are an explicit allowlist below. They assert the *current*
 * wrong output, so fixing one fails this test and forces the entry to be
 * removed — the allowlist can only shrink.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { markdownToProseMirror } from '@uniweb/content-reader'
import { proseMirrorToMarkdown } from '../src/index.js'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'roundtrip')

/**
 * Cosmetic normalization applied to BOTH sides before comparing.
 *
 * Declared, not incidental — each entry is a difference we have decided is
 * not a defect. Keep this list short; anything added here is fidelity given
 * up permanently.
 */
function normalize(markdown) {
  return (
    markdown
      // Table cell padding and delimiter width. Markdown tables are
      // whitespace-insensitive between pipes, so `|---|---|` and
      // `| --- | --- |` are the same table — as are `| |` and `|  |`.
      .replace(/^\|.*\|$/gm, normalizeTableRow)
      // Hard breaks have two spellings. Two trailing spaces is the classic
      // one; the serializer deliberately emits a backslash instead, because it
      // survives editors and pre-commit hooks that strip trailing whitespace.
      // Fold both to the backslash so a real hard break is not read as a diff
      // — and so stripping trailing space below cannot silently delete one.
      .replace(/[ \t]{2,}$/gm, '\\')
      // Remaining trailing whitespace, and the final newline.
      .replace(/[ \t]+$/gm, '')
      .trim()
  )
}

/**
 * Canonicalize one table row: trim every cell, collapse delimiter runs.
 * @param {string} line
 * @returns {string}
 */
function normalizeTableRow(line) {
  const cells = line.slice(1, -1).split('|').map(cell => {
    const trimmed = cell.trim()
    return /^:?-{2,}:?$/.test(trimmed) ? trimmed.replace(/-+/, '---') : trimmed
  })
  return `| ${cells.join(' | ')} |`
}

/**
 * Intentional canonicalizations: the projection differs from the source and
 * that is the designed behavior, not a bug. Separate from the defect list
 * below because these never "get fixed" — they are the serializer's chosen
 * spelling, and the entry exists so the choice stays deliberate.
 */
const CANONICAL_FORMS = {
  'canonical-math.md': {
    reason: 'single-line display math canonicalizes to the compact $$…$$ spelling',
    // `serializeMathDisplay` documents this: compact for one line, fenced
    // ```math for multi-line. Both read back as the same node.
    current: '$$E = mc^2$$'
  },
}

/**
 * Defects known to corrupt source today, each with the output it currently
 * produces. Fixing one makes its assertion fail, which is the point: the entry
 * then has to come out, so this list can only shrink.
 */
const KNOWN_DEFECTS = {
  // Empty, and that is the point of the mechanism rather than a claim of
  // perfection. Four entries lived here and each left by being fixed:
  //
  //   D1 — a code span's `<name>` written back as `&lt;name&gt;`
  //   D2 — bold mishandled around a code span (and dropped outright when it
  //        wrapped only one)
  //   D5 — a bold link re-nested to [**x**](url)
  //   D4 — a tagged data block's YAML rewritten as JSON
  //   D3 — a loose list re-serialized tight
  //
  // D2 and D5 turned out to be one bug (the serializer ignoring `node.marks`
  // order); D1, D3 and D4 were all the same shape as each other — the reader
  // dropping something the writer then had to guess at.
  //
  // Add an entry when you find a defect you are not fixing today, with the
  // wrong output it currently produces. Fixing it will break the entry, which
  // is what forces the removal: this list can only shrink.
}

const fixtures = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.md')).sort()

describe('source-fidelity round trip', () => {
  test('the fixture corpus is not empty', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const name of fixtures) {
    const source = readFileSync(join(FIXTURE_DIR, name), 'utf8')
    const canonical = CANONICAL_FORMS[name]
    const known = KNOWN_DEFECTS[name]

    if (canonical) {
      test(`${name} — canonicalized: ${canonical.reason}`, () => {
        const projected = proseMirrorToMarkdown(markdownToProseMirror(source))
        expect(normalize(projected)).toBe(normalize(canonical.current))
      })
      continue
    }

    if (known) {
      test(`${name} — known defect: ${known.defect}`, () => {
        const projected = proseMirrorToMarkdown(markdownToProseMirror(source))
        expect(normalize(projected)).toBe(normalize(known.current))
        // Guard the guard: if this ever equals the source, the defect is
        // fixed and the allowlist entry must be deleted.
        expect(normalize(projected)).not.toBe(normalize(source))
      })
      continue
    }

    test(`${name} round-trips to its source`, () => {
      const projected = proseMirrorToMarkdown(markdownToProseMirror(source))
      expect(normalize(projected)).toBe(normalize(source))
    })
  }

  test('every allowlist entry names a real fixture', () => {
    for (const name of [...Object.keys(KNOWN_DEFECTS), ...Object.keys(CANONICAL_FORMS)]) {
      expect(fixtures).toContain(name)
    }
  })
})

describe('structural fixed point holds for every fixture', () => {
  // Even a fixture with a known source-level defect must be stable on the
  // second pass — otherwise the defect compounds on each sync.
  for (const name of fixtures) {
    test(`${name} is stable on re-serialization`, () => {
      const source = readFileSync(join(FIXTURE_DIR, name), 'utf8')
      const once = proseMirrorToMarkdown(markdownToProseMirror(source))
      const twice = proseMirrorToMarkdown(markdownToProseMirror(once))
      expect(twice).toBe(once)
    })
  }
})

describe('list looseness', () => {
  const rt = md => proseMirrorToMarkdown(markdownToProseMirror(md)).trim()

  test('a tight list stays tight', () => {
    expect(rt('- one\n- two')).toBe('- one\n- two')
  })

  test('a loose list keeps its blank lines', () => {
    expect(rt('- one\n\n- two')).toBe('- one\n\n- two')
  })

  test('looseness applies inside an item too, not just between items', () => {
    const source = '- parent\n\n  - child\n  - sibling\n\n- next'
    expect(rt(source)).toBe(source)
  })

  test('ordered lists carry looseness alongside start', () => {
    expect(rt('1. a\n\n2. b')).toBe('1. a\n\n2. b')
  })

  test('a nested list is loose independently of its parent', () => {
    expect(rt('- parent\n  - child\n  - sibling\n- next')).toBe('- parent\n  - child\n  - sibling\n- next')
  })

  test('a list node with no loose flag serializes tight', () => {
    // Documents written before the reader recorded looseness.
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: ['one', 'two'].map(t => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }]
        }))
      }]
    }
    expect(proseMirrorToMarkdown(doc).trim()).toBe('- one\n- two')
  })
})

describe('blocks inside list items', () => {
  const rt = md => proseMirrorToMarkdown(markdownToProseMirror(md)).trim()
  const itemChildren = md => markdownToProseMirror(md).content[0].content[0].content.map(n => n.type)

  test('a fenced block under a bullet stays a code block', () => {
    // It used to be lexed as inline and folded into the item's paragraph,
    // losing the fence, the language and the line breaks — in the rendered
    // page, not only on a round trip.
    expect(itemChildren('- Use it:\n  ```jsx\n  const x = 1\n  ```')).toEqual(['paragraph', 'codeBlock'])
  })

  test('a blockquote under a bullet stays a blockquote', () => {
    expect(itemChildren('- Item\n  > quoted')).toEqual(['paragraph', 'blockquote'])
  })

  test('a nested list is still a nested list', () => {
    expect(itemChildren('- parent\n  - child')).toEqual(['paragraph', 'bulletList'])
  })

  test('multiple paragraphs in one item survive', () => {
    expect(itemChildren('- First\n\n  Second\n\n- Next')).toEqual(['paragraph', 'paragraph'])
  })

  test('a code block round-trips inside a tight list', () => {
    const source = '- Use the hook:\n  ```jsx\n  const x = 1\n  ```\n- Next item'
    expect(rt(source)).toBe(source)
  })

  test('a code block round-trips inside a loose list', () => {
    const source = '- Use the hook:\n\n  ```jsx\n  const x = 1\n  ```\n\n- Next item'
    expect(rt(source)).toBe(source)
  })

  test('an ordered item indents its block to the wider bullet', () => {
    const source = '1. Step one\n   ```sh\n   run it\n   ```\n2. Step two'
    expect(rt(source)).toBe(source)
  })
})

describe('containers — the block form of an inset', () => {
  const rt = md => proseMirrorToMarkdown(markdownToProseMirror(md)).trim()

  test('a container round-trips with its params', () => {
    const source = '```@Alert{type=warning}\nBe careful.\n```'
    expect(rt(source)).toBe(source)
  })

  test('a rich body survives — marks, links and blocks', () => {
    const source = '```@Details\nA **summary**\n\nBody with [a link](/x).\n```'
    expect(rt(source)).toBe(source)
  })

  test('the outer fence widens for a code block inside', () => {
    // What makes a code sample in a callout possible, and why the body
    // cannot be inline-only.
    const source = '````@Alert{type=info}\nDo not:\n\n```js\nconst x = 1\n```\n````'
    expect(rt(source)).toBe(source)
  })

  test('the editor containers normalize onto CONCEPT blocks, not insets', () => {
    // Changed 2026-07-31. These used to become `@Alert` and `@Details` — an
    // inset naming the component that renders it, which is a rendering
    // decision living in content. A concept block names what the content IS
    // and leaves rendering to the foundation.
    const text = t => ({ type: 'text', text: t })
    const doc = node => proseMirrorToMarkdown({ type: 'doc', content: [node] }).trim()

    // The editor's `type` becomes the TAG: a warning and a note are different
    // kinds of thing, not one kind with a parameter. `info` is still the
    // default, and still not `warning` — a name-derived mapping drops that.
    expect(doc({ type: 'WarningBlock', attrs: {}, content: [text('Careful.')] }))
      .toBe('```md:info\nCareful.\n```')
    expect(doc({ type: 'WarningBlock', attrs: { type: 'warning' }, content: [text('Careful.')] }))
      .toBe('```md:warning\nCareful.\n```')

    // The summary becomes the leading HEADING, which is what makes this
    // lossless: a concept block's items come from its headings, so the summary
    // recovers as the item's title and the body as its paragraphs. As a
    // paragraph — what this produced while the target was an inset — the two
    // were indistinguishable coming back.
    expect(doc({
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [text('Breaking '), { type: 'text', text: 'changes', marks: [{ type: 'bold' }] }] },
        { type: 'detailsContent', content: [{ type: 'paragraph', content: [text('Body.')] }] },
      ],
    })).toBe('```md:details\n# Breaking **changes**\n\nBody.\n```')
  })

})

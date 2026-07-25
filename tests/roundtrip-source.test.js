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
      // Trailing whitespace and the final newline.
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
  'canonical-bold-link.md': {
    reason: 'a bold link always serializes as [**text**](url), whatever the source order',
    // `**[x](url)**` and `[**x**](url)` parse to the SAME document: marks on a
    // ProseMirror text node are an unordered set, so which one the author
    // wrote is not recorded anywhere. The writer picks one spelling, and no
    // amount of care in the writer can recover the other — the information is
    // gone by the time it gets there. Classified as canonical rather than a
    // defect so nobody goes looking for a fix that cannot exist.
    current: '- [**Predicates**](./predicates.md) — filtering with `where:` clauses'
  }
}

/**
 * Defects known to corrupt source today, each with the output it currently
 * produces. Fixing one makes its assertion fail, which is the point: the entry
 * then has to come out, so this list can only shrink.
 */
const KNOWN_DEFECTS = {
  'defect-bold-code.md': {
    defect: 'D2 — bold is mishandled around an inline code span',
    // Two distinct failures. First: bold spanning text and code splits into
    // three runs, emitting `**Preview with **` — invalid markdown. Second,
    // and worse: when bold wraps ONLY a code span, the
    // mark is dropped outright (`serializeTextWithMarks` returns early on
    // `code` and never consults bold/italic), so styling is silently lost.
    current: '- **Preview with **`pnpm dev`**.**\n\nUse `npm install` first.'
  },
  'defect-loose-list.md': {
    defect: 'D3 — blank lines between list items are not preserved',
    // A loose list re-serializes tight. Renders the same; the author's source
    // spacing is still rewritten under them.
    current: '- one\n- two\n- three'
  },
  'defect-data-block.md': {
    defect: 'D4 — a tagged data block loses its source serialization format',
    // Found while building this harness. The reader
    // parses ```yaml:nav into `{ type: 'dataBlock', attrs: { tag, data } }`,
    // keeping the parsed value but not the format it was written in, so the
    // writer has no way to know it was YAML and emits JSON. An author's YAML
    // block silently becomes JSON on an editor sync. Same shape as D1: the
    // information is destroyed by the reader, so the fix is an additive
    // `attrs.format` in content-reader, not a guess in the writer.
    current: '# Navigation\n\n```json:nav\n[\n  {\n    "label": "Docs",\n    "href": "/docs"\n  }\n]\n```'
  }
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

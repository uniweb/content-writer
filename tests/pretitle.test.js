/**
 * `#>` label lines (pretitles) round-trip through read → write.
 *
 * The hash count means nothing but is preserved — an authored `##>` comes
 * back as `##>`, so a sync never rewrites a file over a spelling choice.
 */
import { describe, test, expect } from 'vitest'
import { proseMirrorToMarkdown } from '../src/index.js'
import { markdownToProseMirror } from '@uniweb/content-reader'

const md = s => proseMirrorToMarkdown(markdownToProseMirror(s)).trim()

describe('pretitle round-trip', () => {
  test('#> comes back as #>', () => {
    expect(md('#> New in v2')).toBe('#> New in v2')
  })

  test('the authored hash count is preserved', () => {
    expect(md('##> Most popular')).toBe('##> Most popular')
    expect(md('###> Deep label')).toBe('###> Deep label')
  })

  test('a label above a headline survives in place', () => {
    const source = '#> New in v2\n\n# Build the system\n\n## Not every page'
    expect(md(source)).toBe(source)
  })

  test('inline marks inside a label survive', () => {
    expect(md('#> New in *v2*')).toBe('#> New in *v2*')
  })

  test('serialization is a fixed point', () => {
    const once = md('##> Label')
    expect(md(once)).toBe(once)
  })
})

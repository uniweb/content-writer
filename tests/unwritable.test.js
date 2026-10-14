import { unwritableNodes, proseMirrorToMarkdown, setDiagnosticsReporter, resetDiagnostics } from '../src/index.js'

/**
 * What a write would leave out, asked per document.
 *
 * The serializer reports a node it cannot write once per type per process, so
 * a caller writing many documents could not tell which of them lost content —
 * and a pull went on, writing a file without the node, which the next push then
 * deleted from the site (measured 2026-10-14 with an editor's button node). A caller
 * that must refuse rather than lose content asks first.
 */

const doc = (...content) => ({ type: 'doc', content })
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe('unwritableNodes', () => {
  beforeEach(() => resetDiagnostics())
  afterEach(() => setDiagnosticsReporter())

  test('a document markdown can carry has nothing left out', () => {
    expect(unwritableNodes(doc(p('a'), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'b' }] }))).toEqual([])
  })

  test('a node with no markdown form is named — every time it is asked', () => {
    const lossy = doc(p('a'), { type: 'mysteryWidget', content: [] })
    expect(unwritableNodes(lossy)).toEqual(['mysteryWidget'])
    expect(unwritableNodes(lossy)).toEqual(['mysteryWidget'])
  })

  test('asking prints nothing, and the ordinary write still reports once', () => {
    const printed = []
    setDiagnosticsReporter((m) => printed.push(m))
    unwritableNodes(doc({ type: 'mysteryWidget' }))
    expect(printed).toEqual([])
    proseMirrorToMarkdown(doc({ type: 'mysteryWidget' }))
    proseMirrorToMarkdown(doc({ type: 'mysteryWidget' }))
    expect(printed).toHaveLength(1)
  })
})

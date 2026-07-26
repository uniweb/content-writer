import { proseMirrorToMarkdown } from './src/index.js'
const doc = c => ({ type: 'doc', content: [c] })
const text = t => ({ type: 'text', text: t })

console.log('WarningBlock (text*, today):')
console.log(' ', JSON.stringify(proseMirrorToMarkdown(doc({ type: 'WarningBlock', attrs: {}, content: [text('Be careful.')] })).trim()))

console.log('WarningBlock with type:')
console.log(' ', JSON.stringify(proseMirrorToMarkdown(doc({ type: 'WarningBlock', attrs: { type: 'warning' }, content: [text('Careful.')] })).trim()))

console.log('WarningBlock (block+, after widening):')
console.log(' ', JSON.stringify(proseMirrorToMarkdown(doc({ type: 'WarningBlock', attrs: {}, content: [
  { type: 'paragraph', content: [text('One.')] }, { type: 'paragraph', content: [text('Two.')] }] })).trim()))

console.log('details:')
console.log(' ', JSON.stringify(proseMirrorToMarkdown(doc({ type: 'details', content: [
  { type: 'detailsSummary', content: [text('Breaking '), { type: 'text', text: 'changes', marks: [{ type: 'bold' }] }] },
  { type: 'detailsContent', content: [{ type: 'paragraph', content: [text('Body text.')] }] }] })).trim()))

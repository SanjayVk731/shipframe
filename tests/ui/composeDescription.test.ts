import { describe, it, expect } from 'vitest'
import { composeDescription } from '../../src/ui/composeDescription'

describe('composeDescription', () => {
  it('returns empty string when nothing is filled', () => {
    expect(composeDescription({ main: '' })).toBe('')
  })

  it('wraps the main description in a paragraph', () => {
    expect(composeDescription({ main: 'Hello world' })).toBe('<p>Hello world</p>')
  })

  it('escapes HTML in the main description', () => {
    expect(composeDescription({ main: 'evil <script>alert(1)</script>' })).toBe(
      '<p>evil &lt;script&gt;alert(1)&lt;/script&gt;</p>',
    )
  })

  it('preserves user line breaks in the main description as <br>', () => {
    expect(composeDescription({ main: 'line one\nline two' })).toBe(
      '<p>line one<br>line two</p>',
    )
  })

  it('renders reproduction steps as an ordered list, one per line', () => {
    const html = composeDescription({
      main: '',
      reproSteps: 'open the page\nclick the button\nobserve the crash',
    })
    expect(html).toContain('<h2>Reproduction steps</h2>')
    expect(html).toContain(
      '<ol><li>open the page</li><li>click the button</li><li>observe the crash</li></ol>',
    )
  })

  it('renders acceptance criteria as a checklist-style unordered list', () => {
    const html = composeDescription({
      main: '',
      acceptanceCriteria: 'user can save\nuser cannot submit empty form',
    })
    expect(html).toContain('<h2>Acceptance criteria</h2>')
    expect(html).toContain(
      '<ul><li>user can save</li><li>user cannot submit empty form</li></ul>',
    )
  })

  it('renders expected and actual behavior as paragraphs', () => {
    const html = composeDescription({
      main: '',
      expected: 'Page loads',
      actual: 'Page errors',
    })
    expect(html).toContain('<h2>Expected behavior</h2><p>Page loads</p>')
    expect(html).toContain('<h2>Actual behavior</h2><p>Page errors</p>')
  })

  it('renders out of scope as a paragraph', () => {
    const html = composeDescription({
      main: '',
      outOfScope: 'mobile layout',
    })
    expect(html).toContain('<h2>Out of scope</h2><p>mobile layout</p>')
  })

  it('skips empty sections entirely', () => {
    const html = composeDescription({
      main: 'context',
      acceptanceCriteria: '',
      reproSteps: '   \n  \n  ',
      expected: '',
    })
    expect(html).toBe('<p>context</p>')
  })

  it('drops blank lines from list sections', () => {
    const html = composeDescription({
      main: '',
      acceptanceCriteria: 'one\n\n  \ntwo\n',
    })
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
  })

  it('escapes HTML in every section', () => {
    const html = composeDescription({
      main: 'a',
      reproSteps: 'step with <b>bold</b>',
      acceptanceCriteria: 'AC with " quotes',
      expected: '<img src=x onerror=y>',
      actual: 'safe & sound',
      outOfScope: "it's fine",
    })
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).toContain('&quot; quotes')
    expect(html).toContain('&lt;img src=x onerror=y&gt;')
    expect(html).toContain('safe &amp; sound')
    expect(html).toContain('it&#39;s fine')
  })

  it('composes sections in a stable order: main, repro, expected, actual, AC, out of scope', () => {
    const html = composeDescription({
      main: 'M',
      outOfScope: 'OOS',
      acceptanceCriteria: 'AC',
      actual: 'AA',
      expected: 'EE',
      reproSteps: 'RR',
    })
    const order = ['<p>M</p>', 'Reproduction', 'Expected', 'Actual', 'Acceptance', 'Out of scope']
    let idx = -1
    for (const marker of order) {
      const found = html.indexOf(marker)
      expect(found).toBeGreaterThan(idx)
      idx = found
    }
  })
})

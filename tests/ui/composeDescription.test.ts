import { describe, it, expect } from 'vitest'
import { composeDescription } from '../../src/ui/composeDescription'

describe('composeDescription — description field', () => {
  it('returns empty description when nothing is filled and no figma link', () => {
    expect(composeDescription({ main: '' }).description).toBe('')
  })

  it('wraps the main description in a paragraph', () => {
    expect(composeDescription({ main: 'Hello world' }).description).toBe(
      '<p>Hello world</p>',
    )
  })

  it('escapes HTML in the main description', () => {
    expect(
      composeDescription({ main: 'evil <script>alert(1)</script>' }).description,
    ).toBe('<p>evil &lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('preserves user line breaks in the main description as <br>', () => {
    expect(composeDescription({ main: 'line one\nline two' }).description).toBe(
      '<p>line one<br>line two</p>',
    )
  })

  it('renders expected and actual behavior as paragraphs in description', () => {
    const { description } = composeDescription({
      main: '',
      expected: 'Page loads',
      actual: 'Page errors',
    })
    expect(description).toContain('<h2>Expected behavior</h2><p>Page loads</p>')
    expect(description).toContain('<h2>Actual behavior</h2><p>Page errors</p>')
  })

  it('renders out of scope as a paragraph in description', () => {
    const { description } = composeDescription({
      main: '',
      outOfScope: 'mobile layout',
    })
    expect(description).toContain('<h2>Out of scope</h2><p>mobile layout</p>')
  })

  it('skips empty sections entirely', () => {
    const { description } = composeDescription({
      main: 'context',
      acceptanceCriteria: '',
      reproSteps: '   \n  \n  ',
      expected: '',
    })
    expect(description).toBe('<p>context</p>')
  })

  it('puts a prominent Figma link at the top of description when provided', () => {
    const { description } = composeDescription({
      main: 'context',
      figmaLink: { url: 'https://figma.com/file/abc?node-id=1-2', label: 'Hero frame' },
    })
    expect(description.startsWith('<p>')).toBe(true)
    expect(description).toContain('<strong>Figma:</strong>')
    expect(description).toContain('href="https://figma.com/file/abc?node-id=1-2"')
    expect(description).toContain('>Hero frame</a>')
    // main content must still appear, after the link
    expect(description.indexOf('Figma:')).toBeLessThan(description.indexOf('context'))
  })

  it('escapes the figma link href and label', () => {
    const { description } = composeDescription({
      main: '',
      figmaLink: {
        url: 'https://figma.com/file/abc?node-id=1-2&t=foo',
        label: 'frame with <script>',
      },
    })
    expect(description).toContain(
      'href="https://figma.com/file/abc?node-id=1-2&amp;t=foo"',
    )
    expect(description).toContain('&lt;script&gt;')
    expect(description).not.toContain('<script>')
  })

  it('omits the figma link block entirely when not provided', () => {
    const { description } = composeDescription({ main: 'context' })
    expect(description).not.toContain('Figma:')
  })
})

describe('composeDescription — acceptance criteria field', () => {
  it('returns empty AC HTML when not provided', () => {
    expect(composeDescription({ main: '' }).acceptanceCriteriaHtml).toBe('')
  })

  it('renders AC as a standalone <ul>, one per line', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: 'user can save\nuser cannot submit empty form',
    })
    expect(acceptanceCriteriaHtml).toBe(
      '<ul><li>user can save</li><li>user cannot submit empty form</li></ul>',
    )
  })

  it('does NOT include the AC content inside description (routed to native field)', () => {
    const { description } = composeDescription({
      main: 'context',
      acceptanceCriteria: 'user can save',
    })
    expect(description).not.toContain('Acceptance')
    expect(description).not.toContain('user can save')
  })

  it('strips leading list markers', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: '- A\n* B\n• C\n1. D\n2) E\n  -   F  ',
    })
    expect(acceptanceCriteriaHtml).toContain('<li>A</li>')
    expect(acceptanceCriteriaHtml).toContain('<li>B</li>')
    expect(acceptanceCriteriaHtml).toContain('<li>C</li>')
    expect(acceptanceCriteriaHtml).toContain('<li>D</li>')
    expect(acceptanceCriteriaHtml).toContain('<li>E</li>')
    expect(acceptanceCriteriaHtml).toContain('<li>F</li>')
    expect(acceptanceCriteriaHtml).not.toMatch(/<li>[-*•]/)
  })

  it('drops blank lines', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: 'one\n\n  \ntwo\n',
    })
    expect(acceptanceCriteriaHtml).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('escapes HTML in AC items', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: '<b>bold</b>',
    })
    expect(acceptanceCriteriaHtml).not.toContain('<b>bold</b>')
    expect(acceptanceCriteriaHtml).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})

describe('composeDescription — reproduction steps field', () => {
  it('returns empty repro HTML when not provided', () => {
    expect(composeDescription({ main: '' }).reproStepsHtml).toBe('')
  })

  it('renders repro steps as a standalone <ol>, one per line', () => {
    const { reproStepsHtml } = composeDescription({
      main: '',
      reproSteps: 'open the page\nclick the button',
    })
    expect(reproStepsHtml).toBe(
      '<ol><li>open the page</li><li>click the button</li></ol>',
    )
  })

  it('does NOT include repro content in description (routed to native field)', () => {
    const { description } = composeDescription({
      main: 'context',
      reproSteps: 'open page',
    })
    expect(description).not.toContain('Reproduction')
    expect(description).not.toContain('open page')
  })

  it('strips numbered list markers', () => {
    const { reproStepsHtml } = composeDescription({
      main: '',
      reproSteps: '1. open page\n2. click button',
    })
    expect(reproStepsHtml).toContain('<li>open page</li>')
    expect(reproStepsHtml).toContain('<li>click button</li>')
    expect(reproStepsHtml).not.toMatch(/<li>\d+[.)]/)
  })

  it('escapes HTML in repro items', () => {
    const { reproStepsHtml } = composeDescription({
      main: '',
      reproSteps: 'step with <script>',
    })
    expect(reproStepsHtml).toContain('&lt;script&gt;')
    expect(reproStepsHtml).not.toContain('<script>')
  })
})

describe('composeDescription — overall ordering', () => {
  it('description sections appear in order: figma link, main, expected, actual, out of scope', () => {
    const { description } = composeDescription({
      main: 'M',
      outOfScope: 'OOS',
      actual: 'AA',
      expected: 'EE',
      figmaLink: { url: 'https://figma.com/file/abc', label: 'frame' },
    })
    const order = ['Figma:', '<p>M</p>', 'Expected', 'Actual', 'Out of scope']
    let idx = -1
    for (const marker of order) {
      const found = description.indexOf(marker)
      expect(found).toBeGreaterThan(idx)
      idx = found
    }
  })
})

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

  it('strips dangerous HTML (script tags) from the main description', () => {
    const { description } = composeDescription({
      main: 'evil <script>alert(1)</script>',
    })
    expect(description).not.toContain('<script>')
    expect(description).not.toContain('alert(1)')
    expect(description).toContain('evil')
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

  it('strips dangerous HTML from AC items while keeping the text content', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: 'safe item<script>alert(1)</script>',
    })
    expect(acceptanceCriteriaHtml).not.toContain('<script>')
    expect(acceptanceCriteriaHtml).not.toContain('alert(1)')
    expect(acceptanceCriteriaHtml).toContain('<li>safe item</li>')
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

  it('strips dangerous HTML from repro items while keeping the text content', () => {
    const { reproStepsHtml } = composeDescription({
      main: '',
      reproSteps: 'open page<script>alert(1)</script>',
    })
    expect(reproStepsHtml).not.toContain('<script>')
    expect(reproStepsHtml).not.toContain('alert(1)')
    expect(reproStepsHtml).toContain('<li>open page</li>')
  })
})

describe('composeDescription — markdown rendering', () => {
  it('renders bold and italic in the main description', () => {
    const { description } = composeDescription({
      main: 'this is **important** and *subtle*',
    })
    expect(description).toContain('<strong>important</strong>')
    expect(description).toContain('<em>subtle</em>')
  })

  it('renders inline code in the main description', () => {
    const { description } = composeDescription({
      main: 'use `figma.getNodeByIdAsync` for lookups',
    })
    expect(description).toContain('<code>figma.getNodeByIdAsync</code>')
  })

  it('renders markdown links in the main description', () => {
    const { description } = composeDescription({
      main: 'see [the docs](https://example.com/docs) for more',
    })
    expect(description).toContain(
      '<a href="https://example.com/docs">the docs</a>',
    )
  })

  it('renders markdown formatting inside acceptance criteria items', () => {
    const { acceptanceCriteriaHtml } = composeDescription({
      main: '',
      acceptanceCriteria: 'user can **save** their progress\nempty form shows `error`',
    })
    expect(acceptanceCriteriaHtml).toContain(
      '<li>user can <strong>save</strong> their progress</li>',
    )
    expect(acceptanceCriteriaHtml).toContain(
      '<li>empty form shows <code>error</code></li>',
    )
  })

  it('renders markdown formatting inside reproduction steps', () => {
    const { reproStepsHtml } = composeDescription({
      main: '',
      reproSteps: 'open **Settings**\nclick the [Save](https://x) button',
    })
    expect(reproStepsHtml).toContain('<li>open <strong>Settings</strong></li>')
    expect(reproStepsHtml).toContain(
      '<li>click the <a href="https://x">Save</a> button</li>',
    )
  })

  it('strips javascript: URLs from markdown links via sanitization', () => {
    const { description } = composeDescription({
      main: 'evil [click me](javascript:alert(1))',
    })
    expect(description).not.toContain('javascript:')
    expect(description).not.toMatch(/href=["']javascript/i)
  })

  it('strips raw HTML / script tags pasted into markdown', () => {
    const { description } = composeDescription({
      main: '<script>alert(1)</script><img src=x onerror=y>',
    })
    expect(description).not.toContain('<script>')
    expect(description).not.toContain('onerror')
  })

  it('renders markdown image syntax as a safe <img> (src/alt only, no handlers)', () => {
    const { description } = composeDescription({
      main: 'see ![diagram](https://example.com/diagram.png) below',
    })
    expect(description).toContain('<img')
    expect(description).toContain('src="https://example.com/diagram.png"')
    expect(description).toContain('alt="diagram"')
    expect(description).not.toContain('onerror')
    expect(description).not.toContain('onload')
  })

  it('still preserves the prominent Figma link untouched', () => {
    const { description } = composeDescription({
      main: '',
      figmaLink: {
        url: 'https://figma.com/file/abc?node-id=1-2',
        label: 'Hero frame',
      },
    })
    expect(description).toContain('<strong>Figma:</strong>')
    expect(description).toContain(
      'href="https://figma.com/file/abc?node-id=1-2"',
    )
    expect(description).toContain('>Hero frame</a>')
  })
})

describe('composeDescription <img> handling', () => {
  it('preserves <img src="…" alt="…"/> in main', () => {
    const r = composeDescription({
      main: '<img src="https://example.com/x.png" alt="frame"/>',
    })
    expect(r.description).toContain('<img')
    expect(r.description).toContain('src="https://example.com/x.png"')
    expect(r.description).toContain('alt="frame"')
  })

  it('strips img event handlers', () => {
    const r = composeDescription({
      main: '<img src="https://example.com/x.png" alt="y" onerror="alert(1)"/>',
    })
    expect(r.description).not.toContain('onerror')
    expect(r.description).not.toContain('alert(1)')
  })

  it('still forbids script/style/iframe', () => {
    const r = composeDescription({
      main: '<script>1</script><style>x</style><iframe></iframe>',
    })
    expect(r.description).not.toContain('<script')
    expect(r.description).not.toContain('<style')
    expect(r.description).not.toContain('<iframe')
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

import { describe, it, expect } from 'vitest'
import { sanitizeProse, sanitizeHtml } from '../../src/ui/sanitize'

describe('sanitizeProse — user/AI prose, no images', () => {
  it('strips <img> entirely', () => {
    const out = sanitizeProse('<p>hi</p><img src="https://x.test/a.png" alt="a"/>')
    expect(out).toContain('<p>hi</p>')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('x.test')
  })

  it('keeps the conservative tag set', () => {
    const out = sanitizeProse('<p><strong>a</strong> <a href="https://x.test">b</a></p>')
    expect(out).toContain('<strong>a</strong>')
    expect(out).toContain('href="https://x.test"')
  })

  it('forbids script/style/iframe and event handlers', () => {
    const out = sanitizeProse('<script>1</script><p onclick="x()">a</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
  })
})

describe('sanitizeHtml — trusted provider HTML, images allowed', () => {
  it('preserves a provider-built <img>', () => {
    const out = sanitizeHtml('<img src="https://dev.azure.com/upload/x.png" alt="Frame screenshot"/>')
    expect(out).toContain('<img')
    expect(out).toContain('src="https://dev.azure.com/upload/x.png"')
    expect(out).toContain('alt="Frame screenshot"')
  })

  it('still strips event handlers and javascript: URLs from the img', () => {
    const out = sanitizeHtml('<img src="javascript:alert(1)" alt="x" onerror="y()"/>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('onerror')
  })

  it('still forbids script/style/iframe', () => {
    const out = sanitizeHtml('<script>1</script><style>x</style><iframe></iframe><img src="https://x.test/a.png"/>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<style')
    expect(out).not.toContain('<iframe')
    expect(out).toContain('<img')
  })
})

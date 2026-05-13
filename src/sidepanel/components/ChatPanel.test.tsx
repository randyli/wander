import { describe, expect, it } from 'vitest'
import { getApprovalParamRows, getApprovalRiskLabel, getApprovalToolLabel } from './ChatPanel'

describe('approval display helpers', () => {
  it('renders high-risk tool details as user-friendly labels instead of JSON', () => {
    expect(getApprovalToolLabel('dom.fill')).toBe('填写网页表单')
    expect(getApprovalRiskLabel('sensitive')).toContain('敏感风险')
    expect(getApprovalParamRows('dom.fill', {
      selector: '#email',
      value: 'user@example.com',
      submit: 'false',
    })).toEqual([
      { label: '页面位置', value: '#email' },
      { label: '填写内容', value: 'user@example.com' },
      { label: '填写后提交', value: '否' },
    ])
  })

  it('summarizes tools with no obvious params in plain language', () => {
    expect(getApprovalParamRows('page.screenshot', {})).toEqual([
      { label: '截图范围', value: '当前可见页面' },
    ])
    expect(getApprovalParamRows('dom.submit', {})).toEqual([
      { label: '提交表单', value: '页面中的第一个表单' },
    ])
  })
})

/**
 * Tests for DocumentsSection — the shared attachments panel used by the
 * consumable and fixed-asset view modals. Covers picking several files in one
 * go and reporting per-file failures instead of failing silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../lib/cemsApi', () => ({
  cemsApi: {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

import { cemsApi } from '../../../lib/cemsApi'
import { DocumentsSection } from '../DocumentsSection'

const mockedApi = vi.mocked(cemsApi)

function makeFile(name: string): File {
  return new File(['content'], name, { type: 'image/png' })
}

function renderSection() {
  return render(
    <DocumentsSection entityType="consumable" entityId="item-1" isManager />
  )
}

describe('DocumentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.getDocuments.mockResolvedValue({ data: [] } as never)
    mockedApi.uploadDocument.mockResolvedValue({ data: {} } as never)
  })

  it('uploads every picked file, one request each', async () => {
    const user = userEvent.setup()
    renderSection()

    const input = await screen.findByLabelText('בחירת קבצים להעלאה')
    await user.upload(input, [
      makeFile('invoice.pdf'),
      makeFile('photo-1.png'),
      makeFile('photo-2.png'),
    ])

    expect(screen.getByText('invoice.pdf')).toBeTruthy()
    expect(screen.getByText('photo-2.png')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /העלאה \(3\)/ }))

    await waitFor(() => expect(mockedApi.uploadDocument).toHaveBeenCalledTimes(3))

    const sentEntityTypes = mockedApi.uploadDocument.mock.calls.map(
      ([formData]) => (formData as FormData).get('entity_type')
    )
    expect(sentEntityTypes).toEqual(['consumable', 'consumable', 'consumable'])
  })

  it('accumulates files picked in separate selections', async () => {
    const user = userEvent.setup()
    renderSection()

    const input = await screen.findByLabelText('בחירת קבצים להעלאה')
    await user.upload(input, [makeFile('first.png')])
    await user.upload(input, [makeFile('second.png')])

    expect(screen.getByText('first.png')).toBeTruthy()
    expect(screen.getByText('second.png')).toBeTruthy()
    expect(screen.getByRole('button', { name: /העלאה \(2\)/ })).toBeTruthy()
  })

  it("surfaces the server's reason for a file that fails", async () => {
    const user = userEvent.setup()
    mockedApi.uploadDocument
      .mockResolvedValueOnce({ data: {} } as never)
      .mockRejectedValueOnce({
        response: { data: { detail: 'גודל קובץ מקסימלי: 20 MB' } },
      })

    renderSection()

    const input = await screen.findByLabelText('בחירת קבצים להעלאה')
    await user.upload(input, [makeFile('ok.png'), makeFile('huge.png')])
    await user.click(screen.getByRole('button', { name: /העלאה \(2\)/ }))

    await waitFor(() =>
      expect(screen.getByText(/huge\.png: גודל קובץ מקסימלי: 20 MB/)).toBeTruthy()
    )
  })

  it('keeps only the failed files queued for a retry', async () => {
    const user = userEvent.setup()
    mockedApi.uploadDocument
      .mockResolvedValueOnce({ data: {} } as never)
      .mockRejectedValueOnce({ response: { data: { detail: 'שגיאה' } } })

    renderSection()

    const input = await screen.findByLabelText('בחירת קבצים להעלאה')
    await user.upload(input, [makeFile('ok.png'), makeFile('bad.png')])
    await user.click(screen.getByRole('button', { name: /העלאה \(2\)/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /העלאה \(1\)/ })).toBeTruthy()
    )
    expect(screen.queryByText('ok.png')).toBeNull()
    expect(screen.getByText('bad.png')).toBeTruthy()
  })

  it('hides the upload form from non-managers', async () => {
    render(
      <DocumentsSection entityType="consumable" entityId="item-1" isManager={false} />
    )

    await waitFor(() => expect(mockedApi.getDocuments).toHaveBeenCalled())
    expect(screen.queryByLabelText('בחירת קבצים להעלאה')).toBeNull()
  })
})

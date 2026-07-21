/**
 * Tests for opening chat/task attachments inside the app.
 *
 * Attachments used to be plain `<a target="_blank">` links, so clicking a
 * document threw the user into a new browser tab and out of the task they were
 * reading. They now open the shared DocumentViewerModal in place. These tests
 * pin that contract:
 *   - a document (pdf) renders as a button, and clicking it shows the viewer
 *     rather than navigating away;
 *   - an image thumbnail does the same;
 *   - audio/video keep playing inline and never open the viewer;
 *   - the viewer is closable, so the user gets back to the task.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import AttachmentView from '../AttachmentView'

// The viewer resolves URLs through the api module; stub it so nothing touches
// the network under jsdom.
vi.mock('../../../lib/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: new Blob() })) },
}))

const PDF_URL = 'https://example.test/uploads/report.pdf'
const IMAGE_URL = 'https://example.test/uploads/photo.png'

describe('AttachmentView', () => {
  /** The pdf preview inside the viewer, or null while it is closed. */
  const viewerFrame = () => document.querySelector('iframe')

  it('opens a document in the in-app viewer instead of a new tab', async () => {
    const user = userEvent.setup()
    render(<AttachmentView fileName="report.pdf" fileUrl={PDF_URL} />)

    const trigger = screen.getByRole('button', { name: /report\.pdf/ })
    // A button, not a link: nothing here should navigate the browser away.
    expect(trigger.tagName).toBe('BUTTON')
    expect(document.querySelector('a[target="_blank"]')).toBeNull()
    expect(viewerFrame()).toBeNull()

    await user.click(trigger)

    const frame = viewerFrame()
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute('src')).toContain(PDF_URL)
  })

  it('opens an image thumbnail in the in-app viewer', async () => {
    const user = userEvent.setup()
    render(<AttachmentView fileName="photo.png" fileUrl={IMAGE_URL} />)

    await user.click(screen.getByRole('button', { name: /photo\.png/ }))

    // Thumbnail plus the full-size copy inside the viewer.
    const images = await screen.findAllByAltText('photo.png')
    expect(images.length).toBeGreaterThan(1)
  })

  it('closes the viewer again so the user returns to the task', async () => {
    const user = userEvent.setup()
    render(<AttachmentView fileName="report.pdf" fileUrl={PDF_URL} />)

    await user.click(screen.getByRole('button', { name: /report\.pdf/ }))
    expect(viewerFrame()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'סגור' }))
    await waitFor(() => expect(viewerFrame()).toBeNull())
  })

  it('keeps audio inline and never opens the viewer for it', () => {
    const { container } = render(
      <AttachmentView fileName="note.mp3" fileUrl="https://example.test/uploads/note.mp3" />,
    )

    expect(container.querySelector('audio')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not offer a viewer when the file has no resolvable URL', () => {
    render(<AttachmentView fileName="report.pdf" fileUrl={null} />)

    const trigger = screen.getByRole('button', { name: /report\.pdf/ }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
  })
})

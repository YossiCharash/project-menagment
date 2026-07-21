/**
 * Regression test for editing backlog tasks.
 *
 * The detail modal only renders its "עריכה" (edit) button when it is given an
 * `onEdit` callback. BacklogPanel used to open the modal without one, so backlog
 * tasks had no way to be edited. These tests pin the button's contract so the
 * wiring can't silently regress:
 *   - with `onEdit` + an editing-capable user → the edit button shows and, when
 *     clicked, calls `onEdit` with the task.
 *   - without `onEdit` → no edit button (the old backlog behaviour).
 *
 * The task under test is a no-date backlog task, matching what the backlog list
 * hands the modal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'

import TaskDetailModal from '../TaskDetailModal'
import authSlice from '../../../store/slices/authSlice'
import permissionsSlice from '../../../store/slices/permissionsSlice'

// The modal and its children pull data through the api client on mount; stub the
// whole module so nothing hits the network under jsdom.
vi.mock('../../../lib/api', () => {
  const get = vi.fn((url: string) =>
    Promise.resolve({ data: url.includes('/messages') || url.includes('/checklist') ? [] : BACKLOG_TASK }),
  )
  const api = { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return {
    default: api,
    avatarUrl: () => null,
    fileAttachmentUrl: () => null,
    getBacklogTasks: vi.fn(() => Promise.resolve([BACKLOG_TASK])),
  }
})

const ADMIN = { id: 1, role: 'Admin', full_name: 'Admin' }

// A no-date backlog task assigned to the admin — the shape the backlog list
// passes to the detail modal.
const BACKLOG_TASK = {
  id: 42,
  title: 'משימת בקלוג לבדיקה',
  start_time: null,
  end_time: null,
  description: '',
  status: 'pending',
  event_type: 'task',
  assigned_to_user_id: 1,
  assigned_to_user_ids: [1],
  assignees: [{ user_id: 1, full_name: 'Admin', avatar_url: null, color: '#888' }],
  participants: [],
  labels: [],
  is_backlog: true,
  is_archived: false,
  unique_tag: '20260101000000-abcd1234',
  recurrence_rule: '',
  recurrence_interval: 1,
} as any

const createStore = () =>
  configureStore({
    reducer: { auth: authSlice, permissions: permissionsSlice },
    preloadedState: { auth: { me: ADMIN } as any },
  })

function renderModal(onEdit?: (task: any) => void) {
  return render(
    <Provider store={createStore()}>
      <TaskDetailModal taskId={42} initialTask={BACKLOG_TASK} onClose={vi.fn()} onEdit={onEdit} />
    </Provider>,
  )
}

describe('TaskDetailModal edit button (backlog editing)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the edit button and calls onEdit when an onEdit handler is provided', async () => {
    const onEdit = vi.fn()
    renderModal(onEdit)

    const editButton = await screen.findByRole('button', { name: /עריכה/ })
    expect(editButton).toBeInTheDocument()

    await userEvent.click(editButton)
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1))
    expect(onEdit.mock.calls[0][0]).toMatchObject({ id: 42 })
  })

  it('renders no edit button when onEdit is omitted (the pre-fix backlog behaviour)', async () => {
    renderModal(undefined)

    // Wait for the modal body to render, then assert the edit button is absent.
    await screen.findByText('משימת בקלוג לבדיקה')
    expect(screen.queryByRole('button', { name: /עריכה/ })).not.toBeInTheDocument()
  })
})

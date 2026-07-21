/**
 * Regression test: every backlog surface must offer an edit affordance.
 *
 * TaskDetailModal renders its "עריכה" button only when given an `onEdit`
 * callback. Both backlog surfaces once opened the modal without one, so backlog
 * tasks could not be edited:
 *   - BacklogPanel (the dropdown in the standalone calendar header)
 *   - BacklogTab   (the full-page Backlog tab in Task Management)
 *
 * The sibling TaskDetailModal.edit test pins the modal's own contract, but it
 * cannot catch a *caller* that forgets to pass `onEdit` — which is exactly how
 * the bug survived a first fix that only covered BacklogPanel. These tests
 * drive each surface end to end: open a backlog task, assert the edit button is
 * reachable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'

import BacklogTab from '../BacklogTab'
import BacklogPanel from '../BacklogPanel'
import authSlice from '../../../store/slices/authSlice'
import permissionsSlice from '../../../store/slices/permissionsSlice'

const ADMIN = { id: 1, role: 'Admin', full_name: 'Admin' }

// A no-date backlog task assigned to the admin, as the backlog endpoint returns it.
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

// Route each GET to a shape the components expect; anything task-shaped resolves
// to the backlog task itself so the detail modal can render.
vi.mock('../../../lib/api', () => {
  const get = vi.fn((url: string) => {
    if (url.includes('/users/for-tasks')) return Promise.resolve({ data: [] })
    if (url.includes('/tasks/labels')) return Promise.resolve({ data: [] })
    if (url.includes('/messages') || url.includes('/checklist')) return Promise.resolve({ data: [] })
    return Promise.resolve({ data: BACKLOG_TASK })
  })
  const api = { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return {
    default: api,
    avatarUrl: () => null,
    fileAttachmentUrl: () => null,
    getBacklogTasks: vi.fn(() => Promise.resolve([BACKLOG_TASK])),
  }
})

const withStore = (ui: React.ReactElement) =>
  render(
    <Provider
      store={configureStore({
        reducer: { auth: authSlice, permissions: permissionsSlice },
        preloadedState: { auth: { me: ADMIN } as any },
      })}
    >
      {ui}
    </Provider>,
  )

describe('backlog surfaces expose an edit affordance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('BacklogTab: opening a backlog task shows the edit button', async () => {
    withStore(<BacklogTab />)

    await userEvent.click(await screen.findByText('משימת בקלוג לבדיקה'))

    expect(await screen.findByRole('button', { name: /עריכה/ })).toBeInTheDocument()
  })

  it('BacklogPanel: opening a backlog task shows the edit button', async () => {
    withStore(<BacklogPanel onRequestCreate={vi.fn()} onEditTask={vi.fn()} />)

    // The panel is a dropdown: expand it, then open the task.
    await userEvent.click(await screen.findByRole('button', { name: /Backlog/ }))
    await userEvent.click(await screen.findByText('משימת בקלוג לבדיקה'))

    expect(await screen.findByRole('button', { name: /עריכה/ })).toBeInTheDocument()
  })
})

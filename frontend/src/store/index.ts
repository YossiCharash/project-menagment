import { configureStore } from '@reduxjs/toolkit'
import auth from './slices/authSlice'
import projects from './slices/projectsSlice'
import suppliers from './slices/suppliersSlice'

export const store = configureStore({
  reducer: { auth, projects, suppliers },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { BrowserRouter } from 'react-router-dom'
import authSlice from '../store/slices/authSlice'
import projectsSlice from '../store/slices/projectsSlice'
import suppliersSlice from '../store/slices/suppliersSlice'

// Create a test store
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authSlice,
      projects: projectsSlice,
      suppliers: suppliersSlice,
    },
    preloadedState: initialState,
  })
}

// Custom render function that includes providers
const AllTheProviders = ({ children, initialState = {} }: { children: React.ReactNode; initialState?: any }) => {
  const store = createTestStore(initialState)
  
  return (
    <Provider store={store}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </Provider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialState?: any }
) => {
  return render(ui, {
    wrapper: (props) => <AllTheProviders {...props} initialState={options?.initialState} />,
    ...options,
  })
}

export * from '@testing-library/react'
export { customRender as render }


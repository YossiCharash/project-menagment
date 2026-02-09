import axios from 'axios'



const api = axios.create({
  baseURL: "https://project-menager-1-1-0.onrender.com/api/v1/",
  timeout: 30000, // avoid ECONNABORTED on heavy endpoints during dev
  withCredentials: false,
})

api.interceptors.request.use((config) => {
  const isFormData = config.data instanceof FormData

  if (isFormData) {
    console.log('🔧 [INTERCEPTOR] FormData request detected:', {
      url: config.url,
      method: config.method,
      hasData: !!config.data,
      dataType: config.data?.constructor?.name
    })
  }

  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
    if (isFormData) {
      console.log('🔧 [INTERCEPTOR] Token added to headers')
    }
  }

  // For FormData, don't set Content-Type - let axios/browser set it with boundary
  if (isFormData) {
    const hadContentType = 'Content-Type' in (config.headers || {})
    delete config.headers['Content-Type']
    console.log('🔧 [INTERCEPTOR] Content-Type header:', {
      hadContentType,
      removed: true,
      finalHeaders: Object.keys(config.headers || {})
    })
  }

  if (isFormData) {
    console.log('🔧 [INTERCEPTOR] Final request config:', {
      url: config.url,
      method: config.method,
      timeout: config.timeout,
      headers: Object.keys(config.headers || {}),
      hasData: !!config.data
    })
  }
  
  // For FormData, don't set Content-Type - let axios/browser set it with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }

  return config
})

/** Base URL of the backend (origin) for building absolute URLs for uploads/avatars */
const getBaseUrl = () => {
  const base = api.defaults.baseURL ?? ''
  const withoutPath = base.replace(/\/api\/v1\/?$/, '')
  return withoutPath || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? String(import.meta.env.VITE_API_URL).replace(/\/api\/v1\/?$/, '')
    : '')
}

/**
 * Returns absolute URL for an avatar path from the API (e.g. /uploads/avatars/xxx).
 * Returns null if path is falsy.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (path == null || path === '') return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = getBaseUrl()
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path
}

/**
 * Returns absolute URL for a file attachment path from the API.
 * Returns null if path is falsy.
 */
export function fileAttachmentUrl(path: string | null | undefined): string | null {
  if (path == null || path === '') return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = getBaseUrl()
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path
}

api.interceptors.response.use(
  (res) => {
    return res      
  },
  (error) => {
    const status = error?.response?.status

    if (status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('token')

      // Save current location to redirect back after login
      const currentPath = window.location.pathname + window.location.search
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.setItem('redirectAfterLogin', currentPath)
      }

      // Redirect to login page
      window.location.href = '/login'
    } else {
        console.error("API Error:", error.response?.data || error.message);
    }

    return Promise.reject(error)
  }
)

export default api

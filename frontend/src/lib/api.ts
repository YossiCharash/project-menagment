import axios from 'axios'



const api = axios.create({
  baseURL:   'https://project-menager-1-1-0.onrender.com/api/v1/',

  timeout: 30000, // avoid ECONNABORTED on heavy endpoints during dev
  withCredentials: false,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
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

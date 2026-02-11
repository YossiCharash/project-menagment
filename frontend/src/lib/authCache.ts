/**
 * Auth cache: in-memory cache + localStorage persistence.
 * הלוגין נשמר ב-cache (זיכרון) localStorage (בין רענונים).
 */

const TOKEN_KEY = 'token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const CACHE_KEY_USER = 'cached_user'
const CACHE_KEY_REQUIRES_PASSWORD_CHANGE = 'requires_password_change'

// In-memory cache
let cache: {
  token: string | null
  refreshToken: string | null
  user: unknown | null
  requiresPasswordChange: boolean
} = {
  token: null,
  refreshToken: null,
  user: null,
  requiresPasswordChange: false,
}

let cacheHydrated = false

function hydrateFromStorage() {
  if (cacheHydrated) return
  cache.token = localStorage.getItem(TOKEN_KEY)
  cache.refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  try {
    const u = localStorage.getItem(CACHE_KEY_USER)
    cache.user = u ? JSON.parse(u) : null
  } catch {
    cache.user = null
  }
  cache.requiresPasswordChange = localStorage.getItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE) === 'true'
  cacheHydrated = true
}

export function getToken(): string | null {
  hydrateFromStorage()
  return cache.token
}

export function setToken(value: string | null) {
  cache.token = value
  if (value !== null) localStorage.setItem(TOKEN_KEY, value)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  hydrateFromStorage()
  return cache.refreshToken
}

export function setRefreshToken(value: string | null) {
  cache.refreshToken = value
  if (value !== null) localStorage.setItem(REFRESH_TOKEN_KEY, value)
  else localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getCachedUser<T>(): T | null {
  hydrateFromStorage()
  return cache.user as T | null
}

export function setCachedUser<T>(user: T | null) {
  cache.user = user
  if (user !== null) localStorage.setItem(CACHE_KEY_USER, JSON.stringify(user))
  else localStorage.removeItem(CACHE_KEY_USER)
}

export function getRequiresPasswordChange(): boolean {
  hydrateFromStorage()
  return cache.requiresPasswordChange
}

export function setRequiresPasswordChange(value: boolean) {
  cache.requiresPasswordChange = value
  if (value) localStorage.setItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE, 'true')
  else localStorage.removeItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE)
}

/** Clear all auth data from cache and localStorage */
export function clearAuthCache() {
  cache = {
    token: null,
    refreshToken: null,
    user: null,
    requiresPasswordChange: false,
  }
  cacheHydrated = true
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(CACHE_KEY_USER)
  localStorage.removeItem(CACHE_KEY_REQUIRES_PASSWORD_CHANGE)
}

export const AUTH_CACHE_KEYS = {
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  CACHE_KEY_USER,
  CACHE_KEY_REQUIRES_PASSWORD_CHANGE,
} as const

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../lib/api'

interface SupplierDocument {
  id: number
  supplier_id: number
  transaction_id: number | null
  file_path: string
  description: string | null
  uploaded_at: string
}

export default function SupplierDocuments() {
  const { supplierId } = useParams()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<SupplierDocument[]>([])
  const [supplierName, setSupplierName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<SupplierDocument | null>(null)

  useEffect(() => {
    if (!supplierId) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Load supplier info
        const supplierRes = await api.get(`/suppliers/${supplierId}`)
        setSupplierName(supplierRes.data.name || `ספק #${supplierId}`)

        // Load documents
        const docsRes = await api.get(`/suppliers/${supplierId}/documents`)
        const docs = docsRes.data || []
        setDocuments(docs)
        // Clear error if we got a response (even if empty)
        setError(null)
      } catch (err: any) {
        // Error loading documents
        // Only set error for actual errors (4xx/5xx), not for successful empty responses
        const status = err.response?.status
        if (status && status >= 400 && status !== 404) {
          setError(err.response?.data?.detail || 'שגיאה בטעינת המסמכים')
        } else {
          // For 404 or network errors, just show empty list
          setDocuments([])
          setError(null)
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supplierId])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedDocument) {
        setSelectedDocument(null)
      }
    }

    if (selectedDocument) {
      document.addEventListener('keydown', handleEsc)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = 'unset'
    }
  }, [selectedDocument])

  const getFileExtension = (filePath: string): string => {
    return filePath.split('.').pop()?.toLowerCase() || ''
  }

  const getFileName = (filePath: string): string => {
    // Extract filename from path
    const parts = filePath.split('/')
    const fileName = parts[parts.length - 1]
    // If it's a hash-based filename, try to get original name or just show the extension
    return fileName || 'קובץ'
  }

  const isImage = (filePath: string): boolean => {
    const ext = getFileExtension(filePath)
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
  }

  const isPdf = (filePath: string): boolean => {
    return getFileExtension(filePath) === 'pdf'
  }

  const getFileUrl = (filePath: string): string => {
    // If filePath already starts with http (S3 / CloudFront), return as is
    if (filePath.startsWith('http')) {
      return filePath
    }
    // Backward compatibility for old local /uploads paths
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    let normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    normalizedPath = normalizedPath.replace(/([^:]\/)\/+/g, '$1')
    return `${baseUrl}${normalizedPath}`
  }

  if (!supplierId) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded">
          מזהה ספק לא תקין
        </div>
        <button
          onClick={() => navigate('/suppliers')}
          className="bg-gray-900 text-white px-4 py-2 rounded"
        >
          חזור לספקים
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            מסמכי ספק: {supplierName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            כל המסמכים הקשורים לספק זה
          </p>
        </div>
        <button
          onClick={() => navigate('/suppliers')}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          ← חזור לספקים
        </button>
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          טוען מסמכים...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded">
          {error}
        </div>
      )}

      {/* Documents Grid */}
      {!loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          {documents.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex flex-col items-center justify-center">
                <svg
                  className="w-24 h-24 text-gray-300 dark:text-gray-600 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  אין מסמכים להצגה
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  עדיין לא הועלו מסמכים עבור ספק זה
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-xl transition-all cursor-pointer bg-white dark:bg-gray-800"
                  onClick={() => setSelectedDocument(doc)}
                >
                  {isImage(doc.file_path) ? (
                    <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-700 overflow-hidden group">
                      <img
                        src={getFileUrl(doc.file_path)}
                        alt={doc.description || 'מסמך'}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          const imgUrl = getFileUrl(doc.file_path)
                          // Failed to load image
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.innerHTML = `
                              <div class="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                                <span class="text-xl mb-2">❌</span>
                                <span class="text-sm text-center">שגיאה בטעינת התמונה</span>
                                <a href="${imgUrl}" target="_blank" class="mt-2 text-blue-500 hover:underline text-xs">פתח קישור</a>
                              </div>
                            `
                          }
                        }}
                      />
                      <div className="absolute top-2 right-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
                        📷 תמונה
                      </div>
                    </div>
                  ) : isPdf(doc.file_path) ? (
                    <div className="aspect-[4/3] bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 flex flex-col items-center justify-center group hover:from-red-100 hover:to-red-200 dark:hover:from-red-800/30 dark:hover:to-red-700/30 transition-colors">
                      <svg
                        className="w-20 h-20 text-red-600 dark:text-red-400 mb-3 group-hover:scale-110 transition-transform"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M4 18h12V6h-4V2H4v16zm-2 1V0h12l4 4v16H2v-1z" />
                      </svg>
                      <span className="text-red-700 dark:text-red-300 font-bold text-lg">PDF</span>
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex flex-col items-center justify-center group">
                      <svg
                        className="w-20 h-20 text-gray-400 dark:text-gray-500 mb-3 group-hover:scale-110 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                        {getFileExtension(doc.file_path).toUpperCase() || 'קובץ'}
                      </span>
                    </div>
                  )}
                  <div className="p-4 bg-white dark:bg-gray-800">
                    <p className="text-sm text-gray-900 dark:text-white truncate font-semibold mb-1">
                      {doc.description || getFileName(doc.file_path)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        📅 {new Date(doc.uploaded_at).toLocaleDateString('he-IL', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                      {doc.transaction_id && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                          קשור לעסקה
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDocument(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-7xl max-h-[95vh] w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {selectedDocument.description || getFileName(selectedDocument.file_path)}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(selectedDocument.uploaded_at).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedDocument(null)}
                className="ml-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                aria-label="סגור"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {isImage(selectedDocument.file_path) ? (
                <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg p-4 min-h-[400px]">
                  <img
                    src={getFileUrl(selectedDocument.file_path)}
                    alt={selectedDocument.description || getFileName(selectedDocument.file_path)}
                    className="max-w-full max-h-[75vh] h-auto mx-auto rounded-lg shadow-xl object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      const imgUrl = getFileUrl(selectedDocument.file_path)
                      // Failed to load image in modal
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        parent.innerHTML = `
                          <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                            <span class="text-4xl mb-4">❌</span>
                            <span class="text-lg mb-4">שגיאה בטעינת התמונה</span>
                            <a href="${imgUrl}" target="_blank" rel="noopener noreferrer" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                              פתח קישור חדש
                            </a>
                          </div>
                        `
                      }
                    }}
                  />
                </div>
              ) : isPdf(selectedDocument.file_path) ? (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
                  <div className="flex flex-col h-[80vh]">
                    {/* PDF Viewer */}
                    <div className="flex-1 relative">
                      <iframe
                        src={`${getFileUrl(selectedDocument.file_path)}#toolbar=1&navpanes=1&scrollbar=1`}
                        className="w-full h-full border-0"
                        title={selectedDocument.description || getFileName(selectedDocument.file_path)}
                        onError={() => {
                          // Error loading PDF
                        }}
                      />
                      {/* Fallback overlay with download link */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <a
                          href={getFileUrl(selectedDocument.file_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>🔗</span>
                          פתח בחלון חדש
                        </a>
                        <a
                          href={getFileUrl(selectedDocument.file_path)}
                          download
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>📥</span>
                          הורד
                        </a>
                      </div>
                    </div>
                    {/* Alternative: embed tag as fallback */}
                    <embed
                      src={getFileUrl(selectedDocument.file_path)}
                      type="application/pdf"
                      className="hidden"
                      onError={() => {
                        // Error loading PDF
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="mb-6">
                    <svg
                      className="w-24 h-24 text-gray-400 dark:text-gray-500 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                      לא ניתן להציג את הקובץ ישירות
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 text-sm mb-6">
                      סוג קובץ: {getFileExtension(selectedDocument.file_path).toUpperCase() || 'לא ידוע'}
                    </p>
                  </div>
                  <a
                    href={getFileUrl(selectedDocument.file_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <span>📥</span>
                    פתח קישור חדש להורדה
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}


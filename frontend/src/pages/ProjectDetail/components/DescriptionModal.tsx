import {motion} from 'framer-motion'
import api from '../../../lib/api'

interface Document {
    id: number
    fileName: string
    description: string
}

interface DescriptionModalProps {
    isOpen: boolean
    selectedTransactionId: number
    uploadedDocuments: Document[]
    onClose: () => void
    onDocumentsChange: (documents: Document[]) => void
    onSave: () => Promise<void>
    onReloadDocuments: () => Promise<void>
}

export default function DescriptionModal({
    isOpen,
    selectedTransactionId,
    uploadedDocuments,
    onClose,
    onDocumentsChange,
    onSave,
    onReloadDocuments
}: DescriptionModalProps) {
    if (!isOpen || uploadedDocuments.length === 0) return null

    const handleSave = async () => {
        try {
            let updateCount = 0
            for (const doc of uploadedDocuments) {
                if (doc.id > 0) {
                    try {
                        const formData = new FormData()
                        formData.append('description', doc.description || '')
                        await api.put(`/transactions/${selectedTransactionId}/documents/${doc.id}`, formData, {
                            headers: {'Content-Type': 'multipart/form-data'}
                        })
                        updateCount++
                    } catch (err: any) {
                        // Ignore errors
                    }
                }
            }

            onClose()
            await onSave()
            await onReloadDocuments()
        } catch (err: any) {
            alert('שגיאה בשמירת התיאורים')
        }
    }

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                            הוסף תיאורים למסמכים
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            עסקה #{selectedTransactionId} - {uploadedDocuments.length} מסמכים
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    <div className="space-y-4">
                        {uploadedDocuments.map((doc, index) => (
                            <div key={doc.id || index}
                                 className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {doc.fileName}
                                </label>
                                <input
                                    type="text"
                                    value={doc.description}
                                    onChange={(e) => {
                                        const updated = [...uploadedDocuments]
                                        updated[index] = {...updated[index], description: e.target.value}
                                        onDocumentsChange(updated)
                                    }}
                                    placeholder="הזן תיאור למסמך (אופציונלי)"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus={index === 0}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        דלג
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        שמור תיאורים
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}

import Modal from '../../../components/Modal'

interface DeleteConfirmModalProps {
    isOpen: boolean
    projectName: string
    deletePassword: string
    deletePasswordError: string | null
    isDeleting: boolean
    onClose: () => void
    onPasswordChange: (password: string) => void
    onConfirm: () => void
}

export default function DeleteConfirmModal({
    isOpen,
    projectName,
    deletePassword,
    deletePasswordError,
    isDeleting,
    onClose,
    onPasswordChange,
    onConfirm
}: DeleteConfirmModalProps) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="מחיקת פרויקט לצמיתות"
        >
            <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200 font-semibold mb-2">
                        אזהרה: פעולה זו אינה הפיכה!
                    </p>
                    <p className="text-red-700 dark:text-red-300 text-sm">
                        הפרויקט "{projectName}" ימחק לצמיתות יחד עם כל העסקאות והקבצים שלו.
                        לא ניתן לשחזר את המידע לאחר המחיקה.
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        הזן סיסמה לאימות:
                    </label>
                    <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => onPasswordChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        placeholder="סיסמה"
                        autoFocus
                    />
                    {deletePasswordError && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{deletePasswordError}</p>
                    )}
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        disabled={isDeleting}
                    >
                        ביטול
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting || !deletePassword}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? 'מוחק...' : 'מחק לצמיתות'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}

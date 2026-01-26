interface ContractViewerModalProps {
    isOpen: boolean
    contractFileUrl: string | null
    contractViewerUrl: string | null
    onClose: () => void
}

export default function ContractViewerModal({
    isOpen,
    contractFileUrl,
    contractViewerUrl,
    onClose
}: ContractViewerModalProps) {
    if (!isOpen || !contractFileUrl) return null

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">חוזה הפרויקט</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">נפתח בתוך האתר לצפייה מהירה</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href={contractFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            פתח בחלון חדש
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            ✕
                        </button>
                    </div>
                </div>
                <div className="flex-1 w-full bg-gray-50 dark:bg-gray-800">
                    {contractViewerUrl ? (
                        <iframe
                            src={contractViewerUrl}
                            title="תצוגת חוזה"
                            className="w-full h-[70vh] border-0"
                            allowFullScreen
                        />
                    ) : (
                        <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300 space-y-3">
                            <p>לא ניתן להציג תצוגה מקדימה לסוג קובץ זה.</p>
                            <p>
                                ניתן להוריד את הקובץ ולצפות בו במחשב:
                                <br/>
                                <a
                                    href={contractFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 underline"
                                >
                                    הורד את החוזה
                                </a>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

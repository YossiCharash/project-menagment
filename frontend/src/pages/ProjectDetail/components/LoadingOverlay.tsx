interface LoadingOverlayProps {
    loading: boolean
    updatingProject: boolean
}

export default function LoadingOverlay({loading, updatingProject}: LoadingOverlayProps) {
    if (!loading && !updatingProject) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {updatingProject ? 'מעדכן פרויקט...' : 'טוען עסקאות...'}
                </p>
            </div>
        </div>
    )
}

import Modal from '../../../components/Modal'

interface ArchiveDeleteModalProps {
    isOpen: boolean
    projectName: string
    onClose: () => void
    onArchive: () => void
    onDelete: () => void
}

export default function ArchiveDeleteModal({
    isOpen,
    projectName,
    onClose,
    onArchive,
    onDelete
}: ArchiveDeleteModalProps) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="מה תרצה לעשות?"
        >
            <div className="space-y-4">
                <p className="text-gray-700 dark:text-gray-300">
                    בחר פעולה עבור הפרויקט "{projectName}":
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onArchive}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        ארכב
                    </button>
                    <button
                        onClick={onDelete}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        מחק לצמיתות
                    </button>
                </div>
            </div>
        </Modal>
    )
}

import React from 'react'

interface EditRecurringSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onEditInstance: () => void
  onEditSeries: () => void
}

const EditRecurringSelectionModal: React.FC<EditRecurringSelectionModalProps> = ({
  isOpen,
  onClose,
  onEditInstance,
  onEditSeries
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl transform transition-all">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            עריכת עסקה מחזורית
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mb-8">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            זוהי עסקה מחזורית. האם ברצונך לערוך רק את העסקה הזו, או את כל הסדרה (תבנית)?
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onEditSeries}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <span>ערוך סדרה (תבנית)</span>
            <span className="text-blue-200 text-sm font-normal">- ישפיע על עסקאות עתידיות</span>
          </button>
          
          <button
            onClick={onEditInstance}
            className="w-full py-3 px-4 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            ערוך עסקה ספציפית זו בלבד
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditRecurringSelectionModal


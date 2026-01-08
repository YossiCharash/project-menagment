import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import RecurringTransactionManagement from '../components/RecurringTransactionManagement'
import EditRecurringTemplateModal from '../components/EditRecurringTemplateModal'
import EditTransactionInstanceModal from '../components/EditTransactionInstanceModal'
import { RecurringTransactionTemplate, Transaction } from '../types/api'

const RecurringTransactionsPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const [editTemplateModalOpen, setEditTemplateModalOpen] = useState(false)
  const [editInstanceModalOpen, setEditInstanceModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<RecurringTransactionTemplate | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)

  const handleEditTemplate = (template: RecurringTransactionTemplate) => {
    setSelectedTemplate(template)
    setEditTemplateModalOpen(true)
  }

  const handleEditTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setEditInstanceModalOpen(true)
  }

  const handleModalClose = () => {
    setEditTemplateModalOpen(false)
    setEditInstanceModalOpen(false)
    setSelectedTemplate(null)
    setSelectedTransaction(null)
  }

  const handleSuccess = () => {
    // Refresh data or show success message
    handleModalClose()
  }

  if (!projectId) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            שגיאה: לא נמצא מזהה פרויקט
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <RecurringTransactionManagement 
        projectId={parseInt(projectId)}
        onEditTemplate={handleEditTemplate}
        onEditTransaction={handleEditTransaction}
      />

      <EditRecurringTemplateModal
        isOpen={editTemplateModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
        template={selectedTemplate}
      />

      <EditTransactionInstanceModal
        isOpen={editInstanceModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
        transaction={selectedTransaction}
      />
    </div>
  )
}

export default RecurringTransactionsPage

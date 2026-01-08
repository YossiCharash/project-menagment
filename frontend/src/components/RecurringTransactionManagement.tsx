import React, { useState, useEffect } from 'react'
import { RecurringTransactionTemplate, Transaction } from '../types/api'
import { RecurringTransactionAPI } from '../lib/apiClient'

interface RecurringTransactionManagementProps {
  projectId: number
  onEditTemplate?: (template: RecurringTransactionTemplate) => void
  onEditTransaction?: (transaction: Transaction) => void
}

const RecurringTransactionManagement: React.FC<RecurringTransactionManagementProps> = ({ 
  projectId, 
  onEditTemplate, 
  onEditTransaction 
}) => {
  const [templates, setTemplates] = useState<RecurringTransactionTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<RecurringTransactionTemplate | null>(null)
  const [templateTransactions, setTemplateTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [projectId])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await RecurringTransactionAPI.getProjectTemplates(projectId)
      setTemplates(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בטעינת התבניות')
    } finally {
      setLoading(false)
    }
  }

  const loadTemplateTransactions = async (templateId: number) => {
    try {
      const data = await RecurringTransactionAPI.getTemplateTransactions(templateId)
      setTemplateTransactions(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בטעינת העסקאות')
    }
  }

  const handleTemplateSelect = async (template: RecurringTransactionTemplate) => {
    setSelectedTemplate(template)
    await loadTemplateTransactions(template.id)
  }

  const handleDeactivateTemplate = async (templateId: number) => {
    try {
      await RecurringTransactionAPI.deactivateTemplate(templateId)
      await loadTemplates()
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null)
        setTemplateTransactions([])
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בעדכון התבנית')
    }
  }

  const handleDeleteTemplate = async (templateId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התבנית? פעולה זו תבטל יצירת עסקאות עתידיות אך לא תמחק עסקאות שכבר נוצרו.')) {
      return
    }

    try {
      await RecurringTransactionAPI.deleteTemplate(templateId)
      await loadTemplates()
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null)
        setTemplateTransactions([])
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה במחיקת התבנית')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL')
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600 dark:text-gray-400">טוען...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          ניהול עסקאות חוזרות
        </h2>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Templates List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            תבניות עסקאות חוזרות
          </h3>
          
          {templates.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              אין תבניות עסקאות חוזרות
            </p>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {template.description}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {template.type === 'Income' ? 'הכנסה' : 'הוצאה'} • {formatCurrency(template.amount)}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        יום {template.day_of_month} בכל חודש
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {template.category && `קטגוריה: ${template.category}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditTemplate?.(template)
                        }}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        ערוך
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeactivateTemplate(template.id)
                        }}
                        className={`px-2 py-1 text-xs rounded hover:opacity-80 ${
                          template.is_active
                            ? 'bg-yellow-600 text-white'
                            : 'bg-green-600 text-white'
                        }`}
                        title={template.is_active ? 'השבת תבנית' : 'הפעל תבנית'}
                      >
                        {template.is_active ? 'השבת' : 'הפעל'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTemplate(template.id)
                        }}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        title="מחק תבנית"
                      >
                        מחק
                      </button>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        template.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        {template.is_active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {selectedTemplate ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  פרטי התבנית
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeactivateTemplate(selectedTemplate.id)}
                    className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  >
                    {selectedTemplate.is_active ? 'השבת' : 'הפעל'}
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    מחק
                  </button>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">תיאור:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{selectedTemplate.description}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">סוג:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {selectedTemplate.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">סכום:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{formatCurrency(selectedTemplate.amount)}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">יום בחודש:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{selectedTemplate.day_of_month}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">תאריך התחלה:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{formatDate(selectedTemplate.start_date)}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">סיום:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {selectedTemplate.end_type === 'No End' && 'ללא סיום'}
                    {selectedTemplate.end_type === 'After Occurrences' && `לאחר ${selectedTemplate.max_occurrences} הופעות`}
                    {selectedTemplate.end_type === 'On Date' && selectedTemplate.end_date && formatDate(selectedTemplate.end_date)}
                  </span>
                </div>
                {selectedTemplate.category && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">קטגוריה:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedTemplate.category}</span>
                  </div>
                )}
                {selectedTemplate.notes && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">הערות:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{selectedTemplate.notes}</span>
                  </div>
                )}
              </div>

              {/* Generated Transactions */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  עסקאות שנוצרו ({templateTransactions.length})
                </h4>
                {templateTransactions.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    עדיין לא נוצרו עסקאות מתבנית זו
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {templateTransactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="p-3 bg-gray-50 dark:bg-gray-700 rounded border"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatDate(transaction.tx_date)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {formatCurrency(transaction.amount)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {transaction.category || 'ללא קטגוריה'}
                            </p>
                            <div className="flex items-center gap-2">
                              {transaction.is_generated && (
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  נוצר אוטומטית
                                </span>
                              )}
                              <button
                                onClick={() => onEditTransaction?.(transaction)}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                ערוך
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                בחר תבנית כדי לראות פרטים
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RecurringTransactionManagement

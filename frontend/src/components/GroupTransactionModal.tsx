import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Upload, File } from 'lucide-react'
import { TransactionCreate, ProjectWithFinance, UnforeseenTransactionCreate, UnforeseenTransactionExpenseCreate } from '../types/api'
import { TransactionAPI, ProjectAPI, CategoryAPI, Category, UnforeseenTransactionAPI, GroupTransactionDraftAPI, GroupTransactionDraftOut } from '../lib/apiClient'
import api from '../lib/api'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchSuppliers } from '../store/slices/suppliersSlice'
import ConfirmationModal from './ConfirmationModal'
import DuplicateWarningModal from './DuplicateWarningModal'

interface GroupTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface TransactionRow {
  id: string
  projectId: number | ''
  subprojectId: number | ''
  type: 'Income' | 'Expense'
  txDate: string
  amount: number | ''
  description: string
  categoryId: number | ''
  supplierId: number | ''
  paymentMethod: string
  notes: string
  isExceptional: boolean
  fromFund: boolean
  files: File[]
  dateError: string | null
  duplicateError: string | null
  checkingDuplicate: boolean
  // Dated transaction (עסקה תאריכית): from date – to date
  period_start_date: string
  period_end_date: string
  periodError: string | null
  // Unforeseen transaction fields
  isUnforeseen?: boolean
  /** סטטוס לעסקה לא צפויה: טיוטה | מחכה לאישור | אשר כבוצע */
  unforeseenStatus?: 'draft' | 'waiting_for_approval' | 'executed'
  incomes?: Array<{ amount: number | ''; description: string; documentFiles: File[] }>
  expenses?: Array<{ amount: number | ''; description: string; documentFiles: File[] }>
  contractPeriodId?: number | ''
}

/** מנרמל תאריך לפורמט YYYY-MM-DD לתצוגה ב-input type="date". מחזיר רק מחרוזת תקינה או ריקה. */
const normalizeDateForInput = (d: unknown): string => {
  if (d == null || d === '') return ''
  if (typeof d === 'number') {
    if (d < 10000) return '' // 126, 1260 - כנראה לא תאריך תקין
    const parsed = d > 1e12 ? new Date(d) : new Date(d * 1000) // ms או seconds
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
    return ''
  }
  if (typeof d !== 'string') return ''
  const s = String(d).trim()
  if (!s || s.length < 10) return '' // "126" וכו' - לא תאריך מלא
  const iso = s.substring(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
  return ''
}

const GroupTransactionModal: React.FC<GroupTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const dispatch = useAppDispatch()
  const { items: suppliers, loading: suppliersLoading } = useAppSelector(s => s.suppliers)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectWithFinance[]>([])
  const [subprojectsMap, setSubprojectsMap] = useState<Record<number, ProjectWithFinance[]>>({})
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [editingField, setEditingField] = useState<'description' | 'notes' | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editorValue, setEditorValue] = useState('')
  const [contractPeriodsMap, setContractPeriodsMap] = useState<Record<number, Array<{ period_id: number; year_label: string; start_date: string; end_date: string | null }>>>({})
  const [submitProgress, setSubmitProgress] = useState<{done: number, total: number} | null>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftsList, setDraftsList] = useState<GroupTransactionDraftOut[]>([])
  const [showLoadDraft, setShowLoadDraft] = useState(false)
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftToDelete, setDraftToDelete] = useState<GroupTransactionDraftOut | null>(null)
  const [deletingDraft, setDeletingDraft] = useState(false)
  /** כשנטענה טיוטה שמורה – מזהה ושם ננעלים (לא ניתן להחליף שם) */
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null)
  const [currentDraftName, setCurrentDraftName] = useState('')
  const [rows, setRows] = useState<TransactionRow[]>([
    {
      id: '1',
      projectId: '',
      subprojectId: '',
      type: 'Expense',
      txDate: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      categoryId: '',
      supplierId: '',
      paymentMethod: '',
      notes: '',
      isExceptional: false,
      fromFund: false,
      files: [],
      dateError: null,
      duplicateError: null,
      checkingDuplicate: false,
      period_start_date: '',
      period_end_date: '',
      periodError: null,
      isUnforeseen: false,
      unforeseenStatus: 'draft',
      incomes: [{ amount: '', description: '', documentFiles: [] }],
      expenses: [{ amount: '', description: '', documentFiles: [] }],
      contractPeriodId: ''
    }
  ])

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchSuppliers())
      loadProjects()
      loadCategories()
    }
  }, [isOpen, dispatch])

  const loadProjects = async () => {
    try {
      const data = await ProjectAPI.getProjects()
      const filtered = data.filter((p: ProjectWithFinance) => 
        p.is_active && (!p.relation_project || p.is_parent_project)
      )
      setProjects(filtered)
    } catch (err: any) {
      console.error('Error loading projects:', err)
      setError('שגיאה בטעינת פרויקטים. נסה לסגור ולפתוח מחדש.')
    }
  }

  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      setAvailableCategories(categories.filter(cat => cat.is_active))
    } catch (err: any) {
      console.error('Error loading categories:', err)
      // Don't show error for categories - not critical
    }
  }

  const loadSubprojects = async (parentProjectId: number) => {
    if (subprojectsMap[parentProjectId]) {
      return
    }
    try {
      const { data } = await api.get(`/projects/${parentProjectId}/subprojects`)
      setSubprojectsMap(prev => ({
        ...prev,
        [parentProjectId]: data || []
      }))
    } catch (err: any) {
      console.error('Error loading subprojects:', err)
      setError('שגיאה בטעינת תתי-פרויקטים.')
    }
  }

  const loadContractPeriods = async (projectId: number) => {
    if (contractPeriodsMap[projectId]) {
      return
    }
    try {
      const periodsData = await ProjectAPI.getContractPeriods(projectId)
      const periods: Array<{ period_id: number; year_label: string; start_date: string; end_date: string | null }> = []
      if (periodsData.periods_by_year) {
        periodsData.periods_by_year.forEach((yearData: any) => {
          yearData.periods.forEach((period: any) => {
            periods.push({
              period_id: period.period_id,
              year_label: period.year_label,
              start_date: period.start_date,
              end_date: period.end_date
            })
          })
        })
      }
      setContractPeriodsMap(prev => ({
        ...prev,
        [projectId]: periods
      }))
    } catch (err: any) {
      console.error('Error loading contract periods:', err)
      // Don't show error - not critical for form operation
    }
  }

  const handleProjectChange = (rowId: string, projectId: number | '') => {
    setRows(prevRows => {
      const newRows = prevRows.map(row => {
        if (row.id === rowId) {
          const project = projects.find(p => p.id === projectId)
          const updatedRow = {
            ...row,
            projectId: projectId as number,
            subprojectId: '' as number | ''
          }
          
          if (project?.is_parent_project && projectId) {
            loadSubprojects(projectId as number)
          }
          
          // Load contract periods if in unforeseen mode
          if (row.isUnforeseen && projectId) {
            loadContractPeriods(projectId as number)
          }
          
          // Validate date after project change
          setTimeout(() => validateRowDate(updatedRow), 0)
          
          // Check for duplicates after project change (only for regular transactions)
          if (!row.isUnforeseen) {
            setTimeout(() => {
              setRows(currentRows => {
                const currentRow = currentRows.find(r => r.id === rowId)
                if (currentRow) {
                  checkDuplicateTransaction(currentRow)
                }
                return currentRows
              })
            }, 300)
          }
          
          return updatedRow
        }
        return row
      })
      return newRows
    })
  }

  const addRow = () => {
      const newRow: TransactionRow = {
      id: Date.now().toString(),
      projectId: '',
      subprojectId: '',
      type: 'Expense',
      txDate: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      categoryId: '',
      supplierId: '',
      paymentMethod: '',
      notes: '',
      isExceptional: false,
      fromFund: false,
      files: [],
      dateError: null,
      duplicateError: null,
      checkingDuplicate: false,
      period_start_date: '',
      period_end_date: '',
      periodError: null,
      isUnforeseen: false,
      unforeseenStatus: 'draft',
      incomes: [{ amount: '', description: '', documentFiles: [] }],
      expenses: [{ amount: '', description: '', documentFiles: [] }],
      contractPeriodId: ''
    }
    setRows([...rows, newRow])
  }

  const setRowUnforeseen = (rowId: string, isUnforeseen: boolean) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id !== rowId) return row
        if (isUnforeseen) {
          if (row.projectId) loadContractPeriods(row.projectId as number)
          return {
            ...row,
            isUnforeseen: true,
            unforeseenStatus: row.unforeseenStatus ?? 'draft',
            incomes: row.incomes?.length ? row.incomes : [{ amount: '', description: '', documentFiles: [] }],
            expenses: row.expenses?.length ? row.expenses : [{ amount: '', description: '', documentFiles: [] }],
            contractPeriodId: row.contractPeriodId || ''
          }
        }
        return {
          ...row,
          isUnforeseen: false,
          unforeseenStatus: undefined,
          incomes: undefined,
          expenses: undefined,
          contractPeriodId: ''
        }
      })
    )
  }

  const handleAddExpense = (rowId: string) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, expenses: [...(row.expenses || []), { amount: '', description: '', documentFiles: [] }] }
          : row
      )
    )
  }

  const handleAddIncome = (rowId: string) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, incomes: [...(row.incomes || []), { amount: '', description: '', documentFiles: [] }] }
          : row
      )
    )
  }

  const handleRemoveExpense = (rowId: string, expenseIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, expenses: (row.expenses || []).filter((_, i) => i !== expenseIndex) }
          : row
      )
    )
  }

  const handleRemoveIncome = (rowId: string, incomeIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, incomes: (row.incomes || []).filter((_, i) => i !== incomeIndex) }
          : row
      )
    )
  }

  const handleExpenseChange = (rowId: string, expenseIndex: number, field: 'amount' | 'description', value: string | number) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.expenses) {
          const newExpenses = [...row.expenses]
          newExpenses[expenseIndex] = { ...newExpenses[expenseIndex], [field]: value }
          return { ...row, expenses: newExpenses }
        }
        return row
      })
    )
  }

  const handleIncomeChange = (rowId: string, incomeIndex: number, field: 'amount' | 'description', value: string | number) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.incomes) {
          const newIncomes = [...row.incomes]
          newIncomes[incomeIndex] = { ...newIncomes[incomeIndex], [field]: value }
          return { ...row, incomes: newIncomes }
        }
        return row
      })
    )
  }

  const handleExpenseFileUpload = (rowId: string, expenseIndex: number, files: FileList | null) => {
    if (!files) return
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.expenses) {
          const newExpenses = [...row.expenses]
          newExpenses[expenseIndex] = {
            ...newExpenses[expenseIndex],
            documentFiles: [...(newExpenses[expenseIndex].documentFiles || []), ...Array.from(files)]
          }
          return { ...row, expenses: newExpenses }
        }
        return row
      })
    )
  }

  const handleIncomeFileUpload = (rowId: string, incomeIndex: number, files: FileList | null) => {
    if (!files) return
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.incomes) {
          const newIncomes = [...row.incomes]
          newIncomes[incomeIndex] = {
            ...newIncomes[incomeIndex],
            documentFiles: [...(newIncomes[incomeIndex].documentFiles || []), ...Array.from(files)]
          }
          return { ...row, incomes: newIncomes }
        }
        return row
      })
    )
  }

  const handleRemoveExpenseFile = (rowId: string, expenseIndex: number, fileIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.expenses) {
          const newExpenses = [...row.expenses]
          const docFiles = newExpenses[expenseIndex].documentFiles || []
          newExpenses[expenseIndex] = { ...newExpenses[expenseIndex], documentFiles: docFiles.filter((_, i) => i !== fileIndex) }
          return { ...row, expenses: newExpenses }
        }
        return row
      })
    )
  }

  const handleRemoveIncomeFile = (rowId: string, incomeIndex: number, fileIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId && row.incomes) {
          const newIncomes = [...row.incomes]
          const docFiles = newIncomes[incomeIndex].documentFiles || []
          newIncomes[incomeIndex] = { ...newIncomes[incomeIndex], documentFiles: docFiles.filter((_, i) => i !== fileIndex) }
          return { ...row, incomes: newIncomes }
        }
        return row
      })
    )
  }

  const removeRow = (rowId: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(row => row.id !== rowId))
    }
  }

  const updateRow = (rowId: string, field: keyof TransactionRow, value: any) => {
    setRows(prevRows =>
      prevRows.map(row => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: value }
          
          // If category changed, reset supplier if it doesn't match the new category
          if (field === 'categoryId') {
            const selectedCategoryId = value ? Number(value) : null
            const selectedCategory = selectedCategoryId ? availableCategories.find(c => c.id === selectedCategoryId) : null
            
            if (selectedCategoryId && row.supplierId) {
              // Check if current supplier belongs to the new category
              const currentSupplier = suppliers.find(s => s.id === row.supplierId)
              if (currentSupplier && selectedCategoryId) {
                if (currentSupplier.category_id !== selectedCategoryId) {
                  updatedRow.supplierId = ''
                }
              }
            } else if (!selectedCategoryId) {
              // If no category selected, clear supplier
              updatedRow.supplierId = ''
            }
          }
          
          // Validate date when project or date changes
          if (field === 'txDate' || field === 'projectId' || field === 'subprojectId') {
            validateRowDate(updatedRow)
          }
          // Validate period (מתאריך–עד תאריך) when period dates change
          if (field === 'period_start_date' || field === 'period_end_date') {
            validateRowPeriod(updatedRow)
          }
          
          // Check for duplicates when relevant fields change (skip for period/dated transactions)
          const isPeriodTx = !!(updatedRow.period_start_date && updatedRow.period_end_date)
          if (!isPeriodTx && (field === 'projectId' || field === 'subprojectId' || field === 'txDate' || 
              field === 'amount' || field === 'supplierId' || field === 'type' || field === 'fromFund')) {
            setTimeout(() => {
              setRows(currentRows => {
                const currentRow = currentRows.find(r => r.id === rowId)
                if (currentRow) {
                  checkDuplicateTransaction(currentRow)
                }
                return currentRows
              })
            }, 300) // Debounce: wait 300ms after last change
          }
          
          return updatedRow
        }
        return row
      })
    )
  }

  const validateRowDate = (row: TransactionRow) => {
    if (!row.txDate || !row.projectId) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
      return
    }

    const project = getSelectedProject(row)
    const subproject = row.subprojectId ? getSelectedSubproject(row) : null
    const selectedProject = subproject || project
    const thresholdDate = selectedProject?.first_contract_start_date || selectedProject?.start_date
    
    if (!thresholdDate) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
      return
    }

    const contractStartDateStr = thresholdDate.split('T')[0]
    const transactionDateStr = row.txDate.split('T')[0]
    
    const contractStartDate = new Date(contractStartDateStr + 'T00:00:00')
    const transactionDate = new Date(transactionDateStr + 'T00:00:00')
    
    if (transactionDate < contractStartDate) {
      const formattedStartDate = contractStartDate.toLocaleDateString('he-IL')
      const formattedTxDate = transactionDate.toLocaleDateString('he-IL')
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id
            ? {
                ...r,
                dateError: `לא ניתן ליצור עסקה לפני תאריך תחילת החוזה הראשון. תאריך תחילת החוזה הראשון: ${formattedStartDate}, תאריך העסקה: ${formattedTxDate}`
              }
            : r
        )
      )
    } else {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, dateError: null } : r
        )
      )
    }
  }

  const validateRowPeriod = (row: TransactionRow) => {
    const hasStart = !!(row.period_start_date && row.period_start_date.trim())
    const hasEnd = !!(row.period_end_date && row.period_end_date.trim())
    if (!hasStart && !hasEnd) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, periodError: null } : r
        )
      )
      return
    }
    if (hasStart && !hasEnd) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, periodError: 'יש למלא גם תאריך סיום (עד תאריך)' } : r
        )
      )
      return
    }
    if (!hasStart && hasEnd) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, periodError: 'יש למלא גם תאריך התחלה (מתאריך)' } : r
        )
      )
      return
    }
    const start = new Date(row.period_start_date!.trim())
    const end = new Date(row.period_end_date!.trim())
    if (end < start) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, periodError: 'תאריך סיום חייב להיות אחרי תאריך התחלה' } : r
        )
      )
      return
    }
    const project = getSelectedProject(row)
    const subproject = row.subprojectId ? getSelectedSubproject(row) : null
    const selectedProject = subproject || project
    const thresholdDate = selectedProject?.first_contract_start_date || selectedProject?.start_date
    if (thresholdDate) {
      const contractStart = new Date(thresholdDate.toString().split('T')[0])
      if (start < contractStart) {
        setRows(prevRows =>
          prevRows.map(r =>
            r.id === row.id ? { ...r, periodError: `תאריך התחלה לא יכול להיות לפני תחילת החוזה (${contractStart.toLocaleDateString('he-IL')})` } : r
          )
        )
        return
      }
    }
    setRows(prevRows =>
      prevRows.map(r =>
        r.id === row.id ? { ...r, periodError: null } : r
      )
    )
  }

  const checkDuplicateTransaction = async (row: TransactionRow) => {
    // Skip duplicate check for period/dated transactions (backend does overlap check)
    if (row.period_start_date && row.period_end_date) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, duplicateError: null, checkingDuplicate: false } : r
        )
      )
      return
    }
    // Only check for Expense transactions that are not from fund
    if (row.type !== 'Expense' || row.fromFund) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, duplicateError: null, checkingDuplicate: false } : r
        )
      )
      return
    }

    // Need project, date, and amount to check for duplicates
    if (!row.projectId || !row.txDate || !row.amount || Number(row.amount) <= 0) {
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, duplicateError: null, checkingDuplicate: false } : r
        )
      )
      return
    }

    // Set checking state
    setRows(prevRows =>
      prevRows.map(r =>
        r.id === row.id ? { ...r, checkingDuplicate: true, duplicateError: null } : r
      )
    )

    try {
      const projectId = row.subprojectId || row.projectId as number
      const params = new URLSearchParams({
        project_id: String(projectId),
        tx_date: row.txDate,
        amount: String(row.amount),
        type: 'Expense'
      })
      
      if (row.supplierId) {
        params.append('supplier_id', String(row.supplierId))
      }

      const response = await api.get(`/transactions/check-duplicate?${params.toString()}`)
      
      if (response.data.has_duplicate && response.data.duplicates.length > 0) {
        const duplicates = response.data.duplicates
        const duplicateDetails = duplicates.map((dup: any) => {
          let info = `עסקה #${dup.id} מתאריך ${dup.tx_date}`
          if (dup.supplier_name) {
            info += ` לספק ${dup.supplier_name}`
          }
          return info
        }).join('\n')

        const errorMessage = `⚠️ זוהתה עסקה כפולה!\n\nקיימת עסקה עם אותם פרטים:\n${duplicateDetails}\n\nאם זה תשלום שונה, אנא שנה את התאריך או הסכום.\nאם זה אותו תשלום, אנא בדוק את הרשומות הקיימות.`

        setRows(prevRows =>
          prevRows.map(r =>
            r.id === row.id ? { ...r, duplicateError: errorMessage, checkingDuplicate: false } : r
          )
        )
      } else {
        setRows(prevRows =>
          prevRows.map(r =>
            r.id === row.id ? { ...r, duplicateError: null, checkingDuplicate: false } : r
          )
        )
      }
    } catch (error) {
      // On error, clear the duplicate error (don't block user)
      console.error('Error checking duplicate:', error)
      setRows(prevRows =>
        prevRows.map(r =>
          r.id === row.id ? { ...r, duplicateError: null, checkingDuplicate: false } : r
        )
      )
    }
  }

  const handleFileUpload = (rowId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, files: [...row.files, ...Array.from(files)] }
          : row
      )
    )
  }

  const removeFile = (rowId: string, fileIndex: number) => {
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === rowId
          ? { ...row, files: row.files.filter((_, i) => i !== fileIndex) }
          : row
      )
    )
  }

  const getSelectedProject = (row: TransactionRow): ProjectWithFinance | null => {
    if (!row.projectId) return null
    return projects.find(p => p.id === row.projectId) || null
  }

  const getSelectedSubproject = (row: TransactionRow): ProjectWithFinance | null => {
    if (!row.subprojectId || !row.projectId) return null
    const subprojects = getSubprojectsForProject(row.projectId as number)
    return subprojects.find(sp => sp.id === row.subprojectId) || null
  }

  const hasFundForRow = (row: TransactionRow): boolean => {
    // Need a project selected first
    if (!row.projectId) {
      return false
    }
    
    // If subproject is selected, check subproject's fund
    if (row.subprojectId) {
      const subproject = getSelectedSubproject(row)
      return subproject?.has_fund === true
    }
    // Otherwise check main project's fund
    const project = getSelectedProject(row)
    return project?.has_fund === true
  }

  const getSubprojectsForProject = (projectId: number): ProjectWithFinance[] => {
    return subprojectsMap[projectId] || []
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await doSubmit(false)
  }

  const handleConfirmDuplicateSubmit = async () => {
    setShowDuplicateConfirm(false)
    await doSubmit(true)
  }

  const doSubmit = async (forceAllowDuplicate: boolean) => {
    setLoading(true)
    setError(null)

    // Validate all rows
    const errors: string[] = []
    const duplicateWarnings: string[] = []
    rows.forEach((row, index) => {
      if (!row.projectId) {
        errors.push(`שורה ${index + 1}: יש לבחור פרויקט`)
      }
      if (row.projectId) {
        const project = getSelectedProject(row)
        if (project?.is_parent_project && !row.subprojectId && !row.isUnforeseen) {
          errors.push(`שורה ${index + 1}: יש לבחור תת-פרויקט`)
        }
      }

      if (row.isUnforeseen) {
        const totalIncomes = (row.incomes || []).reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0)
        const hasExpenses = row.expenses && row.expenses.length > 0 && !row.expenses.every(exp => !exp.amount || Number(exp.amount) <= 0)
        const hasIncomes = totalIncomes > 0
        if (!hasIncomes && !hasExpenses) {
          errors.push(`שורה ${index + 1}: יש להזין לפחות הכנסה אחת או הוצאה אחת`)
        }
      } else {
        // Validate regular transaction fields
        if (!row.amount || Number(row.amount) <= 0) {
          errors.push(`שורה ${index + 1}: יש להזין סכום תקין`)
        }
        if (row.type === 'Expense' && !row.fromFund && !row.supplierId) {
          // Check if category is "אחר" (Other) - if so, supplier is not required
          const category = row.categoryId ? availableCategories.find(c => c.id === row.categoryId) : null
          if (!category || category.name !== 'אחר') {
            errors.push(`שורה ${index + 1}: יש לבחור ספק לעסקת הוצאה`)
          }
        }
      }

      const isPeriodTx = !!(row.period_start_date && row.period_end_date)
      if (isPeriodTx) {
        if (!row.period_start_date?.trim() || !row.period_end_date?.trim()) {
          errors.push(`שורה ${index + 1}: בעסקה תאריכית יש למלא מתאריך ועד תאריך`)
        }
        if (row.periodError) {
          errors.push(`שורה ${index + 1}: ${row.periodError}`)
        }
      } else {
        if (!row.txDate) {
          errors.push(`שורה ${index + 1}: יש להזין תאריך`)
        }
      }
      if (row.dateError) {
        errors.push(`שורה ${index + 1}: ${row.dateError}`)
      }
      if (row.duplicateError && !row.isUnforeseen) {
        duplicateWarnings.push(`שורה ${index + 1}: ${row.duplicateError}`)
      }
    })

    if (errors.length > 0) {
      setError(errors.join('\n'))
      setLoading(false)
      return
    }

    // If there are duplicate warnings and not forced, show confirmation modal
    if (duplicateWarnings.length > 0 && !forceAllowDuplicate) {
      setShowDuplicateConfirm(true)
      setLoading(false)
      return
    }

    // Create all transactions; track which row indices succeeded (for partial failure: keep only failed rows and offer "save remaining as draft")
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: []
    }
    const succeededRowIndices = new Set<number>()

    // Process a single row (unforeseen or regular transaction + file uploads)
    const processRow = async (row: TransactionRow, i: number): Promise<{ succeeded: boolean; rowErrors: string[] }> => {
      const rowErrors: string[] = []
      try {
        if (row.isUnforeseen) {
          const projectId = (row.subprojectId || row.projectId) as number
          const expenseData: UnforeseenTransactionExpenseCreate[] = (row.expenses || [])
            .filter(exp => exp.amount && Number(exp.amount) > 0)
            .map(exp => ({
              amount: Number(exp.amount),
              description: exp.description || undefined
            }))
          const incomeData = (row.incomes || [])
            .filter(inc => inc.amount && Number(inc.amount) > 0)
            .map(inc => ({
              amount: Number(inc.amount),
              description: inc.description || undefined
            }))

          if (expenseData.length === 0 && incomeData.length === 0) {
            rowErrors.push(`שורה ${i + 1}: יש להזין לפחות הכנסה אחת או הוצאה אחת`)
            return { succeeded: false, rowErrors }
          }

          const totalIncomesSum = incomeData.reduce((s, inc) => s + inc.amount, 0)
          const unforeseenData: UnforeseenTransactionCreate = {
            project_id: projectId,
            contract_period_id: row.contractPeriodId ? Number(row.contractPeriodId) : undefined,
            income_amount: totalIncomesSum,
            description: row.description || undefined,
            notes: row.notes || undefined,
            transaction_date: row.txDate,
            expenses: expenseData,
            incomes: incomeData.length > 0 ? incomeData : undefined
          }

          const unforeseenTx = await UnforeseenTransactionAPI.createUnforeseenTransaction(unforeseenData)
          await new Promise(r => setTimeout(r, 300))

          let unforeseenDocError = false
          if (unforeseenTx.incomes && row.incomes) {
            const createdIncomes = unforeseenTx.incomes
            const filteredIncomes = (row.incomes || []).filter(inc => inc.amount && Number(inc.amount) > 0)
            for (let incIdx = 0; incIdx < filteredIncomes.length; incIdx++) {
              const incRow = filteredIncomes[incIdx]
              const createdInc = createdIncomes[incIdx]
              if (incRow.documentFiles?.length && createdInc?.id) {
                for (const file of incRow.documentFiles) {
                  try {
                    if (file.size > 50 * 1024 * 1024) {
                      rowErrors.push(`שורה ${i + 1}, הכנסה ${incIdx + 1}: ${file.name} גדול מדי`)
                      unforeseenDocError = true
                      continue
                    }
                    await UnforeseenTransactionAPI.uploadIncomeDocument(unforeseenTx.id, createdInc.id, file)
                  } catch (err: any) {
                    rowErrors.push(`שורה ${i + 1}, הכנסה ${incIdx + 1}: ${err.response?.data?.detail || err.message || 'שגיאה בהעלאה'}`)
                    unforeseenDocError = true
                  }
                }
              }
            }
          }

          if (unforeseenTx.expenses && row.expenses) {
            const createdExpenses = unforeseenTx.expenses
            const filteredExpenses = (row.expenses || []).filter(exp => exp.amount && Number(exp.amount) > 0)
            for (let expIdx = 0; expIdx < filteredExpenses.length; expIdx++) {
              const expRow = filteredExpenses[expIdx]
              const createdExp = createdExpenses[expIdx]
              if (expRow.documentFiles?.length && createdExp?.id) {
                for (const file of expRow.documentFiles) {
                  try {
                    if (file.size > 50 * 1024 * 1024) {
                      rowErrors.push(`שורה ${i + 1}, הוצאה ${expIdx + 1}: ${file.name} גדול מדי`)
                      unforeseenDocError = true
                      continue
                    }
                    await UnforeseenTransactionAPI.uploadExpenseDocument(unforeseenTx.id, createdExp.id, file)
                  } catch (err: any) {
                    rowErrors.push(`שורה ${i + 1}, הוצאה ${expIdx + 1}: ${err.response?.data?.detail || err.message || 'שגיאה בהעלאה'}`)
                    unforeseenDocError = true
                  }
                }
              }
            }
          }

          if (unforeseenDocError) {
            try {
              await UnforeseenTransactionAPI.deleteUnforeseenTransaction(unforeseenTx.id)
            } catch (_) {}
            rowErrors.push(`שורה ${i + 1}: העסקה הלא צפויה בוטלה כי העלאת מסמכים נכשלה`)
            return { succeeded: false, rowErrors }
          }

          const status = row.unforeseenStatus ?? 'draft'
          if (status === 'waiting_for_approval') {
            try {
              await UnforeseenTransactionAPI.updateUnforeseenTransaction(unforeseenTx.id, { status: 'waiting_for_approval' })
            } catch (err: any) {
              rowErrors.push(`שורה ${i + 1}: ${err.response?.data?.detail || err.message || 'שגיאה בעדכון סטטוס למחכה לאישור'}`)
            }
          } else if (status === 'executed') {
            try {
              await UnforeseenTransactionAPI.executeUnforeseenTransaction(unforeseenTx.id)
            } catch (err: any) {
              rowErrors.push(`שורה ${i + 1}: ${err.response?.data?.detail || err.message || 'שגיאה באישור כבוצע'}`)
            }
          }

          return { succeeded: true, rowErrors }
        }

        // Create regular transaction
        // Subprojects are actually projects with relation_project set
        // So we use the subproject's ID directly as project_id
        const projectId = row.subprojectId || row.projectId as number
        const isPeriodTx = !!(row.period_start_date && row.period_end_date)
        const tx_date = isPeriodTx ? row.period_start_date! : row.txDate
        const transactionData: TransactionCreate = {
          project_id: projectId,
          tx_date,
          type: row.type,
          amount: Number(row.amount),
          description: row.description || undefined,
          category_id: row.categoryId ? Number(row.categoryId) : undefined,
          supplier_id: row.supplierId ? Number(row.supplierId) : undefined,
          payment_method: row.paymentMethod || undefined,
          notes: row.notes || undefined,
          is_exceptional: row.isExceptional,
          from_fund: row.fromFund
        }
        if (isPeriodTx) {
          transactionData.period_start_date = row.period_start_date!
          transactionData.period_end_date = row.period_end_date!
        }

        const transaction = forceAllowDuplicate && row.duplicateError
          ? (await api.post('/transactions/', { ...transactionData, allow_duplicate: true })).data
          : await TransactionAPI.createTransaction(transactionData)

        if (!transaction || !transaction.id) {
          console.error('[GROUP TX] Transaction created but no ID returned:', transaction)
          throw new Error('Transaction was created but did not return an ID')
        }

        // Ensure transaction ID is a number
        const transactionId = typeof transaction.id === 'number' ? transaction.id : parseInt(String(transaction.id), 10)
        if (isNaN(transactionId)) {
          console.error('[GROUP TX] Invalid transaction ID:', transaction.id)
          throw new Error(`Invalid transaction ID: ${transaction.id}`)
        }

        // Upload files for this transaction if any; if any upload fails, rollback this transaction so the deal is not performed
        if (row.files.length > 0) {
          console.log(`[GROUP TX] Starting upload of ${row.files.length} files for transaction ${transactionId}`)

          // Add a delay to ensure transaction is committed to database
          // This helps avoid race conditions where the transaction might not be immediately available
          await new Promise(resolve => setTimeout(resolve, 300))

          let fileSuccessCount = 0
          let fileErrorCount = 0
          const fileErrors: string[] = []

          for (let fileIndex = 0; fileIndex < row.files.length; fileIndex++) {
            const file = row.files[fileIndex]
            try {
              const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
              console.log(`[GROUP TX] [${fileIndex + 1}/${row.files.length}] Uploading file: ${file.name} (${fileSizeMB} MB) for transaction ${transactionId}`)

              // Check file size (max 50MB)
              if (file.size > 50 * 1024 * 1024) {
                console.error(`[GROUP TX] File ${file.name} is too large: ${fileSizeMB} MB (max 50MB)`)
                fileErrorCount++
                fileErrors.push(`${file.name}: הקובץ גדול מדי (מקסימום 50MB)`)
                continue
              }

              const uploadStartTime = Date.now()

              // Retry upload if we get a 404 (transaction not found) - might be a race condition
              let uploadResult = null
              let uploadAttempts = 0
              const maxUploadAttempts = 3

              while (uploadAttempts < maxUploadAttempts) {
                try {
                  uploadResult = await TransactionAPI.uploadTransactionDocument(transactionId, file)
                  break // Success, exit retry loop
                } catch (uploadErr: any) {
                  uploadAttempts++
                  // If 404 and not last attempt, wait and retry
                  if (uploadErr.response?.status === 404 && uploadAttempts < maxUploadAttempts) {
                    console.warn(`[GROUP TX] Transaction ${transactionId} not found (attempt ${uploadAttempts}/${maxUploadAttempts}), waiting 200ms before retry...`)
                    await new Promise(resolve => setTimeout(resolve, 200))
                    continue
                  }
                  // Otherwise, rethrow the error to be caught by outer catch
                  throw uploadErr
                }
              }

              const uploadDuration = Date.now() - uploadStartTime
              console.log(`[GROUP TX] File upload completed in ${uploadDuration}ms. Result:`, uploadResult)

              // Verify the upload was successful - only require uploadResult.id
              if (uploadResult && uploadResult.id) {
                // Log a warning if transaction_id doesn't match, but don't fail
                if (uploadResult.transaction_id && uploadResult.transaction_id !== transactionId) {
                  console.warn(`[GROUP TX] Transaction ID mismatch in response: expected ${transactionId}, got ${uploadResult.transaction_id}. Document was still created with id ${uploadResult.id}.`)
                }
                fileSuccessCount++
                console.log(`[GROUP TX] File ${file.name} uploaded successfully with document ID: ${uploadResult.id}`)
              } else {
                console.warn(`[GROUP TX] File ${file.name} uploaded but invalid response:`, uploadResult)
                fileErrorCount++
                fileErrors.push(`${file.name}: לא קיבלנו תשובה תקינה מהשרת`)
              }
            } catch (fileErr: any) {
              console.error(`[GROUP TX] Error uploading file ${file.name} to transaction ${transactionId}:`, {
                error: fileErr,
                message: fileErr.message,
                code: fileErr.code,
                response: fileErr.response ? {
                  status: fileErr.response.status,
                  data: fileErr.response.data
                } : null,
                stack: fileErr.stack
              })

              fileErrorCount++

              // Better error messages
              let errorMsg = 'שגיאה לא ידועה'
              if (fileErr.code === 'ECONNABORTED' || fileErr.message?.includes('timeout')) {
                errorMsg = 'העלאה נכשלה - זמן ההמתנה פג (הקובץ גדול מדי או חיבור איטי)'
              } else if (!fileErr.response && (fileErr.message?.includes('Network Error') || fileErr.code === 'ERR_NETWORK')) {
                errorMsg = 'שגיאת רשת - בדוק את החיבור לאינטרנט'
              } else if (fileErr.response?.status === 404) {
                errorMsg = `העסקה לא נמצאה (Transaction ${transactionId} not found) - ייתכן שהעסקה לא נשמרה נכון`
              } else if (fileErr.response?.status === 413) {
                errorMsg = 'הקובץ גדול מדי'
              } else if (fileErr.response?.status === 400) {
                errorMsg = fileErr.response?.data?.detail || 'פורמט קובץ לא נתמך'
              } else if (fileErr.response?.data?.detail) {
                errorMsg = fileErr.response.data.detail
              } else if (fileErr.message) {
                errorMsg = fileErr.message
              }

              fileErrors.push(`${file.name}: ${errorMsg}`)
            }
          }

          console.log(`[GROUP TX] Upload summary for transaction ${transactionId}:`, {
            total: row.files.length,
            success: fileSuccessCount,
            failed: fileErrorCount,
            errors: fileErrors
          })

          if (fileErrorCount > 0) {
            // אם חלק מהמסמכים לא הועלו – מבטלים את העסקה (rollback) כדי שהעסקה לא תתבצע
            try {
              await TransactionAPI.rollbackTransaction(transactionId)
            } catch (rollbackErr: any) {
              rowErrors.push(`שורה ${i + 1}: ביטול עסקה לאחר כישלון העלאה נכשל: ${rollbackErr.response?.data?.detail || rollbackErr.message || 'שגיאה'}`)
            }
            if (fileSuccessCount > 0) {
              rowErrors.push(`שורה ${i + 1}: הועלו ${fileSuccessCount} מסמכים, ${fileErrorCount} נכשלו – העסקה בוטלה: ${fileErrors.join('; ')}`)
            } else {
              rowErrors.push(`שורה ${i + 1}: כל המסמכים נכשלו בהעלאה – העסקה בוטלה: ${fileErrors.join('; ')}`)
            }
            return { succeeded: false, rowErrors }
          }
          console.log(`All ${fileSuccessCount} files uploaded successfully for transaction ${transactionId}`)
        }
        return { succeeded: true, rowErrors }
      } catch (err: any) {
        const errDetail = err.response?.data?.detail || err.message || 'שגיאה ביצירת העסקה'
        const errFields: string[] | undefined = err.response?.data?.errors
        const errMsg = errFields?.length ? `${errDetail}: ${errFields.join(', ')}` : errDetail
        rowErrors.push(`שורה ${i + 1}: ${errMsg}`)
        return { succeeded: false, rowErrors }
      }
    }

    // Process ALL rows concurrently
    setSubmitProgress({ done: 0, total: rows.length })
    const rowPromises = rows.map((row, i) =>
      processRow(row, i).then(result => {
        setSubmitProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
        return { index: i, ...result }
      })
    )
    const settled = await Promise.allSettled(rowPromises)

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const { index, succeeded, rowErrors } = outcome.value
        results.errors.push(...rowErrors)
        if (succeeded) {
          results.success++
          succeededRowIndices.add(index)
        } else {
          results.failed++
        }
      } else {
        // Promise rejection (unexpected) - count as failure
        results.failed++
        results.errors.push(`שגיאה לא צפויה: ${outcome.reason?.message || 'Unknown error'}`)
      }
    }
    setSubmitProgress(null)

    // Count file uploads
    const totalFiles = rows.reduce((sum, row) => {
      let n = row.files.length
      if (row.isUnforeseen) {
        if (row.expenses) n += row.expenses.reduce((s, e) => s + (e.documentFiles?.length || 0), 0)
        if (row.incomes) n += row.incomes.reduce((s, i) => s + (i.documentFiles?.length || 0), 0)
      }
      return sum + n
    }, 0)
    const fileUploadErrors = results.errors.filter(err => err.includes('מסמכים') || err.includes('קובץ'))
    
    if (results.failed > 0 || fileUploadErrors.length > 0) {
      const remainingRows = rows.filter((_, idx) => !succeededRowIndices.has(idx))
      if (succeededRowIndices.size > 0) {
        onSuccess()
        setRows(remainingRows)
      }
      // כשעסקה אחת או יותר נכשלות – שומרים אוטומטית את כל השורות שלא הצליחו כטיוטה יחד עם המסמכים
      let draftMessage = ''
      if (remainingRows.length > 0) {
        const draftResult = await saveRowsAsDraftAuto(remainingRows)
        if (draftResult.saved && draftResult.draftName) {
          draftMessage = `\n\nהשורות שנכשלו נשמרו אוטומטית כטיוטה "${draftResult.draftName}". תוכל לטעון מ"טען טיוטה" לתקן ולשלוח שוב.`
        } else if (draftResult.error) {
          draftMessage = `\n\nשמירת טיוטה אוטומטית נכשלה: ${draftResult.error}. השורות נשארו בטופס.`
        }
      }
      const errorMessages = [
        results.success > 0 ? `נוצרו ${results.success} עסקאות בהצלחה` : '',
        results.failed > 0 ? `${results.failed} עסקאות נכשלו` : '',
        fileUploadErrors.length > 0 ? `${fileUploadErrors.length} שגיאות בהעלאת מסמכים` : ''
      ].filter(Boolean).join(', ')
      setError(
        `${errorMessages}:\n${results.errors.join('\n')}${draftMessage}`
      )
    } else {
      // All succeeded - calculate totals
      const regularRows = rows.filter(r => !r.isUnforeseen)
      const unforeseenRows = rows.filter(r => r.isUnforeseen)
      const incomeRows = regularRows.filter(r => r.type === 'Income')
      const expenseRows = regularRows.filter(r => r.type === 'Expense')
      const totalIncome = incomeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      const totalExpense = expenseRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      
      let successMessage = `נוצרו ${results.success} עסקאות בהצלחה!\n\nסיכום:\n`
      if (regularRows.length > 0) {
        successMessage += `• ${incomeRows.length} עסקאות הכנסה: ${totalIncome.toLocaleString('he-IL')} ₪\n• ${expenseRows.length} עסקאות הוצאה: ${totalExpense.toLocaleString('he-IL')} ₪\n`
      }
      if (unforeseenRows.length > 0) {
        successMessage += `• ${unforeseenRows.length} עסקאות לא צפויות\n`
      }
      if (totalFiles > 0) {
        successMessage += `• הועלו ${totalFiles} מסמכים`
      }
      
      // Show success message briefly before closing
      setError(null)
      alert(successMessage)
      onSuccess()
      onClose()
      resetForm()
    }

    setLoading(false)
  }

  const resetForm = () => {
    setRows([
      {
        id: '1',
        projectId: '',
        subprojectId: '',
        type: 'Expense',
        txDate: new Date().toISOString().split('T')[0],
        amount: '',
        description: '',
        categoryId: '',
        supplierId: '',
        paymentMethod: '',
        notes: '',
        isExceptional: false,
        fromFund: false,
        files: [],
        dateError: null,
        duplicateError: null,
        checkingDuplicate: false,
        period_start_date: '',
        period_end_date: '',
        periodError: null,
        isUnforeseen: false,
        incomes: [{ amount: '', description: '', documentFiles: [] }],
        expenses: [{ amount: '', description: '', documentFiles: [] }],
        contractPeriodId: ''
      }
    ])
    setError(null)
    setCurrentDraftId(null)
    setCurrentDraftName('')
  }

  const handleClose = () => {
    onClose()
    resetForm()
    setShowLoadDraft(false)
    setShowSaveDraftModal(false)
  }

  /** Serialize row for draft (no File objects). */
  const serializeRowForDraft = (row: TransactionRow): Record<string, unknown> => ({
    projectId: row.projectId,
    subprojectId: row.subprojectId,
    type: row.type,
    txDate: row.txDate,
    amount: row.amount,
    description: row.description,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    isExceptional: row.isExceptional,
    fromFund: row.fromFund,
    period_start_date: row.period_start_date,
    period_end_date: row.period_end_date,
    isUnforeseen: row.isUnforeseen,
    unforeseenStatus: row.unforeseenStatus ?? 'draft',
    contractPeriodId: row.contractPeriodId,
    incomes: (row.incomes || []).map(inc => ({ amount: inc.amount, description: inc.description })),
    expenses: (row.expenses || []).map(exp => ({ amount: exp.amount, description: exp.description }))
  })

  /** Save given rows as a new draft with all their documents (e.g. after partial submit failure). */
  const saveRowsAsDraftAuto = async (
    rowsToSave: TransactionRow[]
  ): Promise<{ saved: boolean; draftName?: string; error?: string }> => {
    const validRows = rowsToSave.filter(r => r.projectId)
    if (validRows.length === 0) return { saved: false, error: 'אין שורות עם פרויקט' }
    const draftName = `טיוטה אוטומטית - ${new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`
    try {
      const rowsPayload = validRows.map(serializeRowForDraft)
      const draft = await GroupTransactionDraftAPI.create({ name: draftName, rows: rowsPayload })
      const draftDocErrors: string[] = []
      for (let rowIndex = 0; rowIndex < validRows.length; rowIndex++) {
        const row = validRows[rowIndex]
        if (!row.isUnforeseen) {
          for (const file of row.files || []) {
            try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'main') } catch (err: any) { draftDocErrors.push(file.name) }
          }
        } else {
          for (let j = 0; j < (row.incomes?.length || 0); j++) {
            const files = row.incomes![j].documentFiles || []
            for (const file of files) {
              try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'income', j) } catch (err: any) { draftDocErrors.push(file.name) }
            }
          }
          for (let j = 0; j < (row.expenses?.length || 0); j++) {
            const files = row.expenses![j].documentFiles || []
            for (const file of files) {
              try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'expense', j) } catch (err: any) { draftDocErrors.push(file.name) }
            }
          }
        }
      }
      const docWarning = draftDocErrors.length > 0
        ? ` (שים לב: ${draftDocErrors.length} מסמכים לא נשמרו: ${draftDocErrors.join(', ')})`
        : ''
      return { saved: true, draftName: draftName + docWarning }
    } catch (err: any) {
      return { saved: false, error: err.response?.data?.detail || err.message || 'שגיאה' }
    }
  }

  const openSaveDraftModal = () => {
    const validRows = rows.filter(r => r.projectId)
    if (validRows.length === 0) {
      setError('יש להוסיף לפחות שורה אחת עם פרויקט כדי לשמור כטיוטה')
      return
    }
    setError(null)
    setDraftName(currentDraftId ? currentDraftName : '')
    setShowSaveDraftModal(true)
  }

  const saveAsDraft = async () => {
    const nameTrimmed = draftName.trim()
    if (!currentDraftId && !nameTrimmed) {
      setError('יש להזין שם לטיוטה')
      return
    }
    const validRows = rows.filter(r => r.projectId)
    if (validRows.length === 0) {
      setError('יש להוסיף לפחות שורה אחת עם פרויקט כדי לשמור כטיוטה')
      return
    }
    setSavingDraft(true)
    setError(null)
    try {
      const rowsPayload = validRows.map(serializeRowForDraft)
      const draftId = currentDraftId
      let draft: GroupTransactionDraftOut
      if (draftId) {
        draft = await GroupTransactionDraftAPI.update(draftId, { rows: rowsPayload })
      } else {
        draft = await GroupTransactionDraftAPI.create({ name: nameTrimmed, rows: rowsPayload })
      }
      const draftDocErrors: string[] = []
      for (let rowIndex = 0; rowIndex < validRows.length; rowIndex++) {
        const row = validRows[rowIndex]
        if (!row.isUnforeseen) {
          for (const file of row.files || []) {
            try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'main') } catch (err: any) { draftDocErrors.push(file.name) }
          }
        } else {
          for (let j = 0; j < (row.incomes?.length || 0); j++) {
            const files = row.incomes![j].documentFiles || []
            for (const file of files) {
              try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'income', j) } catch (err: any) { draftDocErrors.push(file.name) }
            }
          }
          for (let j = 0; j < (row.expenses?.length || 0); j++) {
            const files = row.expenses![j].documentFiles || []
            for (const file of files) {
              try { await GroupTransactionDraftAPI.uploadDocument(draft.id, file, rowIndex, 'expense', j) } catch (err: any) { draftDocErrors.push(file.name) }
            }
          }
        }
      }
      const docWarning = draftDocErrors.length > 0
        ? `\n\nשים לב: ${draftDocErrors.length} מסמכים לא נשמרו בטיוטה: ${draftDocErrors.join(', ')}`
        : ''
      setShowSaveDraftModal(false)
      setDraftName('')
      if (draftId) {
        setCurrentDraftId(draft.id)
        setCurrentDraftName(draft.name || `טיוטה ${draft.id}`)
        alert(`הטיוטה "${draft.name || nameTrimmed}" עודכנה (${validRows.length} עסקאות).${docWarning}`)
      } else {
        setCurrentDraftId(draft.id)
        setCurrentDraftName(draft.name || nameTrimmed)
        alert(`נשמר כטיוטה "${nameTrimmed}" (${validRows.length} עסקאות). תוכל לטעון את הטיוטה מ"טען טיוטה".${docWarning}`)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בשמירת טיוטה')
    } finally {
      setSavingDraft(false)
    }
  }

  const loadDraftsList = async () => {
    try {
      const list = await GroupTransactionDraftAPI.list()
      setDraftsList(list)
      setShowLoadDraft(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת רשימת טיוטות')
    }
  }

  const confirmDeleteDraft = async () => {
    if (!draftToDelete) return
    try {
      setDeletingDraft(true)
      await GroupTransactionDraftAPI.delete(draftToDelete.id)
      setDraftsList(prev => prev.filter(x => x.id !== draftToDelete.id))
      setDraftToDelete(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת טיוטה')
    } finally {
      setDeletingDraft(false)
    }
  }

  const loadDraft = async (draft: GroupTransactionDraftOut) => {
    const defaultRow = (idx: number): TransactionRow => ({
      id: idx === 0 ? '1' : `draft-${Date.now()}-${idx}`,
      projectId: '',
      subprojectId: '',
      type: 'Expense',
      txDate: new Date().toISOString().split('T')[0],
      amount: '',
      description: '',
      categoryId: '',
      supplierId: '',
      paymentMethod: '',
      notes: '',
      isExceptional: false,
      fromFund: false,
      files: [],
      dateError: null,
      duplicateError: null,
      checkingDuplicate: false,
      period_start_date: '',
      period_end_date: '',
      periodError: null,
      isUnforeseen: false,
      unforeseenStatus: 'draft',
      incomes: [{ amount: '', description: '', documentFiles: [] }],
      expenses: [{ amount: '', description: '', documentFiles: [] }],
      contractPeriodId: ''
    })
    const loaded: TransactionRow[] = (draft.rows || []).map((r: any, idx: number) => {
      const base = defaultRow(idx)
      return {
        ...base,
        id: base.id,
        projectId: r.projectId ?? base.projectId,
        subprojectId: r.subprojectId ?? base.subprojectId,
        type: r.type ?? base.type,
        txDate: normalizeDateForInput(r.txDate) || base.txDate,
        amount: r.amount ?? base.amount,
        description: r.description ?? base.description,
        categoryId: r.categoryId ?? base.categoryId,
        supplierId: r.supplierId ?? base.supplierId,
        paymentMethod: r.paymentMethod ?? base.paymentMethod,
        notes: r.notes ?? base.notes,
        isExceptional: r.isExceptional ?? base.isExceptional,
        fromFund: r.fromFund ?? base.fromFund,
        period_start_date: normalizeDateForInput(r.period_start_date) || base.period_start_date,
        period_end_date: normalizeDateForInput(r.period_end_date) || base.period_end_date,
        isUnforeseen: r.isUnforeseen ?? base.isUnforeseen,
        unforeseenStatus: (r.unforeseenStatus ?? base.unforeseenStatus) as TransactionRow['unforeseenStatus'],
        contractPeriodId: r.contractPeriodId ?? base.contractPeriodId,
        incomes: Array.isArray(r.incomes) && r.incomes.length > 0
          ? r.incomes.map((inc: any) => ({ amount: inc.amount ?? '', description: inc.description ?? '', documentFiles: [] as File[] }))
          : base.incomes!,
        expenses: Array.isArray(r.expenses) && r.expenses.length > 0
          ? r.expenses.map((exp: any) => ({ amount: exp.amount ?? '', description: exp.description ?? '', documentFiles: [] as File[] }))
          : base.expenses!
      }
    })
    const docs = draft.documents || []
    for (const doc of docs) {
      try {
        const blob = await GroupTransactionDraftAPI.downloadDocument(draft.id, doc.id)
        const file = new File([blob], doc.original_filename, { type: blob.type || 'application/octet-stream' })
        if (doc.row_index < 0 || doc.row_index >= loaded.length) continue
        const row = loaded[doc.row_index]
        if (doc.sub_type === 'income' && doc.sub_index != null && row.incomes && row.incomes[doc.sub_index]) {
          row.incomes[doc.sub_index].documentFiles = row.incomes[doc.sub_index].documentFiles || []
          row.incomes[doc.sub_index].documentFiles!.push(file)
        } else if (doc.sub_type === 'expense' && doc.sub_index != null && row.expenses && row.expenses[doc.sub_index]) {
          row.expenses[doc.sub_index].documentFiles = row.expenses[doc.sub_index].documentFiles || []
          row.expenses[doc.sub_index].documentFiles!.push(file)
        } else {
          row.files = row.files || []
          row.files.push(file)
        }
      } catch (_) {
        // skip failed document
      }
    }
    setRows(loaded.length > 0 ? loaded : [defaultRow(0)])
    setCurrentDraftId(draft.id)
    setCurrentDraftName(draft.name || `טיוטה ${draft.id}`)
    setShowLoadDraft(false)
    setError(null)
  }

  const openTextEditor = (rowId: string, field: 'description' | 'notes', currentValue: string) => {
    setEditingRowId(rowId)
    setEditingField(field)
    setEditorValue(currentValue)
    setTextEditorOpen(true)
  }

  const closeTextEditor = () => {
    if (editingRowId && editingField) {
      updateRow(editingRowId, editingField, editorValue)
    }
    setTextEditorOpen(false)
    setEditingRowId(null)
    setEditingField(null)
    setEditorValue('')
  }

  const saveAndCloseTextEditor = () => {
    if (editingRowId && editingField) {
      updateRow(editingRowId, editingField, editorValue)
    }
    setTextEditorOpen(false)
    setEditingRowId(null)
    setEditingField(null)
    setEditorValue('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black bg-opacity-60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[96vw] max-w-[96vw] h-[95vh] max-h-[95vh] flex flex-col border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-orange-500 to-red-600 dark:from-orange-600 dark:to-red-700 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>עסקה קבוצתית</span>
              <span className="text-lg font-normal opacity-90">({rows.length} עסקאות)</span>
            </h2>
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={loadDraftsList}
                className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
              >
                טען טיוטה
              </button>
              {showLoadDraft && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
                  {draftsList.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">אין טיוטות שמורות</div>
                  ) : (
                    draftsList.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm group"
                      >
                        <button
                          type="button"
                          onClick={() => loadDraft(d)}
                          className="flex-1 min-w-0 text-right"
                        >
                          {d.name || `טיוטה ${d.id}`} ({Array.isArray(d.rows) ? d.rows.length : 0} שורות)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDraftToDelete(d)
                          }}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                          title="מחק טיוטה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setShowLoadDraft(false)}
                    className="w-full text-right px-4 py-2 border-t border-gray-200 dark:border-gray-600 text-gray-500 text-sm"
                  >
                    סגור
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-gray-50 dark:bg-gray-900/50">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg shadow-sm"
            >
              <pre className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap font-medium">{error}</pre>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 space-y-3">
            <div className="flex-1 min-h-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-auto min-w-0" title="גלול אופקית לראות את כל השדות">
              <table className="w-full border-collapse table-fixed min-w-[1350px]">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700/70 text-right text-xs font-medium text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600">
                    <th className="px-2 py-2 w-[5%] min-w-[70px]">סוג עסקה</th>
                    {rows.some(r => r.isUnforeseen) && <th className="px-2 py-2 w-[7%]">סטטוס</th>}
                    <th className="px-2 py-2 w-[9%]">פרויקט</th>
                    <th className="px-2 py-2 w-[8%]">תת-פרויקט</th>
                    <th className="px-2 py-2 w-[7%]">תקופה/סוג</th>
                    <th className="px-2 py-2 w-[12%]">תאריך</th>
                    <th className="px-2 py-2 w-[7%]">סכום</th>
                    <th className="px-2 py-2 w-[11%]">תיאור</th>
                    <th className="px-2 py-2 w-[9%]">קטגוריה</th>
                    <th className="px-2 py-2 w-[8%] min-w-[100px]">ספק</th>
                    <th className="px-2 py-2 w-[9%] min-w-[115px]">אמצעי תשלום</th>
                    <th className="px-2 py-2 w-[8%]">הערות</th>
                    {rows.length > 1 && <th className="px-2 py-2 w-[4%]">פעולות</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const selectedProject = getSelectedProject(row)
                    const isParentProject = selectedProject?.is_parent_project
                    const subprojects = isParentProject && row.projectId
                      ? getSubprojectsForProject(row.projectId as number)
                      : []
                    const contractPeriods = row.projectId ? (contractPeriodsMap[row.projectId as number] || []) : []

                    const rowBgClass = index % 2 === 0 
                      ? 'bg-white dark:bg-gray-800' 
                      : 'bg-gray-50/50 dark:bg-gray-800/50'

                    if (row.isUnforeseen) {
                      const contractPeriods = row.projectId ? (contractPeriodsMap[row.projectId as number] || []) : []
                      const subprojects = isParentProject && row.projectId ? getSubprojectsForProject(row.projectId as number) : []

                      return (
                        <React.Fragment key={row.id}>
                          <tr className={`transition-colors ${rowBgClass} hover:bg-blue-50 dark:hover:bg-gray-700/70 ${index === 0 ? 'border-t-2' : 'border-t-4'} border-gray-400 dark:border-gray-500`}>
                            <td className="px-2 py-2 align-middle">
                              <select value={row.isUnforeseen ? 'unforeseen' : 'regular'} onChange={(e) => setRowUnforeseen(row.id, e.target.value === 'unforeseen')} className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium h-[38px]">
                                <option value="regular">רגילה</option>
                                <option value="unforeseen">לא צפויה</option>
                              </select>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <select value={row.unforeseenStatus ?? 'draft'} onChange={(e) => updateRow(row.id, 'unforeseenStatus', e.target.value as 'draft' | 'waiting_for_approval' | 'executed')} className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium h-[38px]" title="סטטוס לעסקה לא צפויה">
                                <option value="draft">טיוטה</option>
                                <option value="waiting_for_approval">מחכה לאישור</option>
                                <option value="executed">אשר כבוצע</option>
                              </select>
                            </td>
                            <td className="px-2 py-2 align-middle"><select value={row.projectId} onChange={(e) => handleProjectChange(row.id, e.target.value ? Number(e.target.value) : '')} className="w-full min-w-[7rem] px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]" required><option value="">בחר פרויקט</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                            <td className="px-2 py-2 align-middle">
                              {isParentProject ? (
                                <select value={row.subprojectId} onChange={(e) => updateRow(row.id, 'subprojectId', e.target.value ? Number(e.target.value) : '')} className="w-full min-w-[7rem] px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]" required><option value="">בחר תת-פרויקט</option>{subprojects.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</select>
                              ) : <span className="text-xs text-gray-400 leading-[38px] block">-</span>}
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <select value={row.contractPeriodId} onChange={(e) => updateRow(row.id, 'contractPeriodId', e.target.value ? Number(e.target.value) : '')} className="w-full min-w-[7.5rem] px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]">
                                <option value="">כל התקופות</option>
                                {contractPeriods.map((period) => <option key={period.period_id} value={period.period_id}>{period.year_label}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <input type="date" value={normalizeDateForInput(row.txDate) || new Date().toISOString().split('T')[0]} onChange={(e) => updateRow(row.id, 'txDate', e.target.value || new Date().toISOString().split('T')[0])} className={`w-full min-w-[140px] px-2 py-2 text-sm bg-white dark:bg-gray-700 border rounded-lg focus:outline-none focus:ring-2 h-[38px] ${row.dateError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`} required />
                              {row.dateError && <p className="text-[10px] text-red-600 mt-0.5">{row.dateError}</p>}
                            </td>
                            <td className="px-2 py-2 align-middle text-center text-gray-400 dark:text-gray-500 text-sm">—</td>
                            <td className="px-2 py-2 align-middle"><input type="text" readOnly onClick={() => openTextEditor(row.id, 'description', row.description)} value={row.description} className="w-full px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]" placeholder="תיאור" /></td>
                            <td className="px-2 py-2 align-middle"><input type="text" readOnly onClick={() => openTextEditor(row.id, 'notes', row.notes)} value={row.notes} className="w-full px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]" placeholder="הערות" /></td>
                            {rows.length > 1 && (
                            <td className="px-2 py-2 align-middle w-[90px] max-w-[90px]">
                              <button type="button" onClick={() => removeRow(row.id)} className="p-1 text-red-500 hover:bg-red-500 hover:text-white rounded" title="מחק שורה"><Trash2 className="w-4 h-4" /></button>
                            </td>
                            )}
                          </tr>
                          <tr className={`${rowBgClass} border-b-4 border-gray-400 dark:border-gray-500`}>
                            <td colSpan={rows.length > 1 ? 10 : 9} className="px-3 py-2">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-2 p-3 rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-green-700 dark:text-green-400">הכנסות</span>
                                    <button type="button" onClick={() => handleAddIncome(row.id)} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-600 text-white rounded hover:bg-green-700"><Plus className="w-3 h-3" /> הוסף הכנסה</button>
                                  </div>
                                  {(row.incomes || []).map((income, incIdx) => (
                                    <div key={incIdx} className="flex items-center gap-2 flex-wrap">
                                      <input type="number" step="0.01" min="0" placeholder="סכום" value={income.amount} onChange={(e) => handleIncomeChange(row.id, incIdx, 'amount', e.target.value ? Number(e.target.value) : '')} className="w-20 px-2 py-1.5 text-xs border border-green-200 dark:border-green-800 rounded bg-white dark:bg-gray-700 font-semibold" />
                                      <input type="text" placeholder="תיאור" value={income.description} onChange={(e) => handleIncomeChange(row.id, incIdx, 'description', e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-green-200 dark:border-green-800 rounded bg-white dark:bg-gray-700" />
                                      <label className="cursor-pointer">
                                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleIncomeFileUpload(row.id, incIdx, e.target.files)} id={`inc-f-${row.id}-${incIdx}`} />
                                        <span className={`inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border ${(income.documentFiles?.length || 0) > 0 ? 'bg-green-100 dark:bg-green-900/30 border-green-300 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'}`}>
                                          <Upload className="w-3.5 h-3.5" />{(income.documentFiles?.length || 0) > 0 ? income.documentFiles!.length : ''}
                                        </span>
                                      </label>
                                      {(income.documentFiles || []).map((f, fi) => (
                                        <span key={fi} className="flex items-center gap-1 text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border truncate max-w-[80px]">
                                          <span className="truncate">{f.name}</span>
                                          <button type="button" onClick={() => handleRemoveIncomeFile(row.id, incIdx, fi)} className="text-red-500"><X className="w-3 h-3" /></button>
                                        </span>
                                      ))}
                                      {(row.incomes || []).length > 1 && <button type="button" onClick={() => handleRemoveIncome(row.id, incIdx)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-2 p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-red-700 dark:text-red-400">הוצאות</span>
                                    <button type="button" onClick={() => handleAddExpense(row.id)} className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600 text-white rounded hover:bg-red-700"><Plus className="w-3 h-3" /> הוסף הוצאה</button>
                                  </div>
                                  {(row.expenses || []).map((expense, expIdx) => (
                                    <div key={expIdx} className="flex items-center gap-2 flex-wrap">
                                      <input type="number" step="0.01" min="0" placeholder="סכום" value={expense.amount} onChange={(e) => handleExpenseChange(row.id, expIdx, 'amount', e.target.value ? Number(e.target.value) : '')} className="w-20 px-2 py-1.5 text-xs border border-red-200 dark:border-red-800 rounded bg-white dark:bg-gray-700 font-semibold" />
                                      <input type="text" placeholder="תיאור" value={expense.description} onChange={(e) => handleExpenseChange(row.id, expIdx, 'description', e.target.value)} className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-red-200 dark:border-red-800 rounded bg-white dark:bg-gray-700" />
                                      <label className="cursor-pointer">
                                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleExpenseFileUpload(row.id, expIdx, e.target.files)} id={`exp-f-${row.id}-${expIdx}`} />
                                        <span className={`inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border ${(expense.documentFiles?.length || 0) > 0 ? 'bg-red-100 dark:bg-red-900/30 border-red-300 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'}`}>
                                          <Upload className="w-3.5 h-3.5" />{(expense.documentFiles?.length || 0) > 0 ? expense.documentFiles!.length : ''}
                                        </span>
                                      </label>
                                      {(expense.documentFiles || []).map((f, fi) => (
                                        <span key={fi} className="flex items-center gap-1 text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border truncate max-w-[80px]">
                                          <span className="truncate">{f.name}</span>
                                          <button type="button" onClick={() => handleRemoveExpenseFile(row.id, expIdx, fi)} className="text-red-500"><X className="w-3 h-3" /></button>
                                        </span>
                                      ))}
                                      {(row.expenses || []).length > 1 && <button type="button" onClick={() => handleRemoveExpense(row.id, expIdx)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {index < rows.length - 1 && (
                            <tr>
                              <td colSpan={10} className="h-4 bg-gray-100 dark:bg-gray-900 border-0 p-0"></td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    }

                    // Regular transaction row – עיצוב משופר
                    return (
                      <React.Fragment key={row.id}>
                        {/* שורה ראשונה – פרטים עיקריים */}
                        <tr 
                          className={`transition-colors ${rowBgClass} hover:bg-blue-50/50 dark:hover:bg-gray-700/50 ${index === 0 ? 'border-t-2' : 'border-t-4'} border-gray-400 dark:border-gray-500`}
                        >
                          <td className="px-2 py-2 align-middle">
                            <select value={row.isUnforeseen ? 'unforeseen' : 'regular'} onChange={(e) => setRowUnforeseen(row.id, e.target.value === 'unforeseen')} className="w-full min-w-0 px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium h-[40px] shadow-sm">
                              <option value="regular">רגילה</option>
                              <option value="unforeseen">לא צפויה</option>
                            </select>
                          </td>
                          {rows.some(r => r.isUnforeseen) && <td className="px-2 py-2 align-middle text-center text-gray-400 dark:text-gray-500 text-sm">—</td>}
                          <td className="px-2 py-2 align-middle">
                            <select
                              value={row.projectId}
                              onChange={(e) => handleProjectChange(row.id, e.target.value ? Number(e.target.value) : '')}
                              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-[40px] shadow-sm"
                              required
                            >
                              <option value="">בחר פרויקט</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            {isParentProject ? (
                              <select
                                value={row.subprojectId}
                                onChange={(e) => updateRow(row.id, 'subprojectId', e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-[40px] shadow-sm"
                                required
                              >
                                <option value="">בחר תת-פרויקט</option>
                                {subprojects.map((subproject) => (
                                  <option key={subproject.id} value={subproject.id}>
                                    {subproject.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center h-[40px]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <select
                              value={row.type}
                              onChange={(e) => {
                                const newType = e.target.value as 'Income' | 'Expense'
                                updateRow(row.id, 'type', newType)
                                if (newType === 'Income') {
                                  updateRow(row.id, 'supplierId', '')
                                }
                              }}
                              className={`w-full min-w-[90px] px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] font-semibold shadow-sm ${
                                row.type === 'Income' 
                                  ? 'bg-green-50 dark:bg-green-900/25 border-green-400 dark:border-green-600 text-green-800 dark:text-green-200' 
                                  : 'bg-red-50 dark:bg-red-900/25 border-red-400 dark:border-red-600 text-red-800 dark:text-red-200'
                              }`}
                              required
                            >
                              <option value="Income">הכנסה</option>
                              <option value="Expense">הוצאה</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <div className="min-w-0 w-full space-y-1">
                              {(row.period_start_date && row.period_end_date) ? (
                                <div className="flex flex-row items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full shrink-0">
                                    📅 תאריכית
                                  </span>
                                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 shrink-0">מ:</span>
                                  <input
                                    type="date"
                                    value={normalizeDateForInput(row.period_start_date) || new Date().toISOString().split('T')[0]}
                                    onChange={(e) => updateRow(row.id, 'period_start_date', e.target.value || new Date().toISOString().split('T')[0])}
                                    title="מתאריך"
                                    className={`px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border rounded focus:outline-none focus:ring-2 h-[36px] shadow-sm shrink-0 ${row.periodError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
                                  />
                                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 shrink-0">עד:</span>
                                  <input
                                    type="date"
                                    value={normalizeDateForInput(row.period_end_date) || new Date().toISOString().split('T')[0]}
                                    onChange={(e) => updateRow(row.id, 'period_end_date', e.target.value || new Date().toISOString().split('T')[0])}
                                    title="עד תאריך"
                                    className={`px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border rounded focus:outline-none focus:ring-2 h-[36px] shadow-sm shrink-0 ${row.periodError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'}`}
                                  />
                                  <button type="button" onClick={() => { updateRow(row.id, 'period_start_date', ''); updateRow(row.id, 'period_end_date', '') }} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline shrink-0">בודד</button>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <input
                                    type="date"
                                    value={normalizeDateForInput(row.txDate) || new Date().toISOString().split('T')[0]}
                                    onChange={(e) => updateRow(row.id, 'txDate', e.target.value || new Date().toISOString().split('T')[0])}
                                    className={`w-full min-w-[140px] px-2 py-2 text-sm bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 h-[40px] shadow-sm ${
                                      row.dateError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                                    }`}
                                    required
                                  />
                                  <button type="button" title="עסקה תאריכית (מתאריך–עד תאריך)" onClick={() => { const d = normalizeDateForInput(row.txDate) || new Date().toISOString().split('T')[0]; updateRow(row.id, 'period_start_date', d); updateRow(row.id, 'period_end_date', d) }} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline block w-full text-right">מתאריך–עד תאריך</button>
                                </div>
                              )}
                              {row.dateError && <p className="text-[10px] text-red-600 dark:text-red-400">{row.dateError}</p>}
                              {row.periodError && <p className="text-[10px] text-red-600 dark:text-red-400">{row.periodError}</p>}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.amount}
                                onChange={(e) => updateRow(row.id, 'amount', e.target.value ? Number(e.target.value) : '')}
                                className={`w-full min-w-[90px] px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-700/80 border-2 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold h-[40px] shadow-sm ${
                                  row.duplicateError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600'
                                } ${row.amount ? (row.type === 'Income' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300') : ''}`}
                                placeholder="0.00"
                                required
                              />
                              {row.checkingDuplicate && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2">
                                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                                </div>
                              )}
                            </div>
                            {row.duplicateError && (
                              <div className="p-2 mt-1.5 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg text-[11px]">
                                <pre className="text-red-800 dark:text-red-200 whitespace-pre-wrap font-medium">{row.duplicateError}</pre>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <input
                              type="text"
                              readOnly
                              onClick={() => openTextEditor(row.id, 'description', row.description)}
                              value={row.description}
                              className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] cursor-pointer shadow-sm"
                              placeholder="תיאור העסקה"
                              title="תיאור העסקה"
                            />
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <select
                              value={row.categoryId}
                              onChange={(e) => updateRow(row.id, 'categoryId', e.target.value ? Number(e.target.value) : '')}
                              className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] shadow-sm"
                              title="בחר קטגוריה"
                            >
                              <option value="">בחר קטגוריה</option>
                              {availableCategories.map((category) => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            {row.type === 'Expense' && !row.fromFund ? (
                              <select
                                value={row.supplierId}
                                onChange={(e) => updateRow(row.id, 'supplierId', e.target.value ? Number(e.target.value) : '')}
                                className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!row.categoryId}
                                title={row.categoryId ? 'בחר ספק' : 'בחר קודם קטגוריה'}
                              >
                                <option value="">{row.categoryId ? 'בחר ספק' : 'בחר קודם קטגוריה'}</option>
                                {(() => {
                                  const selectedCategory = availableCategories.find(c => c.id === row.categoryId)
                                  if (!selectedCategory) return <option value="" disabled>בחר קודם קטגוריה</option>
                                  if (suppliersLoading) return <option value="" disabled>טוען ספקים...</option>
                                  const filteredSuppliers = suppliers.filter(s => s.is_active !== false && s.category_id === selectedCategory.id)
                                  if (filteredSuppliers.length === 0) return <option value="" disabled>אין ספקים</option>
                                  return filteredSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                                })()}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 flex items-center h-[40px]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <select
                              value={row.paymentMethod}
                              onChange={(e) => updateRow(row.id, 'paymentMethod', e.target.value)}
                              className="w-full min-w-0 px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] shadow-sm"
                              title="בחר אמצעי תשלום"
                            >
                              <option value="">בחר אמצעי תשלום</option>
                              <option value="הוראת קבע">הוראת קבע</option>
                              <option value="אשראי">אשראי</option>
                              <option value="שיק">שיק</option>
                              <option value="מזומן">מזומן</option>
                              <option value="העברה בנקאית">העברה בנקאית</option>
                              <option value="גבייה מרוכזת סוף שנה">גבייה מרוכזת סוף שנה</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                readOnly
                                onClick={() => openTextEditor(row.id, 'notes', row.notes)}
                                value={row.notes}
                                className="flex-1 min-w-[60px] px-2 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[40px] cursor-pointer shadow-sm"
                                placeholder="הערות"
                                title="הערות"
                              />
                              {row.type === 'Expense' && hasFundForRow(row) && (
                                <label className="flex items-center gap-1.5 text-sm cursor-pointer shrink-0">
                                  <input type="checkbox" checked={row.fromFund} onChange={(e) => { const fromFund = e.target.checked; updateRow(row.id, 'fromFund', fromFund); if (fromFund) updateRow(row.id, 'supplierId', '') }} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer" />
                                  <span className="text-gray-700 dark:text-gray-300 text-xs whitespace-nowrap">קופה</span>
                                </label>
                              )}
                              <label className="cursor-pointer shrink-0">
                                <input type="file" multiple onChange={(e) => handleFileUpload(row.id, e.target.files)} className="hidden" id={`file-upload-${row.id}`} />
                                <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => document.getElementById(`file-upload-${row.id}`)?.click()} className="p-1.5 text-blue-500 hover:text-white hover:bg-blue-500 rounded transition-all" title="הוסף מסמכים"><Upload className="w-3.5 h-3.5" /></motion.button>
                              </label>
                              {row.files.length > 0 && <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{row.files.length}</span>}
                            </div>
                          </td>
                          {rows.length > 1 && (
                          <td className="px-2 py-2 align-middle">
                            <button type="button" onClick={() => removeRow(row.id)} className="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded transition-all" title="מחק שורה"><Trash2 className="w-4 h-4" /></button>
                          </td>
                          )}
                        </tr>
                        {/* רשימת קבצים מצורפים – רק כשקיימים קבצים */}
                        {row.files.length > 0 && (
                        <tr className={`${rowBgClass} border-b border-gray-200 dark:border-gray-600`}>
                          <td colSpan={15} className="px-2 py-1">
                            <div className="flex flex-wrap gap-2">
                              {row.files.map((file, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                  <File className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[120px]">{file.name}</span>
                                  <button type="button" onClick={() => removeFile(row.id, idx)} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                        )}
                        {/* רווח בין עסקאות */}
                        {index < rows.length - 1 && (
                          <tr>
                            <td colSpan={15} className="h-2 bg-gray-100 dark:bg-gray-900 border-0 p-0"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* סיכום כספי גלובלי – שורה אחת קומפקטית */}
            {(() => {
              let totalIncome = 0
              let totalExpense = 0
              rows.forEach(row => {
                if (row.isUnforeseen) {
                  totalIncome += (row.incomes || []).reduce((s, i) => s + (Number(i.amount) || 0), 0)
                  totalExpense += (row.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
                } else {
                  if (row.type === 'Income') totalIncome += Number(row.amount) || 0
                  else totalExpense += Number(row.amount) || 0
                }
              })
              const balance = totalIncome - totalExpense
              return (
                <div className="mt-1 flex items-center justify-end gap-4 py-1.5 px-3 rounded-lg bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">סה"כ הכנסות: <strong className="text-green-600 dark:text-green-400">₪{totalIncome.toLocaleString('he-IL')}</strong></span>
                  <span className="text-gray-600 dark:text-gray-400">סה"כ הוצאות: <strong className="text-red-600 dark:text-red-400">₪{totalExpense.toLocaleString('he-IL')}</strong></span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">יתרה: <strong className={balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>₪{balance.toLocaleString('he-IL')}</strong></span>
                </div>
              )
            })()}

            <div className="flex justify-between items-center pt-1">
              <motion.button
                type="button"
                onClick={addRow}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Plus className="w-5 h-5" />
                הוסף שורה
              </motion.button>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                סה"כ {rows.length} {rows.length === 1 ? 'עסקה' : 'עסקאות'}
              </div>
            </div>
          </form>
        </div>

        {/* Text Editor Modal for Description/Notes */}
        {textEditorOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {editingField === 'description' ? 'תיאור העסקה' : 'הערות'}
                </h3>
                <button
                  onClick={closeTextEditor}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <textarea
                  value={editorValue}
                  onChange={(e) => setEditorValue(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm resize-none"
                  rows={8}
                  placeholder={editingField === 'description' ? 'הזן תיאור מפורט של העסקה...' : 'הזן הערות...'}
                  autoFocus
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeTextEditor}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow font-medium"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={saveAndCloseTextEditor}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium"
                >
                  שמור
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl shrink-0">
          <motion.button
            type="button"
            onClick={openSaveDraftModal}
            disabled={rows.every(r => !r.projectId)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            שמור כטיוטה
          </motion.button>
          <motion.button
            type="button"
            onClick={handleClose}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm hover:shadow font-medium"
          >
            ביטול
          </motion.button>
          <motion.button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={loading}
            whileHover={!loading ? { scale: 1.05 } : {}}
            whileTap={!loading ? { scale: 0.95 } : {}}
            className="px-8 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium disabled:hover:shadow-md"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                {submitProgress
                  ? `מעבד ${submitProgress.done} מתוך ${submitProgress.total}...`
                  : 'יוצר עסקאות...'}
              </span>
            ) : (
              `צור ${rows.length} עסקאות`
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* מודל שם ותיאור לטיוטה */}
      {showSaveDraftModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 rounded-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {currentDraftId ? 'עדכון טיוטה' : 'שמירת טיוטה'}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם הטיוטה</label>
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                placeholder="למשל: עסקאות חודש ינואר"
                disabled={!!currentDraftId}
                readOnly={!!currentDraftId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-70 disabled:cursor-not-allowed"
                autoFocus={!currentDraftId}
              />
              {currentDraftId && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">שם הטיוטה לא ניתן לשינוי לאחר שמירה.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => { setShowSaveDraftModal(false); setDraftName('') }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveAsDraft}
                disabled={savingDraft || (!currentDraftId && !draftName.trim())}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
              >
                {savingDraft ? (currentDraftId ? 'מעדכן...' : 'שומר...') : (currentDraftId ? 'עדכן' : 'שמור')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!draftToDelete}
        onClose={() => setDraftToDelete(null)}
        onConfirm={confirmDeleteDraft}
        title="מחיקת טיוטה"
        message="האם אתה בטוח שברצונך למחוק את הטיוטה?"
        confirmText="מחק"
        cancelText="ביטול"
        variant="danger"
        loading={deletingDraft}
      />

      <DuplicateWarningModal
        isOpen={showDuplicateConfirm}
        onClose={() => { setShowDuplicateConfirm(false); setLoading(false) }}
        onConfirm={handleConfirmDuplicateSubmit}
      />
    </div>
  )
}

export default GroupTransactionModal

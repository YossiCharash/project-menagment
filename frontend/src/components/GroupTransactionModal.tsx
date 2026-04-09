import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Upload, File, Pencil } from 'lucide-react'
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
  const { items: suppliers } = useAppSelector(s => s.suppliers)
  
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
  const [rows, setRows] = useState<TransactionRow[]>([])

  // New state for card-based UI
  const [activePanelType, setActivePanelType] = useState<'regular' | 'unforeseen' | null>(null)
  const [editingCardRowId, setEditingCardRowId] = useState<string | null>(null)

  // Panel state for regular transaction
  const defaultPanelRegular = (): Partial<TransactionRow> => ({
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
    period_start_date: '',
    period_end_date: '',
    projectId: '',
    subprojectId: '',
    files: [],
    dateError: null,
    periodError: null,
  })
  const [panelRegular, setPanelRegular] = useState<Partial<TransactionRow>>(defaultPanelRegular())

  // Panel state for unforeseen transaction
  const defaultPanelUnforeseen = (): Partial<TransactionRow> => ({
    projectId: '',
    subprojectId: '',
    contractPeriodId: '',
    txDate: new Date().toISOString().split('T')[0],
    description: '',
    notes: '',
    unforeseenStatus: 'draft',
    incomes: [{ amount: '', description: '', documentFiles: [] }],
    expenses: [{ amount: '', description: '', documentFiles: [] }],
  })
  const [panelUnforeseen, setPanelUnforeseen] = useState<Partial<TransactionRow>>(defaultPanelUnforeseen())

  const draftsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showLoadDraft) return
    const handleClickOutside = (e: MouseEvent) => {
      if (draftsDropdownRef.current && !draftsDropdownRef.current.contains(e.target as Node)) {
        setShowLoadDraft(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLoadDraft])

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
    setRows(rows.filter(row => row.id !== rowId))
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
          transactionData.allow_overlap = true
        }
        transactionData.allow_duplicate = true

        const transaction = await TransactionAPI.createTransaction(transactionData)

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
    if (showLoadDraft) {
      setShowLoadDraft(false)
      return
    }
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

  // Panel handlers
  const handleSavePanelRegular = () => {
    const data = panelRegular
    if (!data.projectId) return
    if (!data.txDate) return
    if (!data.amount || Number(data.amount) <= 0) return

    if (editingCardRowId) {
      setRows(prev => prev.map(r => r.id === editingCardRowId ? {
        ...r,
        projectId: data.projectId as number,
        subprojectId: data.subprojectId ?? '',
        type: data.type as 'Income' | 'Expense',
        txDate: data.txDate!,
        amount: data.amount as number,
        description: data.description ?? '',
        categoryId: data.categoryId ?? '',
        supplierId: data.supplierId ?? '',
        paymentMethod: data.paymentMethod ?? '',
        notes: data.notes ?? '',
        isExceptional: data.isExceptional ?? false,
        fromFund: data.fromFund ?? false,
        period_start_date: data.period_start_date ?? '',
        period_end_date: data.period_end_date ?? '',
        files: data.files ?? [],
        isUnforeseen: false,
      } : r))
    } else {
      const newRow: TransactionRow = {
        id: Date.now().toString(),
        projectId: data.projectId as number,
        subprojectId: data.subprojectId ?? '',
        type: data.type as 'Income' | 'Expense',
        txDate: data.txDate!,
        amount: data.amount as number,
        description: data.description ?? '',
        categoryId: data.categoryId ?? '',
        supplierId: data.supplierId ?? '',
        paymentMethod: data.paymentMethod ?? '',
        notes: data.notes ?? '',
        isExceptional: data.isExceptional ?? false,
        fromFund: data.fromFund ?? false,
        files: data.files ?? [],
        dateError: null,
        duplicateError: null,
        checkingDuplicate: false,
        period_start_date: data.period_start_date ?? '',
        period_end_date: data.period_end_date ?? '',
        periodError: null,
        isUnforeseen: false,
        unforeseenStatus: 'draft',
        incomes: [{ amount: '', description: '', documentFiles: [] }],
        expenses: [{ amount: '', description: '', documentFiles: [] }],
        contractPeriodId: '',
      }
      setRows(prev => [...prev, newRow])
    }
    setActivePanelType(null)
    setEditingCardRowId(null)
    setPanelRegular(defaultPanelRegular())
  }

  const handleSavePanelUnforeseen = () => {
    const data = panelUnforeseen
    if (!data.projectId) return

    if (editingCardRowId) {
      setRows(prev => prev.map(r => r.id === editingCardRowId ? {
        ...r,
        projectId: data.projectId as number,
        subprojectId: data.subprojectId ?? '',
        contractPeriodId: data.contractPeriodId ?? '',
        txDate: data.txDate!,
        description: data.description ?? '',
        notes: data.notes ?? '',
        incomes: data.incomes ?? [{ amount: '', description: '', documentFiles: [] }],
        expenses: data.expenses ?? [{ amount: '', description: '', documentFiles: [] }],
        unforeseenStatus: data.unforeseenStatus ?? 'draft',
        isUnforeseen: true,
      } : r))
    } else {
      const newRow: TransactionRow = {
        id: Date.now().toString(),
        projectId: data.projectId as number,
        subprojectId: data.subprojectId ?? '',
        type: 'Expense',
        txDate: data.txDate!,
        amount: '',
        description: data.description ?? '',
        categoryId: '',
        supplierId: '',
        paymentMethod: '',
        notes: data.notes ?? '',
        isExceptional: false,
        fromFund: false,
        files: [],
        dateError: null,
        duplicateError: null,
        checkingDuplicate: false,
        period_start_date: '',
        period_end_date: '',
        periodError: null,
        isUnforeseen: true,
        unforeseenStatus: data.unforeseenStatus ?? 'draft',
        incomes: data.incomes ?? [{ amount: '', description: '', documentFiles: [] }],
        expenses: data.expenses ?? [{ amount: '', description: '', documentFiles: [] }],
        contractPeriodId: data.contractPeriodId ?? '',
      }
      setRows(prev => [...prev, newRow])
    }
    setActivePanelType(null)
    setEditingCardRowId(null)
    setPanelUnforeseen(defaultPanelUnforeseen())
  }

  const handleEditCard = (rowId: string) => {
    const row = rows.find(r => r.id === rowId)
    if (!row) return
    setEditingCardRowId(rowId)
    if (row.isUnforeseen) {
      setPanelUnforeseen({
        projectId: row.projectId,
        subprojectId: row.subprojectId,
        contractPeriodId: row.contractPeriodId,
        txDate: row.txDate,
        description: row.description,
        notes: row.notes,
        unforeseenStatus: row.unforeseenStatus,
        incomes: row.incomes ?? [{ amount: '', description: '', documentFiles: [] }],
        expenses: row.expenses ?? [{ amount: '', description: '', documentFiles: [] }],
      })
      setActivePanelType('unforeseen')
    } else {
      setPanelRegular({
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
        files: row.files,
        dateError: null,
        periodError: null,
      })
      setActivePanelType('regular')
    }
  }

  // Helper to get project label for a row (project name + parent project name)
  const getProjectLabel = (pId: number | '', spId: number | '') => {
    const effectiveId = spId || pId
    const project = projects.find(p => p.id === effectiveId) || projects.find(p => p.id === pId)
    if (!project) return '\u2014'
    if (spId) {
      const subprojects = subprojectsMap[pId as number] || []
      const sub = subprojects.find(s => s.id === spId)
      if (sub) {
        const parentProject = projects.find(p => p.id === pId)
        return parentProject ? `${parentProject.name} \u203A ${sub.name}` : sub.name
      }
    }
    return project.name
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
            <div className="relative flex items-center gap-2" ref={draftsDropdownRef}>
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

          {/* Action buttons */}
          <div className="flex gap-3 mb-5 justify-end flex-wrap" dir="rtl">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setPanelRegular(defaultPanelRegular()); setEditingCardRowId(null); setActivePanelType('regular') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוספת עסקה רגילה
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setPanelUnforeseen(defaultPanelUnforeseen()); setEditingCardRowId(null); setActivePanelType('unforeseen') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוספת עסקה לא צפויה
            </motion.button>
          </div>

          {/* Transaction cards grid */}
          {rows.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center text-gray-400 dark:text-gray-500 text-base">
              אין עסקאות עדיין — לחץ על אחד הכפתורים למעלה להוספה
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {rows.map(row => {
                const projectLabel = getProjectLabel(row.projectId, row.subprojectId)
                const isDateRange = !!(row.period_start_date && row.period_end_date)
                const dateTypeLabel = isDateRange ? 'תאריכית' : 'רגילה'
                const accentClass = row.isUnforeseen
                  ? 'border-r-4 border-purple-500'
                  : row.type === 'Income'
                  ? 'border-r-4 border-green-500'
                  : 'border-r-4 border-red-500'
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${accentClass}`}
                    dir="rtl"
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate flex-1" title={projectLabel}>{projectLabel}</span>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => handleEditCard(row.id)} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => removeRow(row.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {row.isUnforeseen ? (
                      <div className="space-y-1">
                        <span className="inline-block px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-[11px] font-medium">לא צפויה</span>
                        <div className="text-xs text-gray-600 dark:text-gray-400">הכנסות: <strong className="text-green-600">{(row.incomes ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString('he-IL')} ₪</strong></div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">הוצאות: <strong className="text-red-600">{(row.expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString('he-IL')} ₪</strong></div>
                        <div className="text-xs text-gray-400">{row.txDate}</div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-2 flex-wrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${row.type === 'Income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                            {row.type === 'Income' ? 'הכנסה' : 'הוצאה'}
                          </span>
                          <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-full text-[11px]">{dateTypeLabel}</span>
                        </div>
                        <div className={`text-base font-bold ${row.type === 'Income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {Number(row.amount).toLocaleString('he-IL')} ₪
                        </div>
                        <div className="text-xs text-gray-400">
                          {isDateRange ? `${row.period_start_date} \u2013 ${row.period_end_date}` : row.txDate}
                        </div>
                        {row.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{row.description}</div>}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Financial summary */}
          {rows.length > 0 && (() => {
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
              <div className="mt-1 flex items-center justify-end gap-4 py-1.5 px-3 rounded-lg bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm" dir="rtl">
                <span className="text-gray-600 dark:text-gray-400">סה"כ הכנסות: <strong className="text-green-600 dark:text-green-400">₪{totalIncome.toLocaleString('he-IL')}</strong></span>
                <span className="text-gray-600 dark:text-gray-400">סה"כ הוצאות: <strong className="text-red-600 dark:text-red-400">₪{totalExpense.toLocaleString('he-IL')}</strong></span>
                <span className="font-medium text-gray-700 dark:text-gray-300">יתרה: <strong className={balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>₪{balance.toLocaleString('he-IL')}</strong></span>
              </div>
            )
          })()}
        </div>

        {/* Regular transaction panel - floating overlay */}
        {activePanelType === 'regular' && (
          <div className="absolute inset-0 z-[55] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-6 rounded-2xl" onClick={() => setActivePanelType(null)}>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingCardRowId ? 'עריכת עסקה רגילה' : 'עסקה רגילה חדשה'}</h3>
                  {(panelRegular.projectId || panelRegular.subprojectId) && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5 font-medium">{getProjectLabel(panelRegular.projectId ?? '', panelRegular.subprojectId ?? '')}</p>
                  )}
                </div>
                <button type="button" onClick={() => setActivePanelType(null)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                    <select value={panelRegular.projectId ?? ''} onChange={e => { const pid = e.target.value ? Number(e.target.value) : ''; setPanelRegular(prev => ({ ...prev, projectId: pid, subprojectId: '' })); if (pid) { const proj = projects.find(p => p.id === pid); if (proj?.is_parent_project) loadSubprojects(pid as number) } }} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">בחר פרויקט</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {panelRegular.projectId && projects.find(p => p.id === panelRegular.projectId)?.is_parent_project && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תת-פרויקט</label>
                      <select value={panelRegular.subprojectId ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, subprojectId: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">בחר תת-פרויקט</option>
                        {(subprojectsMap[panelRegular.projectId as number] || []).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג עסקה</label>
                  <div className="flex gap-3">
                    {(['Expense', 'Income'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setPanelRegular(prev => ({ ...prev, type: t, supplierId: '' }))} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${panelRegular.type === t ? (t === 'Income' ? 'bg-green-500 border-green-500 text-white' : 'bg-red-500 border-red-500 text-white') : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}>
                        {t === 'Income' ? 'הכנסה' : 'הוצאה'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך עסקה *</label>
                    <input type="date" value={panelRegular.txDate ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, txDate: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סכום *</label>
                    <input type="number" min="0" step="0.01" value={panelRegular.amount ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עסקה תאריכית (אופציונלי)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={panelRegular.period_start_date ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, period_start_date: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="מתאריך" />
                    <input type="date" value={panelRegular.period_end_date ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, period_end_date: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="עד תאריך" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                  <input type="text" value={panelRegular.description ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="תיאור העסקה" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קטגוריה</label>
                    <select value={panelRegular.categoryId ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, categoryId: e.target.value ? Number(e.target.value) : '', supplierId: '' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">בחר קטגוריה</option>
                      {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {panelRegular.type === 'Expense' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ספק</label>
                      <select value={panelRegular.supplierId ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, supplierId: e.target.value ? Number(e.target.value) : '' }))} disabled={!panelRegular.categoryId} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                        <option value="">{panelRegular.categoryId ? 'בחר ספק' : 'בחר קודם קטגוריה'}</option>
                        {panelRegular.categoryId ? suppliers.filter(s => s.is_active !== false && s.category_id === panelRegular.categoryId).map(s => <option key={s.id} value={s.id}>{s.name}</option>) : null}
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אמצעי תשלום</label>
                    <select value={panelRegular.paymentMethod ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, paymentMethod: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">בחר אמצעי תשלום</option>
                      <option value="הוראת קבע">הוראת קבע</option>
                      <option value="אשראי">אשראי</option>
                      <option value="שיק">שיק</option>
                      <option value="מזומן">מזומן</option>
                      <option value="העברה בנקאית">העברה בנקאית</option>
                      <option value="גבייה מרוכזת סוף שנה">גבייה מרוכזת סוף שנה</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                    <input type="text" value={panelRegular.notes ?? ''} onChange={e => setPanelRegular(prev => ({ ...prev, notes: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="הערות" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מסמכים</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                      <Upload className="w-4 h-4" />
                      הוסף קבצים
                      <input type="file" multiple className="hidden" onChange={e => { const files = Array.from(e.target.files || []); setPanelRegular(prev => ({ ...prev, files: [...(prev.files || []), ...files] })); e.currentTarget.value = '' }} />
                    </label>
                    {(panelRegular.files || []).length > 0 && <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{(panelRegular.files || []).length} קבצים</span>}
                  </div>
                  {(panelRegular.files || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(panelRegular.files || []).map((f, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                          <File className="w-3 h-3" />
                          <span className="truncate max-w-[100px]">{f.name}</span>
                          <button type="button" onClick={() => setPanelRegular(prev => ({ ...prev, files: (prev.files || []).filter((_, idx) => idx !== i) }))} className="text-red-500 hover:text-red-700 mr-1"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setActivePanelType(null)} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all font-medium">ביטול</button>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSavePanelRegular} disabled={!panelRegular.projectId || !panelRegular.txDate || !panelRegular.amount || Number(panelRegular.amount) <= 0} className="px-8 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed">שמור</motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Unforeseen transaction panel */}
        {activePanelType === 'unforeseen' && (
          <div className="absolute inset-0 z-[55] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-6 rounded-2xl" onClick={() => setActivePanelType(null)}>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingCardRowId ? 'עריכת עסקה לא צפויה' : 'עסקה לא צפויה חדשה'}</h3>
                  {(panelUnforeseen.projectId || panelUnforeseen.subprojectId) && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 font-medium">{getProjectLabel(panelUnforeseen.projectId ?? '', panelUnforeseen.subprojectId ?? '')}</p>
                  )}
                </div>
                <button type="button" onClick={() => setActivePanelType(null)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                    <select value={panelUnforeseen.projectId ?? ''} onChange={e => { const pid = e.target.value ? Number(e.target.value) : ''; setPanelUnforeseen(prev => ({ ...prev, projectId: pid, subprojectId: '', contractPeriodId: '' })); if (pid) { const proj = projects.find(p => p.id === pid); if (proj?.is_parent_project) loadSubprojects(pid as number); loadContractPeriods(pid as number) } }} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                      <option value="">בחר פרויקט</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {panelUnforeseen.projectId && projects.find(p => p.id === panelUnforeseen.projectId)?.is_parent_project && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תת-פרויקט</label>
                      <select value={panelUnforeseen.subprojectId ?? ''} onChange={e => setPanelUnforeseen(prev => ({ ...prev, subprojectId: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                        <option value="">בחר תת-פרויקט</option>
                        {(subprojectsMap[panelUnforeseen.projectId as number] || []).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך עסקה *</label>
                    <input type="date" value={panelUnforeseen.txDate ?? ''} onChange={e => setPanelUnforeseen(prev => ({ ...prev, txDate: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  {panelUnforeseen.projectId && (contractPeriodsMap[panelUnforeseen.projectId as number] || []).length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תקופה</label>
                      <select value={panelUnforeseen.contractPeriodId ?? ''} onChange={e => setPanelUnforeseen(prev => ({ ...prev, contractPeriodId: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                        <option value="">כל התקופות</option>
                        {(contractPeriodsMap[panelUnforeseen.projectId as number] || []).map(p => <option key={p.period_id} value={p.period_id}>{p.year_label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                    <input type="text" value={panelUnforeseen.description ?? ''} onChange={e => setPanelUnforeseen(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="תיאור העסקה" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                    <input type="text" value={panelUnforeseen.notes ?? ''} onChange={e => setPanelUnforeseen(prev => ({ ...prev, notes: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="הערות" />
                  </div>
                </div>
                {/* Expenses */}
                <div className="rounded-xl border border-red-200 dark:border-red-800/50 border-r-4 border-r-red-500 bg-red-50/40 dark:bg-red-900/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/50">
                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">הוצאות</h4>
                    <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, expenses: [...(prev.expenses ?? []), { amount: '', description: '', documentFiles: [] }] }))} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 font-medium transition-colors"><Plus className="w-3.5 h-3.5" /> הוסף הוצאה</button>
                  </div>
                  <div className="p-3 space-y-3">
                    {(panelUnforeseen.expenses ?? []).map((exp, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex gap-2 items-center">
                          <input type="number" min="0" step="0.01" value={exp.amount} onChange={e => setPanelUnforeseen(prev => { const arr = [...(prev.expenses ?? [])]; arr[idx] = { ...arr[idx], amount: e.target.value ? Number(e.target.value) : '' }; return { ...prev, expenses: arr } })} className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="סכום" />
                          <input type="text" value={exp.description} onChange={e => setPanelUnforeseen(prev => { const arr = [...(prev.expenses ?? [])]; arr[idx] = { ...arr[idx], description: e.target.value }; return { ...prev, expenses: arr } })} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="תיאור" />
                          <label className="cursor-pointer p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded" title="הוסף מסמכים">
                            <Upload className="w-4 h-4" />
                            <input type="file" multiple className="hidden" onChange={e => {
                              const files = Array.from(e.target.files || [])
                              if (!files.length) return
                              setPanelUnforeseen(prev => { const arr = [...(prev.expenses ?? [])]; arr[idx] = { ...arr[idx], documentFiles: [...(arr[idx].documentFiles || []), ...files] }; return { ...prev, expenses: arr } })
                              e.currentTarget.value = ''
                            }} />
                          </label>
                          {(panelUnforeseen.expenses ?? []).length > 1 && <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, expenses: (prev.expenses ?? []).filter((_, i) => i !== idx) }))} className="p-1 text-red-400 hover:text-red-600 transition-colors"><X className="w-4 h-4" /></button>}
                        </div>
                        {(exp.documentFiles || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pr-1">
                            {(exp.documentFiles || []).map((f, fi) => (
                              <div key={fi} className="flex items-center gap-1 text-[11px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded text-red-700 dark:text-red-300">
                                <File className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[90px]">{f.name}</span>
                                <button type="button" onClick={() => setPanelUnforeseen(prev => { const arr = [...(prev.expenses ?? [])]; arr[idx] = { ...arr[idx], documentFiles: arr[idx].documentFiles.filter((_, i) => i !== fi) }; return { ...prev, expenses: arr } })} className="text-red-400 hover:text-red-600"><X className="w-2.5 h-2.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="text-xs text-red-600 dark:text-red-400 font-medium pt-1">סה"כ: {(panelUnforeseen.expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString('he-IL')} ₪</div>
                  </div>
                </div>
                {/* Incomes */}
                <div className="rounded-xl border border-green-200 dark:border-green-800/50 border-r-4 border-r-green-500 bg-green-50/40 dark:bg-green-900/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800/50">
                    <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">הכנסות</h4>
                    <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, incomes: [...(prev.incomes ?? []), { amount: '', description: '', documentFiles: [] }] }))} className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-800 font-medium transition-colors"><Plus className="w-3.5 h-3.5" /> הוסף הכנסה</button>
                  </div>
                  <div className="p-3 space-y-3">
                    {(panelUnforeseen.incomes ?? []).map((inc, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex gap-2 items-center">
                          <input type="number" min="0" step="0.01" value={inc.amount} onChange={e => setPanelUnforeseen(prev => { const arr = [...(prev.incomes ?? [])]; arr[idx] = { ...arr[idx], amount: e.target.value ? Number(e.target.value) : '' }; return { ...prev, incomes: arr } })} className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400" placeholder="סכום" />
                          <input type="text" value={inc.description} onChange={e => setPanelUnforeseen(prev => { const arr = [...(prev.incomes ?? [])]; arr[idx] = { ...arr[idx], description: e.target.value }; return { ...prev, incomes: arr } })} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400" placeholder="תיאור" />
                          <label className="cursor-pointer p-1.5 text-gray-400 hover:text-green-500 transition-colors rounded" title="הוסף מסמכים">
                            <Upload className="w-4 h-4" />
                            <input type="file" multiple className="hidden" onChange={e => {
                              const files = Array.from(e.target.files || [])
                              if (!files.length) return
                              setPanelUnforeseen(prev => { const arr = [...(prev.incomes ?? [])]; arr[idx] = { ...arr[idx], documentFiles: [...(arr[idx].documentFiles || []), ...files] }; return { ...prev, incomes: arr } })
                              e.currentTarget.value = ''
                            }} />
                          </label>
                          {(panelUnforeseen.incomes ?? []).length > 1 && <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, incomes: (prev.incomes ?? []).filter((_, i) => i !== idx) }))} className="p-1 text-red-400 hover:text-red-600 transition-colors"><X className="w-4 h-4" /></button>}
                        </div>
                        {(inc.documentFiles || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pr-1">
                            {(inc.documentFiles || []).map((f, fi) => (
                              <div key={fi} className="flex items-center gap-1 text-[11px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300">
                                <File className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[90px]">{f.name}</span>
                                <button type="button" onClick={() => setPanelUnforeseen(prev => { const arr = [...(prev.incomes ?? [])]; arr[idx] = { ...arr[idx], documentFiles: arr[idx].documentFiles.filter((_, i) => i !== fi) }; return { ...prev, incomes: arr } })} className="text-red-400 hover:text-red-600"><X className="w-2.5 h-2.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="text-xs text-green-600 dark:text-green-400 font-medium pt-1">סה"כ: {(panelUnforeseen.incomes ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString('he-IL')} ₪</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סטטוס</label>
                  <select value={panelUnforeseen.unforeseenStatus ?? 'draft'} onChange={e => setPanelUnforeseen(prev => ({ ...prev, unforeseenStatus: e.target.value as 'draft' | 'waiting_for_approval' | 'executed' }))} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="draft">טיוטה</option>
                    <option value="waiting_for_approval">מחכה לאישור</option>
                    <option value="executed">אשר כבוצע</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setActivePanelType(null)} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all font-medium">ביטול</button>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleSavePanelUnforeseen} disabled={!panelUnforeseen.projectId || !panelUnforeseen.txDate} className="px-8 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed">שמור</motion.button>
              </div>
            </motion.div>
          </div>
        )}

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
                  : 'שומר עסקאות...'}
              </span>
            ) : (
              `שמור כל העסקאות (${rows.length})`
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

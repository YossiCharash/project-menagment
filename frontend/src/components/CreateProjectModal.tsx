import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Project, ProjectCreate, BudgetCreate, BudgetWithSpending } from '../types/api'
import { ProjectAPI, BudgetAPI, CategoryAPI, Category } from '../lib/apiClient'
import { formatDateForInput } from '../lib/utils'
import FundSetupModal from './FundSetupModal'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (project: Project) => void
  editingProject?: Project | null
  parentProjectId?: number
  projectType?: 'parent' | 'regular' // 'parent' = רק תאריכים, 'regular' = כל השדות
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingProject,
  parentProjectId,
  projectType = 'regular' // Default to regular project
}) => {
  const [formData, setFormData] = useState<ProjectCreate>({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    contract_duration_months: undefined,
    budget_monthly: 0,
    budget_annual: 0,
    address: '',
    city: '',
    relation_project: undefined,
    manager_id: undefined
  })

  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedContractFile, setSelectedContractFile] = useState<File | null>(null)
  const [existingContractUrl, setExistingContractUrl] = useState<string | null>(null)
  const [budgetInputType, setBudgetInputType] = useState<'monthly' | 'yearly'>('monthly')
  const [categoryBudgets, setCategoryBudgets] = useState<BudgetCreate[]>([])
  const [existingBudgets, setExistingBudgets] = useState<BudgetWithSpending[]>([])
  const [existingBudgetCategories, setExistingBudgetCategories] = useState<string[]>([])
  const [existingFundLocked, setExistingFundLocked] = useState(false)
  const [hasFund, setHasFund] = useState(false)
  const [monthlyFundAmount, setMonthlyFundAmount] = useState<number>(0)
  const [nameError, setNameError] = useState<string | null>(null)
  const [showFundSetupModal, setShowFundSetupModal] = useState(false)
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null)
  const [isCheckingName, setIsCheckingName] = useState(false)
  const [nameValid, setNameValid] = useState<boolean | null>(null)
  const [hasPastPeriods, setHasPastPeriods] = useState(false)
  const [checkingPastPeriods, setCheckingPastPeriods] = useState(false)
  const [contractPeriods, setContractPeriods] = useState<Array<{
    period_id: number
    start_date: string
    end_date: string
    contract_year: number
    year_index: number
    year_label: string
  }>>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [editFromCurrentPeriod, setEditFromCurrentPeriod] = useState(true) // Default to editing from current period
  // Calculated end date based on contract_duration_months
  const [calculatedEndDate, setCalculatedEndDate] = useState<string | null>(null)
  // Default to 'regular' if no projectType is provided, but allow override
  const [selectedProjectType, setSelectedProjectType] = useState<'parent' | 'regular'>(
    projectType || 'regular'
  )
  
  // Available expense categories - loaded from API (only categories defined in settings)
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  
  // Determine if we should show minimal fields (parent project without parentProjectId)
  // A project is a parent project if:
  // 1. Creating a new parent project (selectedProjectType === 'parent' and no parentProjectId)
  // 2. Editing a project that has is_parent_project === true
  const isParentProject = editingProject 
    ? (editingProject.is_parent_project === true)
    : (!parentProjectId && selectedProjectType === 'parent')
  const isParentProjectCreation = !parentProjectId && !editingProject && selectedProjectType === 'parent'
  const isRegularProjectCreation = !parentProjectId && !editingProject && selectedProjectType === 'regular'
  
  // Reset project type when modal opens based on projectType prop
  useEffect(() => {
    if (isOpen && !parentProjectId && !editingProject) {
      // Set project type based on prop (from button clicked)
      setSelectedProjectType(projectType || 'regular')
    }
  }, [isOpen, parentProjectId, editingProject, projectType])

  // Update start_date when a period is selected (current or specific)
  useEffect(() => {
    if (!editingProject || !hasPastPeriods || contractPeriods.length === 0) {
      return
    }

    if (editFromCurrentPeriod) {
      // When editing from current period, use the current period's start date
      // The current period is the one with the latest start_date
      const currentPeriod = contractPeriods[contractPeriods.length - 1]
      if (currentPeriod) {
        const periodStartDate = currentPeriod.start_date.split('T')[0]
        setFormData(prev => ({
          ...prev,
          start_date: periodStartDate
        }))
      }
    } else if (selectedPeriodId) {
      // When a specific period is selected, use that period's start date
      const selectedPeriod = contractPeriods.find(p => p.period_id === selectedPeriodId)
      if (selectedPeriod) {
        const periodStartDate = selectedPeriod.start_date.split('T')[0]
        setFormData(prev => ({
          ...prev,
          start_date: periodStartDate
        }))
      }
    }
  }, [editingProject, selectedPeriodId, contractPeriods, hasPastPeriods, editFromCurrentPeriod])

  // Calculate end date automatically when editing based on selected period and contract_duration_months
  useEffect(() => {
    if (!editingProject || !formData.contract_duration_months || formData.contract_duration_months <= 0) {
      setCalculatedEndDate(null)
      return
    }

    let startDateStr: string | null = null

    // If editing from current period, use current period's start date
    if (editFromCurrentPeriod && hasPastPeriods && contractPeriods.length > 0) {
      const currentPeriod = contractPeriods[contractPeriods.length - 1]
      if (currentPeriod) {
        startDateStr = currentPeriod.start_date.split('T')[0]
      }
    }
    // If editing from a specific period, use that period's start date
    else if (!editFromCurrentPeriod && hasPastPeriods && selectedPeriodId && contractPeriods.length > 0) {
      const selectedPeriod = contractPeriods.find(p => p.period_id === selectedPeriodId)
      if (selectedPeriod) {
        startDateStr = selectedPeriod.start_date.split('T')[0]
      }
    }

    // Fallback to form start_date if no period found
    if (!startDateStr && formData.start_date) {
      startDateStr = formData.start_date
    }

    if (!startDateStr) {
      setCalculatedEndDate(null)
      return
    }

    // Parse date as local date to avoid timezone issues
    const [year, month, day] = startDateStr.split('-').map(Number)
    const startDate = new Date(year, month - 1, day)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + formData.contract_duration_months)
    
    // Format as YYYY-MM-DD
    const endYear = endDate.getFullYear()
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0')
    const endDay = String(endDate.getDate()).padStart(2, '0')
    const newEndDateStr = `${endYear}-${endMonth}-${endDay}`
    
    setCalculatedEndDate(newEndDateStr)
    
    // Also update the form data with the calculated end date
    setFormData(prev => ({
      ...prev,
      end_date: newEndDateStr
    }))
  }, [editingProject, formData.contract_duration_months, formData.start_date, selectedPeriodId, hasPastPeriods, contractPeriods, editFromCurrentPeriod])

  // Clear focus when modal opens to prevent buttons staying "pressed"
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to ensure DOM is ready and all state updates are applied
      const timeoutId = setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        // Also blur any buttons that might have focus
        const buttons = document.querySelectorAll('button:focus')
        buttons.forEach((btn) => {
          if (btn instanceof HTMLElement) {
            btn.blur()
          }
        })
      }, 50)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isOpen])

  // Load available projects for parent selection and set parent project if provided
  useEffect(() => {
    if (isOpen) {
      loadProjects()
      loadCategories()
      // Set parent project automatically when creating subproject
      if (parentProjectId && !editingProject) {
        setFormData(prev => ({
          ...prev,
          relation_project: parentProjectId
        }))
      } else if (!parentProjectId && !editingProject) {
        // Clear relation_project when creating parent project
        setFormData(prev => ({
          ...prev,
          relation_project: undefined
        }))
      }
    }
  }, [isOpen, parentProjectId, editingProject])

  // Load categories from API (only categories defined in settings)
  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      // Keep only active categories with full object (id + name)
      const activeCategories = categories.filter(cat => cat.is_active)
      setExpenseCategories(activeCategories)
    } catch (err) {
      // If loading fails, set empty array (no categories available)
      console.error('Error loading categories:', err)
      setExpenseCategories([])
    }
  }

  // Check if project has past contract periods and load all periods
  const checkPastPeriods = async (projectId: number) => {
    setCheckingPastPeriods(true)
    try {
      const periodsData = await ProjectAPI.getContractPeriods(projectId)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      // Collect all periods from all years
      const allPeriods: Array<{
        period_id: number
        start_date: string
        end_date: string
        contract_year: number
        year_index: number
        year_label: string
      }> = []
      
      // Check all periods to see if any ended in the past
      let foundPastPeriod = false
      for (const yearGroup of periodsData.periods_by_year) {
        for (const period of yearGroup.periods) {
          allPeriods.push({
            period_id: period.period_id,
            start_date: period.start_date,
            end_date: period.end_date,
            contract_year: yearGroup.year,
            year_index: period.year_index,
            year_label: period.year_label
          })
          
          const endDate = new Date(period.end_date)
          endDate.setHours(0, 0, 0, 0)
          if (endDate <= today) {
            foundPastPeriod = true
          }
        }
      }
      
      // Sort periods by start_date (oldest first)
      allPeriods.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      
      setContractPeriods(allPeriods)
      setHasPastPeriods(foundPastPeriod)
      
      // Default to editing from current period (not from a specific past period)
      setEditFromCurrentPeriod(true)
      // Find the current period (the one with the latest start_date that hasn't ended)
      if (allPeriods.length > 0) {
        // The current period is the one with the latest start_date
        const currentPeriod = allPeriods[allPeriods.length - 1]
        setSelectedPeriodId(currentPeriod.period_id)
      } else {
        setSelectedPeriodId(null)
      }
    } catch (err) {
      console.error('Error checking past periods:', err)
      // On error, assume there might be past periods to be safe
      setHasPastPeriods(true)
      setContractPeriods([])
    } finally {
      setCheckingPastPeriods(false)
    }
  }

  // Populate form when editing
  useEffect(() => {
    if (editingProject) {
      setFormData({
        name: editingProject.name,
        description: editingProject.description || '',
        start_date: formatDateForInput(editingProject.start_date),
        end_date: formatDateForInput(editingProject.end_date),
        contract_duration_months: editingProject.contract_duration_months || undefined,
        budget_monthly: editingProject.budget_monthly,
        budget_annual: editingProject.budget_annual,
        address: editingProject.address || '',
        city: editingProject.city || '',
        relation_project: editingProject.relation_project || undefined,
        manager_id: editingProject.manager_id || undefined
      })
      // Load fund data if exists (fallback to prop before fetching fresh data)
      if ('has_fund' in editingProject) {
        const hasFundFlag = Boolean((editingProject as any).has_fund)
        setHasFund(hasFundFlag)
        setExistingFundLocked(hasFundFlag)
        setMonthlyFundAmount((editingProject as any).monthly_fund_amount || 0)
      } else {
        setExistingFundLocked(false)
      }
      // Load existing budgets
      loadExistingBudgets(editingProject.id)
      loadFundLockState(editingProject.id)
      // Check for past periods
      checkPastPeriods(editingProject.id)
      // Reset image states when editing
      setSelectedImage(null)
      setImagePreview(editingProject.image_url ? getImageUrl(editingProject.image_url) : null)
      // Reset contract states when editing
      if (editingProject.contract_file_url) {
        setExistingContractUrl(getFileUrl(editingProject.contract_file_url))
      } else {
        setExistingContractUrl(null)
      }
      setSelectedContractFile(null)
      // Reset name validation when editing
      setNameError(null)
      setNameValid(null)
    } else {
      resetForm()
      setHasPastPeriods(false)
      setContractPeriods([])
      setSelectedPeriodId(null)
    }
  }, [editingProject])

  // Load existing budgets for editing
  const loadExistingBudgets = async (projectId: number) => {
    try {
      const budgets = await BudgetAPI.getProjectBudgets(projectId)
      setExistingBudgets(budgets)
      setExistingBudgetCategories(budgets.map(b => b.category))
      // Editing existing budgets happens from the project details page,
      // so keep the creation list empty to allow only new categories here.
      setCategoryBudgets([])
      
      // Note: We don't add budget categories to the list - only use categories from settings
      // If a budget has a category not in settings, it will still work but won't appear in dropdown
    } catch (err) {
      // If loading fails, continue without budgets
      console.error('Error loading existing budgets:', err)
      setExistingBudgets([])
      setExistingBudgetCategories([])
    }
  }

  const loadFundLockState = async (projectId: number) => {
    try {
      const projectDetails = await ProjectAPI.getProject(projectId)
      const hasFundFlag = Boolean(projectDetails.has_fund)
      setExistingFundLocked(hasFundFlag)
      setHasFund(hasFundFlag)
      if (hasFundFlag) {
        setMonthlyFundAmount(projectDetails.monthly_fund_amount || 0)
      } else {
        setMonthlyFundAmount(0)
      }
    } catch (err) {
      console.error('Error loading fund details:', err)
    }
  }

  // Check project name availability with debounce
  useEffect(() => {
    const checkName = async () => {
      const name = formData.name.trim()
      
      // Reset validation if name is empty
      if (!name) {
        setNameError(null)
        setNameValid(null)
        setIsCheckingName(false)
        return
      }

      // Don't check if we're editing and name hasn't changed
      if (editingProject && name === editingProject.name) {
        setNameError(null)
        setNameValid(true)
        setIsCheckingName(false)
        return
      }

      // Set checking state but don't block input
      setIsCheckingName(true)
      setNameError(null)
      setNameValid(null)

      try {
        const result = await ProjectAPI.checkProjectName(name, editingProject?.id)
        // Only update if the name hasn't changed during the check
        if (formData.name.trim() === name) {
          if (result.exists) {
            setNameError('שם זה כבר קיים. אנא בחר שם אחר')
            setNameValid(false)
          } else {
            setNameError(null)
            setNameValid(true)
          }
        }
      } catch (err: any) {
        // If there's an error (like 422 validation error), don't block the user
        // This can happen if the name is empty or has invalid characters
        // Only log if it's not a validation error (422)
        if (err?.response?.status !== 422) {
          console.error('Error checking name:', err)
        }
        // Only clear if name hasn't changed
        if (formData.name.trim() === name) {
          setNameError(null)
          setNameValid(null)
        }
      } finally {
        // Only clear checking state if name hasn't changed
        if (formData.name.trim() === name) {
          setIsCheckingName(false)
        }
      }
    }

    // Debounce: wait 300ms after user stops typing (reduced for faster feedback)
    const timeoutId = setTimeout(checkName, 300)
    return () => clearTimeout(timeoutId)
  }, [formData.name, editingProject])

  const loadProjects = async () => {
    try {
      const projects = await ProjectAPI.getProjects()
      setAvailableProjects(projects.filter(p => p.is_active))
    } catch (err) {
      // Ignore
    }
  }

  const resetForm = () => {
    // Remove focus from any active element to prevent button staying "pressed"
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    
    setFormData({
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      contract_duration_months: undefined,
      budget_monthly: 0,
      budget_annual: 0,
      address: '',
      city: '',
      relation_project: parentProjectId || undefined,
      manager_id: undefined
    })
    setError(null)
    setSelectedImage(null)
    setImagePreview(null)
    setSelectedContractFile(null)
    setExistingContractUrl(null)
    setBudgetInputType('monthly')
    setCategoryBudgets([])
    setExistingBudgets([])
    setExistingBudgetCategories([])
    setExistingFundLocked(false)
    setHasFund(false)
    setMonthlyFundAmount(0)
    setNameError(null)
    setNameValid(null)
    setIsCheckingName(false)
    setSelectedProjectType(projectType) // Reset to default project type
    setShowFundSetupModal(false)
    setCreatedProjectId(null)
    setContractPeriods([])
    setSelectedPeriodId(null)
    setEditFromCurrentPeriod(true)
    setCalculatedEndDate(null)
  }

  const getImageUrl = (imageUrl: string): string => {
    // If backend already returned full URL (S3 / CloudFront), use as-is
    if (imageUrl.startsWith('http')) {
      return imageUrl
    }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${imageUrl}`
  }

  const getFileUrl = (fileUrl: string): string => {
    if (!fileUrl) return ''
    if (fileUrl.startsWith('http')) {
      return fileUrl
    }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${fileUrl}`
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!validTypes.includes(file.type)) {
        setError('סוג קובץ לא תקין. אנא בחר תמונה (JPG, PNG, GIF, WebP)')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('גודל הקובץ גדול מדי. מקסימום 5MB')
        return
      }

      setSelectedImage(file)
      setError(null)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleContractChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !allowedExtensions.includes(ext)) {
        setError('סוג קובץ לא תקין. ניתן לצרף קובץ PDF, DOC, DOCX או תמונה (JPG/PNG).')
        return
      }

      const maxSizeMb = 15
      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`גודל הקובץ גדול מדי. מקסימום ${maxSizeMb}MB`)
        return
      }

      setSelectedContractFile(file)
      setExistingContractUrl(null)
      setError(null)
    }
  }

  const handleClearContractSelection = () => {
    setSelectedContractFile(null)
    if (editingProject?.contract_file_url) {
      setExistingContractUrl(getFileUrl(editingProject.contract_file_url))
    } else {
      setExistingContractUrl(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Validate required fields based on project type BEFORE creating projectData
      if (parentProjectId) {
        // For subprojects: name is required
        if (!formData.name || formData.name.trim() === '') {
          setError('שם הפרויקט נדרש')
          setLoading(false)
          return
        }

        // Check if name is valid (not duplicate) for subprojects
        if (nameValid === false) {
          setError('לא ניתן לשמור: שם הפרויקט כבר קיים. אנא שנה את השם')
          setLoading(false)
          return
        }

        // If name is still being checked, wait a bit
        if (isCheckingName) {
          setError('בודק שם פרויקט... אנא המתן')
          setLoading(false)
          return
        }
      } else if (!editingProject && isParentProjectCreation) {
        // For parent projects: only name is required (no dates)
        if (!formData.name || formData.name.trim() === '') {
          setError('שם הפרויקט נדרש')
          setLoading(false)
          return
        }
      } else if (!editingProject && isRegularProjectCreation) {
        // For regular projects: name, start_date and duration are required
        if (!formData.name || formData.name.trim() === '') {
          setError('שם הפרויקט נדרש')
          setLoading(false)
          return
        }
        
        if (!formData.start_date) {
          setError('תאריך התחלה נדרש')
          setLoading(false)
          return
        }

        if (!formData.contract_duration_months || formData.contract_duration_months <= 0) {
          setError('משך החוזה בחודשים נדרש וחייב להיות גדול מ-0')
          setLoading(false)
          return
        }

        // Check if name is valid (not duplicate) for regular projects
        if (nameValid === false) {
          setError('לא ניתן לשמור: שם הפרויקט כבר קיים. אנא שנה את השם')
          setLoading(false)
          return
        }

        // If name is still being checked, wait a bit
        if (isCheckingName) {
          setError('בודק שם פרויקט... אנא המתן')
          setLoading(false)
          return
        }
      } else {
        // For editing: name is required, dates required for parent projects
        if (!formData.name || formData.name.trim() === '') {
          setError('שם הפרויקט נדרש')
          setLoading(false)
          return
        }
        // For parent projects, dates are not required (they are hidden)
      }

      // Filter and validate budgets - remove project_id if present (not needed for project creation)
      const validBudgets = categoryBudgets
        .filter(b => {
          // Validate budget has required fields
          if (!b.category_id || !b.start_date) {
            return false
          }
          // Validate amount is positive
          if (!b.amount || b.amount <= 0) {
            return false
          }
          // Validate dates if both are provided
          if (b.start_date && b.end_date && new Date(b.end_date) <= new Date(b.start_date)) {
            return false
          }
          return true
        })
        .map(b => {
          const budgetWithoutProjectId: any = { ...b }
          delete budgetWithoutProjectId.project_id
          return {
            ...budgetWithoutProjectId,
            period_type: b.period_type || 'Annual',
            end_date: b.end_date || null
          }
        })
      
      // Validate fund amount if fund is enabled
      if (hasFund && !existingFundLocked) {
        if (!monthlyFundAmount || monthlyFundAmount <= 0) {
          setError('סכום הקופה החודשי חייב להיות גדול מ-0')
          setLoading(false)
          return
        }
      }

      // Calculate end_date from start_date + duration if creating new project
      let calculatedEndDate: string | undefined = undefined
      if (!editingProject && formData.start_date && formData.contract_duration_months) {
        // Parse date as local date to avoid timezone issues
        // Extract date parts from YYYY-MM-DD format
        const [year, month, day] = formData.start_date.split('-').map(Number)
        const startDate = new Date(year, month - 1, day)
        const endDate = new Date(startDate)
        endDate.setMonth(endDate.getMonth() + formData.contract_duration_months)
        // Format as YYYY-MM-DD without timezone conversion
        const endYear = endDate.getFullYear()
        const endMonth = String(endDate.getMonth() + 1).padStart(2, '0')
        const endDay = String(endDate.getDate()).padStart(2, '0')
        calculatedEndDate = `${endYear}-${endMonth}-${endDay}`
      }

      const projectData: ProjectCreate & { apply_from_period_id?: number } = {
        // Name is always required by backend (min_length=1), ensure it exists
        name: formData.name.trim(),
        description: formData.description || undefined,
        // For updates, always send dates (even if empty string, convert to null/undefined)
        // This ensures dates are updated properly
        // For parent projects, don't send dates (they should be null/undefined)
        start_date: isParentProject ? undefined : ((formData.start_date && formData.start_date.trim()) || undefined),
        end_date: isParentProject ? undefined : (editingProject ? ((formData.end_date && formData.end_date.trim()) || undefined) : calculatedEndDate),
        contract_duration_months: isParentProject ? undefined : (formData.contract_duration_months || undefined),
        // Add apply_from_period_id if editing and period is selected
        ...(editingProject && selectedPeriodId ? { apply_from_period_id: selectedPeriodId } : {}),
        // Budget fields are required with default 0
        budget_monthly: formData.budget_monthly || 0,
        budget_annual: formData.budget_annual || 0,
        address: formData.address || undefined,
        city: formData.city || undefined,
        // Automatically set parent project when creating subproject
        relation_project: parentProjectId || formData.relation_project || undefined,
        // Set is_parent_project based on project type
        // - If creating parent project: true
        // - If creating subproject (has parentProjectId): false
        // - If creating regular project: false (explicitly set to false)
        is_parent_project: isParentProjectCreation ? true : false,
        manager_id: formData.manager_id || undefined,
        // Only include budgets for regular projects or subprojects (not for parent projects)
        budgets: (isParentProject || isParentProjectCreation ? undefined : (validBudgets.length > 0 ? validBudgets : undefined)),
        // Don't set has_fund on project creation - it will be set after fund is created via the modal
        has_fund: false,
        monthly_fund_amount: undefined
      }
      
      // When updating, explicitly include dates even if they're empty to allow clearing them
      if (editingProject) {
        // Explicitly set dates to ensure they're sent in the update request
        // If empty string, set to null to clear the date
        if (formData.start_date === '') {
          (projectData as any).start_date = null
        }
        if (formData.end_date === '') {
          (projectData as any).end_date = null
        }
      }
      
      // Ensure name is not empty (backend requirement - min_length=1)
      if (!projectData.name || projectData.name.trim() === '') {
        setError('שם הפרויקט נדרש')
        setLoading(false)
        return
      }

      let result: Project
      if (editingProject) {
        // For updates, we need to send apply_from_period_id separately if it exists
        // If editing from current period, send the current period ID
        // If editing from a specific period, send that period ID
        const updateData: any = { ...projectData }
        if (selectedPeriodId && formData.contract_duration_months) {
          // Always send the period ID - either current or selected
          updateData.apply_from_period_id = selectedPeriodId
        }
        result = await ProjectAPI.updateProject(editingProject.id, updateData)
      } else {
        result = await ProjectAPI.createProject(projectData)
      }

      // Upload image if one was selected
      if (selectedImage) {
        try {
          result = await ProjectAPI.uploadProjectImage(result.id, selectedImage)
        } catch (imgErr: any) {
          // Don't fail the whole operation if image upload fails
          setError(`הפרויקט נוצר בהצלחה אך העלאת התמונה נכשלה: ${imgErr.response?.data?.detail || 'שגיאה לא ידועה'}`)
        }
      }

      // Upload contract if one was selected (only for non-parent projects)
      if (selectedContractFile && !isParentProject && !isParentProjectCreation) {
        try {
          result = await ProjectAPI.uploadProjectContract(result.id, selectedContractFile)
        } catch (contractErr: any) {
          setError(`הפרויקט נשמר אך העלאת החוזה נכשלה: ${contractErr.response?.data?.detail || contractErr.message || 'שגיאה לא ידועה'}`)
        }
      }

      // Verify budgets were created successfully
      if (validBudgets.length > 0) {
        try {
          // Wait a bit for the backend to process
          await new Promise(resolve => setTimeout(resolve, 500))
          const createdBudgets = await BudgetAPI.getProjectBudgets(result.id)
          if (createdBudgets.length === 0 && validBudgets.length > 0) {
            setError(`הפרויקט נוצר בהצלחה, אך ייתכן שיש בעיה ביצירת התקציבים.`)
          }
        } catch (budgetErr: any) {
          // Don't fail the whole operation
        }
      }

      // Dispatch custom event to notify other components (e.g., ProjectDetail) that project was updated
      if (editingProject) {
        window.dispatchEvent(new CustomEvent('projectUpdated', { detail: { projectId: result.id } }))
      }
      
      // If creating a new project with fund, show fund setup modal
      if (!editingProject && hasFund && !existingFundLocked && monthlyFundAmount > 0) {
        setCreatedProjectId(result.id)
        setShowFundSetupModal(true)
        // Don't close the modal yet - wait for fund setup
        return
      }
      
      // Always close modal and call onSuccess, even if image upload failed
      onClose()
      resetForm()
      onSuccess(result)
    } catch (err: any) {
      console.error('Error creating/updating project:', err)
      setError(err.response?.data?.detail || err.message || 'שמירה נכשלה')
      setLoading(false)
    }
  }

  const handleClose = () => {
    // Remove focus from any active element before closing
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    onClose()
    resetForm()
  }

  const addCategoryBudget = () => {
    if (expenseCategories.length === 0) {
      setError('אין קטגוריות זמינות. הוסף קטגוריות בהגדרות תחילה.')
      return
    }
    const reservedCategories = new Set(existingBudgetCategories)
    categoryBudgets.forEach(b => {
      // Find category name by id
      const cat = expenseCategories.find(c => c.id === b.category_id)
      if (cat) {
        reservedCategories.add(cat.name)
      }
    })
    const availableCategories = expenseCategories.filter(cat => !reservedCategories.has(cat.name))
    if (availableCategories.length === 0) {
      setError('לכל הקטגוריות כבר הוגדר תקציב. ניתן לערוך תקציבים קיימים מדף פרטי הפרויקט.')
      return
    }
    const today = new Date().toISOString().split('T')[0]
    // Use project start date if set, otherwise today
    const defaultStartDate = formData.start_date || today

    // Calculate default end date for Annual period
    let defaultEndDate: string | null = null
    if (defaultStartDate) {
      const startDate = new Date(defaultStartDate)
      const endDate = new Date(startDate)
      endDate.setFullYear(endDate.getFullYear() + 1)
      endDate.setDate(endDate.getDate() - 1)
      defaultEndDate = endDate.toISOString().split('T')[0]
    }

    const newBudget: BudgetCreate = {
      category_id: availableCategories[0].id,
      amount: 0,
      period_type: 'Annual',
      start_date: today,
      end_date: null
    }
    setCategoryBudgets([...categoryBudgets, newBudget])
  }

  const removeCategoryBudget = (index: number) => {
    setCategoryBudgets(categoryBudgets.filter((_, i) => i !== index))
  }

  const updateCategoryBudget = (index: number, field: keyof BudgetCreate, value: any) => {
    const updated = [...categoryBudgets]
    updated[index] = { ...updated[index], [field]: value }
    
    // If period_type is Annual and start_date is set, calculate end_date
    if (field === 'start_date' && updated[index].period_type === 'Annual' && value) {
      const startDate = new Date(value)
      const endDate = new Date(startDate)
      endDate.setFullYear(endDate.getFullYear() + 1)
      endDate.setDate(endDate.getDate() - 1) // One day before next year
      updated[index].end_date = endDate.toISOString().split('T')[0]
    }
    
    setCategoryBudgets(updated)
  }

  const usedBudgetCategories = useMemo(() => {
    const reserved = new Set<string>(existingBudgetCategories)
    categoryBudgets.forEach(b => {
      // Find category name by id
      const cat = expenseCategories.find(c => c.id === b.category_id)
      if (cat) {
        reserved.add(cat.name)
      }
    })
    return reserved
  }, [existingBudgetCategories, categoryBudgets])

  const hasAvailableBudgetCategories = expenseCategories.some(cat => !usedBudgetCategories.has(cat))

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {editingProject ? 'עריכת פרויקט' : (parentProjectId ? 'יצירת תת-פרויקט חדש' : 'יצירת פרויקט חדש')}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Show project type info when creating new project */}
          {!parentProjectId && !editingProject && (
            <div className={`rounded-lg p-3 border ${
              selectedProjectType === 'parent' 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedProjectType === 'parent' 
                  ? 'יצירת פרויקט על - רק תאריכים נדרשים' 
                  : 'יצירת פרויקט רגיל - כל השדות זמינים'}
              </p>
            </div>
          )}

          {/* Show name field for all project types (parent, regular, subproject, editing) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                שם הפרויקט {(parentProjectId || editingProject || isRegularProjectCreation || isParentProjectCreation) ? '*' : ''}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required={!!(parentProjectId || editingProject || isRegularProjectCreation || isParentProjectCreation)}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                    nameError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : nameValid === true 
                      ? 'border-green-500 focus:ring-green-500' 
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                  }`}
                />
                {isCheckingName && (
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
              {isCheckingName && formData.name.trim() && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">בודק שם...</p>
              )}
              {nameError && !isCheckingName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{nameError}</p>
              )}
              {nameValid === true && !nameError && !isCheckingName && formData.name.trim() && (
                <p className="mt-1 text-sm text-green-600 dark:text-green-400">✓ שם זמין</p>
              )}
            </div>

            {/* Parent project selector removed - regular projects cannot become subprojects */}
            {/* Show parent project info when creating subproject */}
            {parentProjectId && !editingProject && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  פרויקט אב
                </label>
                <div className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400">
                  {availableProjects.find(p => p.id === parentProjectId)?.name || `פרויקט #${parentProjectId}`}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  תת-הפרויקט יקושר אוטומטית לפרויקט העל הזה
                </p>
              </div>
            )}
          </div>

          {/* Show description for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                תיאור
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Show image upload for all project types (parent, regular, subproject, editing) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              תמונת הפרויקט
            </label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleImageChange}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-300"
                  />
                  {imagePreview && (
                    <div className="mt-2">
                      <img
                        src={imagePreview}
                        alt="תצוגה מקדימה"
                        className="max-w-full h-48 object-cover rounded-md border border-gray-300 dark:border-gray-600"
                      />
                      {selectedImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImage(null)
                            setImagePreview(editingProject?.image_url ? getImageUrl(editingProject.image_url) : null)
                          }}
                          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          הסר תמונה
                        </button>
                      )}
                    </div>
                  )}
                </div>
          </div>

          {/* Contract upload - Only for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                חוזה עם הבניין
              </label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                  onChange={handleContractChange}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-300"
                />
                {selectedContractFile ? (
                  <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
                    <span>קובץ שנבחר: {selectedContractFile.name}</span>
                    <button
                      type="button"
                      onClick={handleClearContractSelection}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs"
                    >
                      הסר קובץ
                    </button>
                  </div>
                ) : existingContractUrl ? (
                  <div className="text-sm">
                    <a
                      href={existingContractUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      צפייה בחוזה שכבר שמור
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ניתן לצרף מסמך PDF / Word או תמונת חוזה חתום.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Show address and city for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  כתובת
                </label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  עיר
                </label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Show budget section for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  סוג הקלט לתקציב
                </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="monthly"
                    checked={budgetInputType === 'monthly'}
                    onChange={(e) => setBudgetInputType(e.target.value as 'monthly' | 'yearly')}
                    className="ml-2 text-blue-600 dark:text-blue-400"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">חודשי</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="yearly"
                    checked={budgetInputType === 'yearly'}
                    onChange={(e) => setBudgetInputType(e.target.value as 'monthly' | 'yearly')}
                    className="ml-2 text-blue-600 dark:text-blue-400"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">שנתי</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תקציב חודשי
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required={!!(parentProjectId || editingProject || isRegularProjectCreation)}
                  value={formData.budget_monthly}
                  onChange={(e) => {
                    const monthlyValue = parseFloat(e.target.value) || 0
                    if (monthlyValue < 0) {
                      setError('תקציב חודשי לא יכול להיות שלילי')
                      return
                    }
                    setError(null)
                    setFormData({
                      ...formData,
                      budget_monthly: monthlyValue,
                      budget_annual: Math.round(monthlyValue * 12 * 100) / 100
                    })
                  }}
                  disabled={budgetInputType === 'yearly'}
                  className={`w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    budgetInputType === 'yearly' ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תקציב שנתי
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required={!!(parentProjectId || editingProject || isRegularProjectCreation)}
                  value={formData.budget_annual}
                  onChange={(e) => {
                    const yearlyValue = parseFloat(e.target.value) || 0
                    if (yearlyValue < 0) {
                      setError('תקציב שנתי לא יכול להיות שלילי')
                      return
                    }
                    setError(null)
                    setFormData({
                      ...formData,
                      budget_annual: yearlyValue,
                      budget_monthly: Math.round(yearlyValue / 12 * 100) / 100
                    })
                  }}
                  disabled={budgetInputType === 'monthly'}
                  className={`w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    budgetInputType === 'monthly' ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50' : ''
                  }`}
                />
              </div>
            </div>
          </div>
          )}

          {/* Dates and duration - hidden for parent projects, shown for regular projects and subprojects */}
          {!isParentProject && (
            <div className="space-y-4">
              {/* Top row: Period selection and Contract duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(!editingProject || (editingProject && !isParentProject)) && (
                  <>
                    {editingProject && hasPastPeriods && contractPeriods.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          מתי יחול השינוי?
                        </label>
                        <div className="space-y-2 mb-3">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="editPeriodOption"
                              checked={editFromCurrentPeriod}
                              onChange={() => {
                                setEditFromCurrentPeriod(true)
                                // Reset to current period ID (will be set by checkPastPeriods)
                                if (contractPeriods.length > 0) {
                                  const currentPeriod = contractPeriods[contractPeriods.length - 1]
                                  setSelectedPeriodId(currentPeriod.period_id)
                                } else {
                                  setSelectedPeriodId(null)
                                }
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              מהחוזה הנוכחי ואילך
                            </span>
                          </label>
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="editPeriodOption"
                              checked={!editFromCurrentPeriod}
                              onChange={() => {
                                setEditFromCurrentPeriod(false)
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              מתקופה ספציפית
                            </span>
                          </label>
                        </div>
                        {!editFromCurrentPeriod && (
                          <>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              בחר תקופה להתחלה
                            </label>
                            <select
                              value={selectedPeriodId || ''}
                              onChange={(e) => {
                                const periodId = e.target.value ? parseInt(e.target.value) : null
                                setSelectedPeriodId(periodId)
                                // The start_date will be updated automatically by the useEffect
                              }}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">-- בחר תקופה --</option>
                              {contractPeriods.map((period) => {
                                const startDate = new Date(period.start_date).toLocaleDateString('he-IL')
                                const endDate = new Date(period.end_date).toLocaleDateString('he-IL')
                                const label = period.year_label 
                                  ? `${period.contract_year} - ${period.year_label} (${startDate} - ${endDate})`
                                  : `${period.contract_year} (${startDate} - ${endDate})`
                                return (
                                  <option key={period.period_id} value={period.period_id}>
                                    {label}
                                  </option>
                                )
                              })}
                            </select>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              בחר תקופה להתחלה. תאריך ההתחלה יתעדכן אוטומטית לתאריך תחילת התקופה שנבחרה, וממנו יספרו החודשים. תקופות קודמות לא ישתנו.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        משך החוזה בחודשים {(isParentProjectCreation || isRegularProjectCreation) ? '*' : ''}
                      </label>
                      <input
                        type="number"
                        min="1"
                        required={isParentProjectCreation || isRegularProjectCreation}
                        value={formData.contract_duration_months || ''}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || undefined
                          if (value !== undefined && value <= 0) {
                            setError('משך החוזה חייב להיות גדול מ-0')
                          } else {
                            setError(null)
                          }
                          setFormData({ ...formData, contract_duration_months: value })
                        }}
                        placeholder="לדוגמה: 3"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {!editingProject && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          כל תקופה תימשך מספר החודשים שצוין, ותקופות חדשות ייווצרו אוטומטית
                        </p>
                      )}
                      {editingProject && hasPastPeriods && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {editFromCurrentPeriod 
                            ? 'משך החוזה החדש יחול מהחוזה הנוכחי ואילך'
                            : 'משך החוזה החדש יחול מהתקופה שנבחרה ואילך'
                          }
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Bottom row: Start date and End date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    תאריך התחלה {(isParentProjectCreation || isRegularProjectCreation) ? '*' : ''}
                    {editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId) && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">(מחושב אוטומטית)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    required={isParentProjectCreation || isRegularProjectCreation}
                    value={formData.start_date || ''}
                    onChange={(e) => {
                      // Only allow manual editing if not editing a project with past periods
                      if (!editingProject || !hasPastPeriods) {
                        setFormData({ ...formData, start_date: e.target.value })
                        setError(null)
                      }
                    }}
                    readOnly={editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId) ? true : false}
                    className={`w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId)
                        ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-700'
                    }`}
                  />
                  {editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId) && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {editFromCurrentPeriod 
                        ? 'תאריך ההתחלה מחושב אוטומטית מתאריך תחילת החוזה הנוכחי'
                        : 'תאריך ההתחלה מחושב אוטומטית מתאריך תחילת התקופה שנבחרה'
                      }
                    </p>
                  )}
                </div>

                {editingProject && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      תאריך סיום {calculatedEndDate && <span className="text-xs text-blue-600 dark:text-blue-400">(מחושב אוטומטית)</span>}
                    </label>
                    <input
                      type="date"
                      value={formData.end_date || ''}
                      onChange={(e) => {
                        // Only allow manual editing if not editing a project with past periods and calculated end date
                        if (!editingProject || !hasPastPeriods || !calculatedEndDate) {
                          setFormData({ ...formData, end_date: e.target.value })
                          setError(null)
                        }
                      }}
                      min={formData.start_date || undefined}
                      readOnly={!!calculatedEndDate || (editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId))}
                      className={`w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        calculatedEndDate || (editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId))
                          ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                          : 'bg-white dark:bg-gray-700'
                      }`}
                    />
                    {calculatedEndDate && formData.contract_duration_months && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {editingProject && hasPastPeriods && (editFromCurrentPeriod || selectedPeriodId)
                          ? `תאריך הסיום מחושב אוטומטית: ${new Date(calculatedEndDate).toLocaleDateString('he-IL')} (תאריך התחלה + ${formData.contract_duration_months} חודשים)`
                          : `התקופה תסתיים ב-${new Date(calculatedEndDate).toLocaleDateString('he-IL')} (לאחר ${formData.contract_duration_months} חודשים)`
                        }
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Removed num_residents and monthly_price_per_apartment inputs */}

          {/* Fund Section - Only for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <input
                id="hasFund"
                type="checkbox"
                checked={hasFund}
              disabled={existingFundLocked}
                onChange={(e) => {
                  setHasFund(e.target.checked)
                  if (!e.target.checked) {
                    setMonthlyFundAmount(0)
                  }
                }}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="hasFund" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                הוסף קופה לפרויקט
              </label>
            </div>
          {existingFundLocked && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              לעריכת הקופה הקיימת יש להיכנס לדף פרטי הפרויקט ולטפל מתוך קומפוננטת התקציב/קופה.
            </p>
          )}
            
            {hasFund && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  סכום חודשי לקופה (₪) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required={hasFund}
                  value={monthlyFundAmount}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0
                  if (value < 0) {
                    setError('סכום הקופה לא יכול להיות שלילי')
                    return
                  }
                  setError(null)
                  setMonthlyFundAmount(value)
                }}
                disabled={existingFundLocked}
                  placeholder="הכנס סכום חודשי"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  הסכום יתווסף לקופה כל חודש באופן אוטומטי
                </p>
              </div>
            )}
            </div>
          )}

          {/* Category Budgets Section - Only for subprojects, regular project creation, or editing non-parent projects */}
          {(parentProjectId || (editingProject && !isParentProject) || isRegularProjectCreation) && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                תקציבים לקטגוריות
              </label>
              <button
                type="button"
                onClick={(e) => {
                  addCategoryBudget()
                  // Remove focus immediately after click
                  setTimeout(() => {
                    e.currentTarget.blur()
                  }, 0)
                }}
                disabled={!hasAvailableBudgetCategories}
                className={`px-3 py-1 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  hasAvailableBudgetCategories
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-600 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                }`}
              >
                + הוסף תקציב לקטגוריה
              </button>
            </div>
            {!hasAvailableBudgetCategories && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                לכל הקטגוריות בפרויקט כבר הוגדר תקציב. ניתן לערוך או למחוק תקציבים קיימים מתוך דף פרטי הפרויקט.
              </p>
            )}
            {editingProject && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                עריכת תקציבים קיימים מתבצעת מעמוד פרטי הפרויקט. בטופס זה ניתן רק להוסיף תקציב לקטגוריות שעדיין לא קיבלו תקציב.
              </p>
            )}
            {editingProject && existingBudgets.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/40 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2 text-sm">
                <div className="font-medium text-gray-700 dark:text-gray-200">תקציבים שכבר קיימים:</div>
                {existingBudgets.map(budget => (
                  <div key={budget.id} className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span>{budget.category}</span>
                    <span>{Number(budget.base_amount ?? budget.amount).toLocaleString('he-IL')} ₪</span>
                  </div>
                ))}
              </div>
            )}
            
            {categoryBudgets.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                {editingProject
                  ? 'אין תקציבים חדשים להוספה. ניתן להוסיף תקציב רק לקטגוריות שעדיין לא קיבלו תקציב בעבר.'
                  : 'אין תקציבים לקטגוריות. לחץ על "הוסף תקציב לקטגוריה" כדי להוסיף תקציב לקטגוריה ספציפית (למשל: חשמל, ניקיון).'}
              </p>
            )}

            <div className="space-y-3">
              {categoryBudgets.map((budget, index) => (
                <div key={index} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">תקציב #{index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeCategoryBudget(index)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm"
                    >
                      מחק
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        קטגוריה *
                      </label>
                      {(() => {
                        if (expenseCategories.length === 0) {
                          return (
                            <>
                              <select
                                value=""
                                disabled
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                              >
                                <option>אין קטגוריות זמינות</option>
                              </select>
                              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                                אין קטגוריות זמינות. הוסף קטגוריות בהגדרות תחילה.
                              </p>
                            </>
                          )
                        }
                        const reserved = new Set<string>(existingBudgetCategories)
                        categoryBudgets.forEach((b, i) => {
                          if (i !== index && b.category_id) {
                            const cat = expenseCategories.find(c => c.id === b.category_id)
                            if (cat) reserved.add(cat.name)
                          }
                        })
                        const selectableCategories = expenseCategories.filter(
                          cat => !reserved.has(cat.name) || cat.id === budget.category_id
                        )
                        return (
                          <>
                            <select
                              value={budget.category_id || ''}
                              onChange={(e) => updateCategoryBudget(index, 'category_id', parseInt(e.target.value))}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">בחר קטגוריה</option>
                              {selectableCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                            {selectableCategories.length === 0 && (
                              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                                כל הקטגוריות כבר קיבלו תקציב. הסר תקציב מהרשימה או ערוך אותו מדף הפרויקט.
                              </p>
                            )}
                          </>
                        )
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        סכום (₪) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={budget.amount}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0
                          if (value < 0) {
                            setError('סכום התקציב לא יכול להיות שלילי')
                            return
                          }
                          setError(null)
                          updateCategoryBudget(index, 'amount', value)
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        סוג תקופה *
                      </label>
                      <select
                        value={budget.period_type || 'Annual'}
                        onChange={(e) => {
                          updateCategoryBudget(index, 'period_type', e.target.value)
                          // If changing to Annual and start_date exists, calculate end_date
                          if (e.target.value === 'Annual' && budget.start_date) {
                            const startDate = new Date(budget.start_date)
                            const endDate = new Date(startDate)
                            endDate.setFullYear(endDate.getFullYear() + 1)
                            endDate.setDate(endDate.getDate() - 1)
                            updateCategoryBudget(index, 'end_date', endDate.toISOString().split('T')[0])
                          } else if (e.target.value === 'Monthly') {
                            updateCategoryBudget(index, 'end_date', null)
                          }
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="Annual">שנתי</option>
                        <option value="Monthly">חודשי</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                          תאריך התחלה *
                        </label>
                        {formData.start_date && (
                          <button
                            type="button"
                            onClick={() => updateCategoryBudget(index, 'start_date', formData.start_date)}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            לפי תחילת פרויקט
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        value={budget.start_date}
                        onChange={(e) => {
                          const newStartDate = e.target.value
                          updateCategoryBudget(index, 'start_date', newStartDate)
                          // If end_date exists and is before new start_date, clear it
                          if (budget.end_date && newStartDate && new Date(budget.end_date) <= new Date(newStartDate)) {
                            if (budget.period_type === 'Annual') {
                              // Recalculate end_date for Annual budgets
                              const startDate = new Date(newStartDate)
                              const endDate = new Date(startDate)
                              endDate.setFullYear(endDate.getFullYear() + 1)
                              endDate.setDate(endDate.getDate() - 1)
                              updateCategoryBudget(index, 'end_date', endDate.toISOString().split('T')[0])
                            }
                          }
                        }}
                        max={budget.end_date || undefined}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    {budget.period_type === 'Annual' && budget.end_date && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          תאריך סיום
                        </label>
                        <input
                          type="date"
                        value={budget.end_date}
                        onChange={(e) => {
                          const newEndDate = e.target.value
                          // Validate that end_date is after start_date
                          if (budget.start_date && newEndDate && new Date(newEndDate) <= new Date(budget.start_date)) {
                            setError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה')
                            return
                          }
                          setError(null)
                          updateCategoryBudget(index, 'end_date', newEndDate)
                        }}
                        min={budget.start_date || undefined}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        readOnly={budget.period_type === 'Annual'}
                      />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'שומר...' : (editingProject ? 'שמור שינויים' : (parentProjectId ? 'צור תת-פרויקט' : 'צור פרויקט'))}
            </button>
          </div>
        </form>

        {/* Fund Setup Modal - shown after project creation if fund is enabled */}
        {showFundSetupModal && createdProjectId && (
          <FundSetupModal
            isOpen={showFundSetupModal}
            onClose={() => {
              setShowFundSetupModal(false)
              setCreatedProjectId(null)
              onClose()
              resetForm()
              // Still call onSuccess with the created project (fund was not created)
              if (createdProjectId) {
                ProjectAPI.getProject(createdProjectId).then(onSuccess).catch(() => {
                  // If we can't fetch the project, still call onSuccess with a basic object
                  onSuccess({ id: createdProjectId } as Project)
                })
              }
            }}
            onSuccess={async () => {
              // Update project to set has_fund=true after fund is created
              try {
                await ProjectAPI.updateProject(createdProjectId, {
                  has_fund: true,
                  monthly_fund_amount: monthlyFundAmount
                } as any)
              } catch (err) {
                console.error('Error updating project with fund flag:', err)
                // Continue anyway - fund was created
              }
              setShowFundSetupModal(false)
              setCreatedProjectId(null)
              onClose()
              resetForm()
              // Fetch the updated project with fund data
              if (createdProjectId) {
                ProjectAPI.getProject(createdProjectId).then(onSuccess).catch(() => {
                  // If we can't fetch the project, still call onSuccess with a basic object
                  onSuccess({ id: createdProjectId } as Project)
                })
              }
            }}
            projectId={createdProjectId}
            projectStartDate={formData.start_date || null}
            monthlyFundAmount={monthlyFundAmount}
          />
        )}
      </div>
    </div>
  )
}

export default CreateProjectModal

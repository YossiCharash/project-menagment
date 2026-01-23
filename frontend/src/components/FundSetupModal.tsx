import React, { useState } from 'react'
import api from '../lib/api'
import { calculateMonthlyIncomeAccrual } from '../utils/calculations'
import { parseLocalDate } from '../lib/utils'

interface FundSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: number
  projectStartDate: string | null
  monthlyFundAmount: number
}

type FundSetupType = 
  | 'from_contract_start'  // הוסף סכום מתחילת החוזה
  | 'one_time_and_monthly' // הוסף סכום חד פעמי והתחל מהחודש
  | 'only_from_month'      // רק התחל מהחודש
  | 'only_one_time'        // רק סכום חד פעמי

/** When project starts in previous year and user chose from_contract_start: only through end of start year, or also through today */
type FundScopePreviousYear = 'only_period' | 'also_current' | null

const FundSetupModal: React.FC<FundSetupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  projectStartDate,
  monthlyFundAmount
}) => {
  const [setupType, setSetupType] = useState<FundSetupType>('from_contract_start')
  const [oneTimeAmount, setOneTimeAmount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fundScopePreviousYear, setFundScopePreviousYear] = useState<FundScopePreviousYear>(null)

  if (!isOpen) return null

  const startDateParsed = projectStartDate ? parseLocalDate(projectStartDate) : null
  const isProjectStartInPreviousYear = !!(
    startDateParsed &&
    startDateParsed.getFullYear() < new Date().getFullYear()
  )
  const showPreviousYearScope = isProjectStartInPreviousYear && setupType === 'from_contract_start'
  const mustChooseScope = showPreviousYearScope && fundScopePreviousYear === null

  const handleSubmit = async () => {
    if (mustChooseScope) return
    setLoading(true)
    setError(null)

    try {
      let initialBalance = 0
      let lastMonthlyAddition: string | null = null
      let finalMonthlyAmount = monthlyFundAmount

      const today = new Date()
      today.setHours(12, 0, 0, 0)
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      switch (setupType) {
        case 'from_contract_start':
          if (projectStartDate && startDateParsed) {
            if (showPreviousYearScope && fundScopePreviousYear === 'only_period') {
              const endOfStartYear = new Date(startDateParsed.getFullYear(), 11, 31)
              initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, startDateParsed, endOfStartYear)
              lastMonthlyAddition = `${endOfStartYear.getFullYear()}-12-31`
              finalMonthlyAmount = 0
            } else {
              initialBalance = calculateMonthlyIncomeAccrual(monthlyFundAmount, startDateParsed, today)
              lastMonthlyAddition = todayStr
              finalMonthlyAmount = monthlyFundAmount
            }
          }
          break

        case 'one_time_and_monthly':
          initialBalance = oneTimeAmount
          lastMonthlyAddition = todayStr
          finalMonthlyAmount = monthlyFundAmount
          break

        case 'only_from_month':
          initialBalance = 0
          lastMonthlyAddition = todayStr
          finalMonthlyAmount = monthlyFundAmount
          break

        case 'only_one_time':
          initialBalance = oneTimeAmount
          lastMonthlyAddition = null
          finalMonthlyAmount = 0
          break
      }

      // Create fund with the calculated parameters
      const params = new URLSearchParams()
      params.append('monthly_amount', finalMonthlyAmount.toString())
      params.append('initial_balance', initialBalance.toString())
      if (lastMonthlyAddition) {
        params.append('last_monthly_addition', lastMonthlyAddition)
      }

      await api.post(`/projects/${projectId}/fund?${params.toString()}`)
      
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Error creating fund:', err)
      setError(err.response?.data?.detail || 'יצירת הקופה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setSetupType('from_contract_start')
      setOneTimeAmount(0)
      setFundScopePreviousYear(null)
      setError(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            הגדרת קופה לפרויקט
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            בחר כיצד תרצה להגדיר את הקופה:
          </p>

          <div className="space-y-3">
            <label className="flex items-start p-4 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="setupType"
                value="from_contract_start"
                checked={setupType === 'from_contract_start'}
                onChange={() => {
                  setSetupType('from_contract_start')
                  if (!isProjectStartInPreviousYear) setFundScopePreviousYear(null)
                }}
                className="mt-1 mr-3 text-blue-600 dark:text-blue-400"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  הוסף סכום מתחילת החוזה
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  הקופה תתחיל עם סכום מחושב מתחילת החוזה עד היום ({monthlyFundAmount.toLocaleString('he-IL')} ₪ לחודש), ותמשיך להוסיף כל חודש
                </div>
                {showPreviousYearScope && (
                  <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      הפרויקט מתחיל בשנה קודמת. איך ליצור את הקופה?
                    </p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'only_period'}
                          onChange={() => setFundScopePreviousYear('only_period')}
                          className="text-amber-600 dark:text-amber-400"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">רק עד סוף שנת ההתחלה</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="fundScopePreviousYear"
                          checked={fundScopePreviousYear === 'also_current'}
                          onChange={() => setFundScopePreviousYear('also_current')}
                          className="text-amber-600 dark:text-amber-400"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">גם לתקופה הנוכחית (עד היום והלאה)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-start p-4 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="setupType"
                value="one_time_and_monthly"
                checked={setupType === 'one_time_and_monthly'}
                onChange={() => { setSetupType('one_time_and_monthly'); setFundScopePreviousYear(null) }}
                className="mt-1 mr-3 text-blue-600 dark:text-blue-400"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  הוסף סכום חד פעמי והתחל מהחודש
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  הקופה תתחיל עם סכום חד פעמי שתזין, ותמשיך להוסיף {monthlyFundAmount.toLocaleString('he-IL')} ₪ כל חודש מהחודש
                </div>
                {setupType === 'one_time_and_monthly' && (
                  <div className="mt-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={oneTimeAmount || ''}
                      onChange={(e) => setOneTimeAmount(parseFloat(e.target.value) || 0)}
                      placeholder="הכנס סכום חד פעמי"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-start p-4 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="setupType"
                value="only_from_month"
                checked={setupType === 'only_from_month'}
                onChange={() => { setSetupType('only_from_month'); setFundScopePreviousYear(null) }}
                className="mt-1 mr-3 text-blue-600 dark:text-blue-400"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  רק התחל מהחודש
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  הקופה תתחיל עם יתרה 0 ותמשיך להוסיף {monthlyFundAmount.toLocaleString('he-IL')} ₪ כל חודש מהחודש
                </div>
              </div>
            </label>

            <label className="flex items-start p-4 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="radio"
                name="setupType"
                value="only_one_time"
                checked={setupType === 'only_one_time'}
                onChange={() => { setSetupType('only_one_time'); setFundScopePreviousYear(null) }}
                className="mt-1 mr-3 text-blue-600 dark:text-blue-400"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  רק סכום חד פעמי
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  הקופה תתחיל עם סכום חד פעמי שתזין, ללא הוספה חודשית
                </div>
                {setupType === 'only_one_time' && (
                  <div className="mt-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={oneTimeAmount || ''}
                      onChange={(e) => setOneTimeAmount(parseFloat(e.target.value) || 0)}
                      placeholder="הכנס סכום חד פעמי"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                loading ||
                mustChooseScope ||
                (setupType === 'one_time_and_monthly' && oneTimeAmount <= 0) ||
                (setupType === 'only_one_time' && oneTimeAmount <= 0)
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'יוצר...' : 'צור קופה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FundSetupModal

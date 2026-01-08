import React, { useState } from 'react'
import { ProjectWithFinance, TransactionCreate } from '../types/api'
import { ProjectAPI, TransactionAPI } from '../lib/apiClient'
import { mockDashboardSnapshot } from '../mockData/dashboardData'

// Test component to demonstrate sub-project creation and transaction posting
const TestComponent: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`])
  }

  const testCreateSubProject = async () => {
    setLoading(true)
    try {
      addResult('Starting sub-project creation test...')
      
      // Test 1: Create a sub-project
      const subProjectData = {
        name: 'מגדל רמת גן - בניין ג\'',
        description: 'בניין מגורים נוסף',
        start_date: '2024-06-01',
        budget_monthly: 20000,
        budget_annual: 240000,
        address: 'רחוב הרצל 15',
        city: 'רמת גן',
        relation_project: 1, // Parent project ID
        manager_id: 1
      }

      const createdProject = await ProjectAPI.createProject(subProjectData)
      addResult(`✅ Sub-project created successfully: ${createdProject.name} (ID: ${createdProject.id})`)
      addResult(`   Parent project ID: ${createdProject.relation_project}`)

      // Test 2: Verify it appears in project list
      const projects = await ProjectAPI.getProjects()
      const subProjects = projects.filter(p => p.relation_project === 1)
      addResult(`✅ Found ${subProjects.length} sub-projects under parent project 1`)

      return createdProject
    } catch (error: any) {
      addResult(`❌ Sub-project creation failed: ${error.message}`)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const testCreateExpenseTransaction = async (projectId: number) => {
    setLoading(true)
    try {
      addResult('Starting expense transaction test...')
      
      // Test 3: Create an expense transaction (negative amount)
      const expenseData: TransactionCreate = {
        project_id: projectId,
        tx_date: '2024-10-20',
        type: 'Expense',
        amount: 1200, // Will be converted to negative by API client
        description: 'חשבון חשמל',
        category: 'electricity',
        notes: 'חשבון חשמל חודש אוקטובר',
        is_exceptional: false
      }

      const createdTransaction = await TransactionAPI.createTransaction(expenseData)
      addResult(`✅ Expense transaction created: ${createdTransaction.description}`)
      addResult(`   Amount: ${createdTransaction.amount} (should be negative)`)
      addResult(`   Project ID: ${createdTransaction.project_id}`)

      // Test 4: Verify transaction appears in project transactions
      const transactions = await TransactionAPI.getProjectTransactions(projectId)
      const expenseTransactions = transactions.filter(t => t.type === 'Expense')
      addResult(`✅ Found ${expenseTransactions.length} expense transactions for project ${projectId}`)

      return createdTransaction
    } catch (error: any) {
      addResult(`❌ Expense transaction creation failed: ${error.message}`)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const testCreateIncomeTransaction = async (projectId: number) => {
    setLoading(true)
    try {
      addResult('Starting income transaction test...')
      
      // Test 5: Create an income transaction (positive amount)
      const incomeData: TransactionCreate = {
        project_id: projectId,
        tx_date: '2024-10-01',
        type: 'Income',
        amount: 210000,
        description: 'דמי שכירות חודש אוקטובר',
        category: 'rent',
        notes: 'דמי שכירות מדיירים',
        is_exceptional: false
      }

      const createdTransaction = await TransactionAPI.createTransaction(incomeData)
      addResult(`✅ Income transaction created: ${createdTransaction.description}`)
      addResult(`   Amount: ${createdTransaction.amount} (should be positive)`)
      addResult(`   Project ID: ${createdTransaction.project_id}`)

      return createdTransaction
    } catch (error: any) {
      addResult(`❌ Income transaction creation failed: ${error.message}`)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const testDashboardUpdate = async (projectId: number) => {
    setLoading(true)
    try {
      addResult('Testing dashboard data update...')
      
      // Test 6: Get updated project financial data
      const projectWithFinance = await ProjectAPI.getProjectWithFinance(projectId)
      addResult(`✅ Project financial data retrieved`)
      addResult(`   Income: ${projectWithFinance.income_month_to_date}`)
      addResult(`   Expense: ${projectWithFinance.expense_month_to_date}`)
      addResult(`   Profit: ${projectWithFinance.total_value}`)

      // Test 7: Get dashboard snapshot
      const dashboardSnapshot = await DashboardAPI.getDashboardSnapshot()
      addResult(`✅ Dashboard snapshot retrieved`)
      addResult(`   Total projects: ${dashboardSnapshot.projects.length}`)
      addResult(`   Total income: ${dashboardSnapshot.summary.total_income}`)
      addResult(`   Total expense: ${dashboardSnapshot.summary.total_expense}`)
      addResult(`   Total profit: ${dashboardSnapshot.summary.total_profit}`)

    } catch (error: any) {
      addResult(`❌ Dashboard update test failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const runAllTests = async () => {
    setTestResults([])
    addResult('🚀 Starting comprehensive test suite...')
    
    try {
      // Test 1: Create sub-project
      const subProject = await testCreateSubProject()
      
      // Test 2: Create expense transaction
      await testCreateExpenseTransaction(subProject.id)
      
      // Test 3: Create income transaction
      await testCreateIncomeTransaction(subProject.id)
      
      // Test 4: Verify dashboard updates
      await testDashboardUpdate(subProject.id)
      
      addResult('🎉 All tests completed successfully!')
      
    } catch (error) {
      addResult('💥 Test suite failed - check individual test results above')
    }
  }

  const testTransactionWithoutAttachments = async () => {
    setLoading(true)
    try {
      addResult('Testing transaction without attachments (should trigger alert)...')
      
      const transactionData: TransactionCreate = {
        project_id: 1,
        tx_date: '2024-10-20',
        type: 'Expense',
        amount: 500,
        description: 'הוצאה ללא אישור',
        category: 'other',
        notes: 'הוצאה ללא אישור - אמור להציג התראה',
        is_exceptional: false
      }

      const createdTransaction = await TransactionAPI.createTransaction(transactionData)
      addResult(`✅ Transaction without attachment created: ${createdTransaction.description}`)
      addResult(`   File path: ${createdTransaction.file_path || 'None (should trigger alert)'}`)

    } catch (error: any) {
      addResult(`❌ Transaction without attachment test failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setTestResults([])
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">בדיקות פונקציונליות</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          onClick={runAllTests}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'מריץ בדיקות...' : 'הרץ כל הבדיקות'}
        </button>
        
        <button
          onClick={testTransactionWithoutAttachments}
          disabled={loading}
          className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          {loading ? 'בודק...' : 'בדוק הוצאה ללא אישור'}
        </button>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">תוצאות בדיקות</h2>
        <button
          onClick={clearResults}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          נקה תוצאות
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
        {testResults.length === 0 ? (
          <p className="text-gray-500 text-center">אין תוצאות בדיקות עדיין</p>
        ) : (
          <div className="space-y-1">
            {testResults.map((result, index) => (
              <div key={index} className="text-sm font-mono">
                {result}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">דוגמאות נתונים</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-700">Dashboard Snapshot Example:</h4>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
              {JSON.stringify(mockDashboardSnapshot, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestComponent

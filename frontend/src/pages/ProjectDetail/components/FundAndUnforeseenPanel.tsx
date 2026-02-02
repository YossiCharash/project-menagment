import { useRef, useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { UnforeseenTransaction } from '../../../types/api'

interface FundAndUnforeseenPanelProps {
  fundData: any
  fundLoading: boolean
  unforeseenTransactions: UnforeseenTransaction[]
  unforeseenTransactionsLoading: boolean
  onShowFundTransactionsModal: () => void
  onShowEditFundModal: () => void
  onShowUnforeseenTransactionsModal: () => void
  onShowCreateUnforeseenTransactionModal: () => void
  onResetUnforeseenForm: () => void
  onViewUnforeseenTransaction?: (tx: UnforeseenTransaction) => void
}

export default function FundAndUnforeseenPanel({
  fundData,
  fundLoading,
  unforeseenTransactions,
  unforeseenTransactionsLoading,
  onShowFundTransactionsModal,
  onShowEditFundModal,
  onShowUnforeseenTransactionsModal,
  onShowCreateUnforeseenTransactionModal,
  onResetUnforeseenForm,
  onViewUnforeseenTransaction
}: FundAndUnforeseenPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [needsScrolling, setNeedsScrolling] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)

  useEffect(() => {
    const checkScrolling = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current
        setNeedsScrolling(container.scrollHeight > container.clientHeight)
        const { scrollTop, scrollHeight, clientHeight } = container
        setIsAtTop(scrollTop <= 1)
        setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 1)
      }
    }
    checkScrolling()
    const t = setTimeout(checkScrolling, 100)
    window.addEventListener('resize', checkScrolling)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', checkScrolling)
    }
  }, [unforeseenTransactions, unforeseenTransactionsLoading])

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Fund Card - Balanced size */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">פרטי הקופה</h3>
          <div className="flex items-center gap-1.5">
            {fundData?.transactions?.length > 0 && (
              <button
                onClick={onShowFundTransactionsModal}
                className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs flex items-center gap-1 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                ({fundData.transactions.length})
              </button>
            )}
            {fundData && (
              <button
                onClick={onShowEditFundModal}
                className="px-2.5 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs whitespace-nowrap"
              >
                ערוך
              </button>
            )}
          </div>
        </div>
        {fundLoading ? (
          <div className="text-center py-2 text-gray-500 dark:text-gray-400 text-sm">טוען...</div>
        ) : fundData ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 min-w-0">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">יתרה נוכחית</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{fundData.current_balance.toLocaleString('he-IL')} ₪</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2.5 min-w-0">
              <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-0.5">כמה נכנס</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-100">{fundData.initial_total.toLocaleString('he-IL')} ₪</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 min-w-0">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-0.5">כמה יצא</p>
              <p className="text-lg font-bold text-red-900 dark:text-red-100">{fundData.total_deductions.toLocaleString('he-IL')} ₪</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-2.5 min-w-0">
              <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-0.5">סכום חודשי</p>
              <p className="text-lg font-bold text-purple-900 dark:text-purple-100">{(fundData.monthly_amount || 0).toLocaleString('he-IL')} ₪</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2 text-gray-500 dark:text-gray-400 text-sm">אין קופה</div>
        )}
      </div>

      {/* Unforeseen - Readable list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 mb-2 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">עסקאות לא צפויות</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {unforeseenTransactions.length > 0 && (
              <button
                onClick={onShowUnforeseenTransactionsModal}
                className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                ({unforeseenTransactions.length})
              </button>
            )}
            <button
              onClick={() => {
                try { onResetUnforeseenForm() } catch (_) {}
                onShowCreateUnforeseenTransactionModal()
              }}
              className="px-2.5 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs"
            >
              +
            </button>
          </div>
        </div>
        {unforeseenTransactionsLoading ? (
          <div className="text-center py-2 text-gray-500 text-sm">טוען...</div>
        ) : unforeseenTransactions.length > 0 ? (
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 max-h-[220px] pr-1 space-y-1.5 overflow-y-auto"
            style={{ overscrollBehavior: (isAtTop || isAtBottom) ? 'auto' : 'contain' }}
            onScroll={() => {
              if (!scrollContainerRef.current) return
              const c = scrollContainerRef.current
              setIsAtTop(c.scrollTop <= 1)
              setIsAtBottom(c.scrollTop + c.clientHeight >= c.scrollHeight - 1)
            }}
            onWheel={(e) => {
              if (!scrollContainerRef.current || !needsScrolling) return
              const c = scrollContainerRef.current
              const atTop = c.scrollTop <= 1
              const atBottom = c.scrollTop + c.clientHeight >= c.scrollHeight - 1
              if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) return
              e.preventDefault()
              e.stopPropagation()
              c.scrollTop += e.deltaY
            }}
          >
            {unforeseenTransactions.map((tx) => (
              <div
                key={tx.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                onClick={() => (onViewUnforeseenTransaction ? onViewUnforeseenTransaction(tx) : onShowUnforeseenTransactionsModal())}
              >
                <div className="grid grid-cols-3 items-center gap-2">
                  <span className="text-sm text-gray-900 dark:text-white truncate text-start">
                    {tx.description || `#${tx.id}`}
                  </span>
                  <span className="flex justify-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
                        tx.status === 'executed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : tx.status === 'waiting_for_approval'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {tx.status === 'draft' && 'טיוטה'}
                      {tx.status === 'waiting_for_approval' && 'מחכה לאישור'}
                      {tx.status === 'executed' && 'בוצע'}
                    </span>
                  </span>
                  <span className={`text-sm font-bold shrink-0 text-end ${tx.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.profit_loss >= 0 ? '+' : ''}{tx.profit_loss.toLocaleString('he-IL')} ₪
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  הכנסה: {(tx.total_incomes ?? tx.income_amount).toLocaleString('he-IL')} ₪ | הוצאות: {tx.total_expenses.toLocaleString('he-IL')} ₪
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-3 text-gray-500">
            <p className="mb-1.5 text-sm">אין עסקאות</p>
            <button
              onClick={() => { try { onResetUnforeseenForm() } catch (_) {}; onShowCreateUnforeseenTransactionModal() }}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
            >
              עסקה חדשה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

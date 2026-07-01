import { Package, CheckCircle2, Plus, Trash2, Pencil } from 'lucide-react'
import type { Delivery } from '../../types/api'
import { ACCENT, PALETTE, formatDate } from './constants'

interface DeliveryListProps {
  deliveries: Delivery[]
  onMarkDelivered: (deliveryId: number) => void
  onAddDelivery: () => void
  onEditDelivery: (delivery: Delivery) => void
  onDeleteDelivery: (deliveryId: number) => void
}

const DELIVERED_GREEN = '#12B76A'

/** "תיק משלוחים" — the deliveries tab of the apartment panel. */
export default function DeliveryList({
  deliveries,
  onMarkDelivered,
  onAddDelivery,
  onEditDelivery,
  onDeleteDelivery,
}: DeliveryListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400">תיק משלוחים</span>
        <button
          type="button"
          onClick={onAddDelivery}
          className="text-xs font-bold rounded-lg px-3 py-1.5 flex items-center gap-1.5 border"
          style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
        >
          <Plus className="w-4 h-4" />
          משלוח
        </button>
      </div>
      {deliveries.map((delivery) => {
        const pending = delivery.status === 'pending'
        const color = pending ? PALETTE.delivery : DELIVERED_GREEN
        const Icon = pending ? Package : CheckCircle2
        return (
          <div
            key={delivery.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3 flex items-center gap-3"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}1F`, color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 leading-tight min-w-0">
              <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{delivery.title}</div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                {delivery.meta ?? (delivery.received_at ? `נמסר ${formatDate(delivery.received_at)}` : formatDate(delivery.created_at))}
              </div>
            </div>
            {pending ? (
              <button
                type="button"
                onClick={() => onMarkDelivered(delivery.id)}
                className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: PALETTE.delivery, background: `${PALETTE.delivery}1F` }}
              >
                סמן כנמסר
              </button>
            ) : (
              <span
                className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: DELIVERED_GREEN, background: `${DELIVERED_GREEN}1F` }}
              >
                נמסר
              </span>
            )}
            <button
              type="button"
              onClick={() => onEditDelivery(delivery)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              aria-label="עריכת משלוח"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteDelivery(delivery.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label="מחיקת משלוח"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      })}
      {deliveries.length === 0 && (
        <div className="text-xs font-semibold text-gray-400 text-center py-6">אין משלוחים לדירה זו</div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FolderTree,
  FolderOpen,
  ChevronLeft,
  ChevronDown,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Package,
  Archive,
  Upload,
} from 'lucide-react'
import {
  cemsApi,
  type AssetCategoryTreeNode,
  type CategoryItemRead,
} from '../../lib/cemsApi'

// ---- Style Constants --------------------------------------------------------

const MODAL_OVERLAY = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4'
const MODAL_PANEL = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors'
const BTN_SECONDARY = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ---- Helper: Flatten tree for parent select ---------------------------------

function flattenTree(
  nodes: AssetCategoryTreeNode[],
  depth = 0,
): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = []
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth })
    if (node.children.length > 0 && depth < 1) {
      result.push(...flattenTree(node.children, depth + 1))
    }
  }
  return result
}

// ---- Helper: Find node by ID ------------------------------------------------

function findNode(
  nodes: AssetCategoryTreeNode[],
  id: string,
): AssetCategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

// ---- Helper: Build breadcrumb path ------------------------------------------

function buildBreadcrumb(
  nodes: AssetCategoryTreeNode[],
  targetId: string,
  path: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const currentPath = [...path, node.name]
    if (node.id === targetId) return currentPath
    const found = buildBreadcrumb(node.children, targetId, currentPath)
    if (found) return found
  }
  return null
}

// ---- Main Page Component ----------------------------------------------------

export default function CategoriesPage() {
  const [tree, setTree] = useState<AssetCategoryTreeNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<CategoryItemRead[]>([])
  const [includeDescendants, setIncludeDescendants] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const dataLoadedRef = useRef(false)

  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await cemsApi.getCategoryTree()
      setTree(res.data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!dataLoadedRef.current) {
      dataLoadedRef.current = true
      loadTree()
    }
  }, [loadTree])

  const loadItems = useCallback(async (categoryId: string, descendants: boolean) => {
    try {
      const res = await cemsApi.getCategoryItems(categoryId, descendants)
      setItems(res.data)
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadItems(selectedId, includeDescendants)
    }
  }, [selectedId, includeDescendants, loadItems])

  function handleSelect(id: string) {
    setSelectedId(id)
    setIncludeDescendants(false)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAddRoot() {
    setAddParentId(null)
    setShowAddModal(true)
  }

  function handleAddChild(parentId: string) {
    setAddParentId(parentId)
    setShowAddModal(true)
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`למחוק את הקטגוריה "${name}"?`)) return
    try {
      await cemsApi.deleteCategory(id)
      if (selectedId === id) {
        setSelectedId(null)
        setItems([])
      }
      await loadTree()
    } catch (err: any) {
      if (err?.response?.status === 409) {
        alert('לא ניתן למחוק קטגוריה שמשויכים אליה פריטים')
      } else {
        alert('שגיאה במחיקת הקטגוריה')
      }
    }
  }

  async function handleImageUpload(categoryId: string, file: File) {
    try {
      await cemsApi.uploadCategoryImage(categoryId, file)
      await loadTree()
    } catch {
      // silent
    }
  }

  const selectedNode = selectedId ? findNode(tree, selectedId) : null
  const breadcrumb = selectedId ? buildBreadcrumb(tree, selectedId) : null

  return (
    <div className="flex gap-6 min-h-[600px]" dir="rtl">
      {/* Right pane: Tree sidebar */}
      <TreeSidebar
        tree={tree}
        loading={loading}
        selectedId={selectedId}
        expanded={expanded}
        onSelect={handleSelect}
        onToggleExpand={toggleExpand}
        onAddRoot={handleAddRoot}
      />

      {/* Left pane: Detail */}
      <DetailPanel
        node={selectedNode}
        breadcrumb={breadcrumb}
        items={items}
        includeDescendants={includeDescendants}
        onToggleDescendants={() => setIncludeDescendants((prev) => !prev)}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onImageUpload={handleImageUpload}
        onSelect={handleSelect}
      />

      {/* Add modal */}
      {showAddModal && (
        <AddCategoryModal
          tree={tree}
          defaultParentId={addParentId}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false)
            loadTree()
          }}
        />
      )}
    </div>
  )
}

// ---- Tree Sidebar -----------------------------------------------------------

interface TreeSidebarProps {
  tree: AssetCategoryTreeNode[]
  loading: boolean
  selectedId: string | null
  expanded: Set<string>
  onSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onAddRoot: () => void
}

function TreeSidebar({ tree, loading, selectedId, expanded, onSelect, onToggleExpand, onAddRoot }: TreeSidebarProps) {
  return (
    <div className="w-1/3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FolderTree className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">קטגוריות</h2>
        </div>
        <button onClick={onAddRoot} className={BTN_PRIMARY + ' flex items-center gap-1 !px-3 !py-1.5 text-xs'}>
          <Plus className="w-3.5 h-3.5" />
          הוסף
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-gray-500 dark:text-gray-400 text-sm">טוען...</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-500">
            <FolderOpen className="w-8 h-8 mb-2" />
            <p className="text-sm">אין קטגוריות</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                level={0}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Tree Node (recursive) --------------------------------------------------

interface TreeNodeProps {
  node: AssetCategoryTreeNode
  level: number
  selectedId: string | null
  expanded: Set<string>
  onSelect: (id: string) => void
  onToggleExpand: (id: string) => void
}

function TreeNode({ node, level, selectedId, expanded, onSelect, onToggleExpand }: TreeNodeProps) {
  const isExpanded = expanded.has(node.id)
  const isSelected = selectedId === node.id
  const hasChildren = node.children_count > 0

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
        }`}
        style={{ paddingRight: `${(level * 16) + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Name */}
        <span className="text-sm truncate flex-1">{node.name}</span>

        {/* Items count badge */}
        {node.items_count > 0 && (
          <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full px-1.5 py-0.5 flex-shrink-0">
            {node.items_count}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Detail Panel -----------------------------------------------------------

interface DetailPanelProps {
  node: AssetCategoryTreeNode | null
  breadcrumb: string[] | null
  items: CategoryItemRead[]
  includeDescendants: boolean
  onToggleDescendants: () => void
  onAddChild: (parentId: string) => void
  onDelete: (id: string, name: string) => void
  onImageUpload: (categoryId: string, file: File) => void
  onSelect: (id: string) => void
}

function DetailPanel({
  node,
  breadcrumb,
  items,
  includeDescendants,
  onToggleDescendants,
  onAddChild,
  onDelete,
  onImageUpload,
  onSelect,
}: DetailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!node) {
    return (
      <div className="w-2/3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <div className="text-center text-gray-400 dark:text-gray-500">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" />
          <p className="text-lg">בחר קטגוריה מהרשימה</p>
        </div>
      </div>
    )
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && node) {
      onImageUpload(node.id, file)
    }
    e.target.value = ''
  }

  return (
    <div className="w-2/3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-4">
          {/* Image */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all group"
            title="העלאת תמונה"
          >
            {node.image_url ? (
              <img src={node.image_url} alt={node.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center">
                <FolderOpen className="w-6 h-6 text-gray-400 dark:text-gray-500 group-hover:hidden" />
                <Upload className="w-6 h-6 text-blue-500 hidden group-hover:block" />
              </div>
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{node.name}</h3>
            {node.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{node.description}</p>
            )}
            {breadcrumb && breadcrumb.length > 1 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {breadcrumb.join(' / ')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onDelete(node.id, node.name)}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="מחק"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Sub-categories */}
        {node.children.length > 0 && (
          <SubCategoriesGrid
            children={node.children}
            parentId={node.id}
            onAddChild={onAddChild}
            onSelect={onSelect}
          />
        )}

        {/* Add sub-category card when no children yet but depth allows */}
        {node.children.length === 0 && !node.parent_id && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">תת-קטגוריות</h4>
            <button
              onClick={() => onAddChild(node.id)}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group"
            >
              <Plus className="w-5 h-5 mx-auto text-gray-400 group-hover:text-blue-500 mb-1" />
              <span className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                + הוסף תת-קטגוריה
              </span>
            </button>
          </div>
        )}

        {/* Items table */}
        <ItemsTable
          items={items}
          includeDescendants={includeDescendants}
          onToggleDescendants={onToggleDescendants}
          hasChildren={node.children_count > 0}
        />
      </div>
    </div>
  )
}

// ---- Sub-Categories Grid ----------------------------------------------------

interface SubCategoriesGridProps {
  children: AssetCategoryTreeNode[]
  parentId: string
  onAddChild: (parentId: string) => void
  onSelect: (id: string) => void
}

function SubCategoriesGrid({ children, parentId, onAddChild, onSelect }: SubCategoriesGridProps) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">תת-קטגוריות</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => onSelect(child.id)}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-right hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
          >
            <div className="flex items-center gap-2 mb-1">
              {child.image_url ? (
                <img src={child.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-4 h-4 text-gray-400" />
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{child.name}</span>
            </div>
            {child.items_count > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{child.items_count} פריטים</span>
            )}
          </button>
        ))}

        {/* Add sub-category card */}
        <button
          onClick={() => onAddChild(parentId)}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-center hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group flex items-center justify-center"
        >
          <div>
            <Plus className="w-5 h-5 mx-auto text-gray-400 group-hover:text-blue-500 mb-1" />
            <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              + הוסף תת-קטגוריה
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}

// ---- Items Table ------------------------------------------------------------

interface ItemsTableProps {
  items: CategoryItemRead[]
  includeDescendants: boolean
  onToggleDescendants: () => void
  hasChildren: boolean
}

function ItemsTable({ items, includeDescendants, onToggleDescendants, hasChildren }: ItemsTableProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">פריטים</h4>
        {hasChildren && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDescendants}
              onChange={onToggleDescendants}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            כלול תת-קטגוריות
          </label>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
          <Package className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">אין פריטים בקטגוריה זו</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">תמונה</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">שם</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">סוג</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">סטטוס/כמות</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">מחסן</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2 px-3">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        {item.type === 'asset' ? (
                          <Package className="w-6 h-6 text-gray-400" />
                        ) : (
                          <Archive className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-900 dark:text-white">{item.name}</td>
                  <td className="py-2 px-3">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                    {item.type === 'asset' ? item.status : `${item.quantity ?? ''} ${item.unit ?? ''}`.trim()}
                  </td>
                  <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{item.warehouse_name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Type Badge -------------------------------------------------------------

function TypeBadge({ type }: { type: 'asset' | 'consumable' }) {
  if (type === 'asset') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5">
        <Package className="w-3 h-3" />
        ציוד
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5">
      <Archive className="w-3 h-3" />
      מתכלה
    </span>
  )
}

// ---- Add Category Modal -----------------------------------------------------

interface AddCategoryModalProps {
  tree: AssetCategoryTreeNode[]
  defaultParentId: string | null
  onClose: () => void
  onCreated: () => void
}

function AddCategoryModal({ tree, defaultParentId, onClose, onCreated }: AddCategoryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState(defaultParentId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const flatCategories = flattenTree(tree)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('שם הקטגוריה הוא שדה חובה')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await cemsApi.createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
        parent_id: parentId || undefined,
      })
      onCreated()
    } catch {
      setError('שגיאה ביצירת קטגוריה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_PANEL} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">הוספת קטגוריה</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" dir="rtl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className={LABEL_CLASS}>שם *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
              placeholder="לדוגמה: כלי עבודה"
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT_CLASS}
              rows={3}
              placeholder="תיאור אופציונלי"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>קטגוריית אב</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">ללא - קטגוריה ראשית</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {'─'.repeat(cat.depth)} {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              ביטול
            </button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? 'שומר...' : 'הוסף קטגוריה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

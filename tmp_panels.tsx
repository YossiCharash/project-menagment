
        {/* Regular transaction panel - floating overlay */}
        {activePanelType === 'regular' && (
          <div className="absolute inset-0 z-[55] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-4 rounded-2xl" onClick={() => setActivePanelType(null)}>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingCardRowId ? 'עריכת עסקה רגילה' : 'עסקה רגילה חדשה'}
                  </h3>
                  {(panelRegular.projectId || panelRegular.subprojectId) && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                      {getProjectLabel(panelRegular.projectId ?? '', panelRegular.subprojectId ?? '')}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setActivePanelType(null)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                {/* Project + subproject */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                    <select
                      value={panelRegular.projectId ?? ''}
                      onChange={e => {
                        const pid = e.target.value ? Number(e.target.value) : ''
                        setPanelRegular(prev => ({ ...prev, projectId: pid, subprojectId: '' }))
                        if (pid) {
                          const proj = projects.find(p => p.id === pid)
                          if (proj?.is_parent_project) loadSubprojects(pid as number)
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">בחר פרויקט</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {panelRegular.projectId && projects.find(p => p.id === panelRegular.projectId)?.is_parent_project && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תת-פרויקט *</label>
                      <select
                        value={panelRegular.subprojectId ?? ''}
                        onChange={e => setPanelRegular(prev => ({ ...prev, subprojectId: e.target.value ? Number(e.target.value) : '' }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">בחר תת-פרויקט</option>
                        {(subprojectsMap[panelRegular.projectId as number] || []).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג עסקה</label>
                  <div className="flex gap-3">
                    {(['Expense', 'Income'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPanelRegular(prev => ({ ...prev, type: t }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${panelRegular.type === t ? (t === 'Income' ? 'bg-green-500 border-green-500 text-white' : 'bg-red-500 border-red-500 text-white') : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}
                      >
                        {t === 'Income' ? 'הכנסה' : 'הוצאה'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date + Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך עסקה *</label>
                    <input
                      type="date"
                      value={panelRegular.txDate ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, txDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סכום *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={panelRegular.amount ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : '' }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                {/* Period dates */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עסקה תאריכית (אופציונלי)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={panelRegular.period_start_date ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, period_start_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="מתאריך"
                    />
                    <input
                      type="date"
                      value={panelRegular.period_end_date ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, period_end_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="עד תאריך"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                  <input
                    type="text"
                    value={panelRegular.description ?? ''}
                    onChange={e => setPanelRegular(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="תיאור העסקה"
                  />
                </div>

                {/* Category + Supplier */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קטגוריה</label>
                    <select
                      value={panelRegular.categoryId ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, categoryId: e.target.value ? Number(e.target.value) : '', supplierId: '' }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">בחר קטגוריה</option>
                      {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {panelRegular.type === 'Expense' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ספק</label>
                      <select
                        value={panelRegular.supplierId ?? ''}
                        onChange={e => setPanelRegular(prev => ({ ...prev, supplierId: e.target.value ? Number(e.target.value) : '' }))}
                        disabled={!panelRegular.categoryId}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">{panelRegular.categoryId ? 'בחר ספק' : 'בחר קודם קטגוריה'}</option>
                        {panelRegular.categoryId && suppliers.filter(s => s.is_active !== false && s.category_id === panelRegular.categoryId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Payment method + Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אמצעי תשלום</label>
                    <select
                      value={panelRegular.paymentMethod ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
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
                    <input
                      type="text"
                      value={panelRegular.notes ?? ''}
                      onChange={e => setPanelRegular(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="הערות"
                    />
                  </div>
                </div>

                {/* File upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מסמכים</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                      <Upload className="w-4 h-4" />
                      הוסף קבצים
                      <input type="file" multiple className="hidden" onChange={e => {
                        const files = Array.from(e.target.files || [])
                        setPanelRegular(prev => ({ ...prev, files: [...(prev.files || []), ...files] }))
                        e.target.value = ''
                      }} />
                    </label>
                    {(panelRegular.files || []).length > 0 && (
                      <span className="text-sm text-blue-600 font-medium">{(panelRegular.files || []).length} קבצים</span>
                    )}
                  </div>
                  {(panelRegular.files || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(panelRegular.files || []).map((f, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                          <File className="w-3 h-3" />
                          <span className="truncate max-w-[100px]">{f.name}</span>
                          <button type="button" onClick={() => setPanelRegular(prev => ({ ...prev, files: (prev.files || []).filter((_, idx) => idx !== i) }))} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setActivePanelType(null)} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all font-medium">
                  ביטול
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSavePanelRegular}
                  disabled={!panelRegular.projectId || !panelRegular.txDate || !panelRegular.amount || Number(panelRegular.amount) <= 0}
                  className="px-8 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  שמור
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Unforeseen transaction panel - inline overlay */}
        {activePanelType === 'unforeseen' && (
          <div className="absolute inset-0 z-[55] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-4 rounded-2xl" onClick={() => setActivePanelType(null)}>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-l from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 rounded-t-2xl">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingCardRowId ? 'עריכת עסקה לא צפויה' : 'עסקה לא צפויה חדשה'}
                  </h3>
                  {(panelUnforeseen.projectId || panelUnforeseen.subprojectId) && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
                      {getProjectLabel(panelUnforeseen.projectId ?? '', panelUnforeseen.subprojectId ?? '')}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setActivePanelType(null)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                {/* Project + subproject */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פרויקט *</label>
                    <select
                      value={panelUnforeseen.projectId ?? ''}
                      onChange={e => {
                        const pid = e.target.value ? Number(e.target.value) : ''
                        setPanelUnforeseen(prev => ({ ...prev, projectId: pid, subprojectId: '' }))
                        if (pid) {
                          const proj = projects.find(p => p.id === pid)
                          if (proj?.is_parent_project) loadSubprojects(pid as number)
                          loadContractPeriods(pid as number)
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    >
                      <option value="">בחר פרויקט</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {panelUnforeseen.projectId && projects.find(p => p.id === panelUnforeseen.projectId)?.is_parent_project && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תת-פרויקט *</label>
                      <select
                        value={panelUnforeseen.subprojectId ?? ''}
                        onChange={e => setPanelUnforeseen(prev => ({ ...prev, subprojectId: e.target.value ? Number(e.target.value) : '' }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        required
                      >
                        <option value="">בחר תת-פרויקט</option>
                        {(subprojectsMap[panelUnforeseen.projectId as number] || []).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Contract period + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תקופת חוזה</label>
                    <select
                      value={panelUnforeseen.contractPeriodId ?? ''}
                      onChange={e => setPanelUnforeseen(prev => ({ ...prev, contractPeriodId: e.target.value ? Number(e.target.value) : '' }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">כל התקופות</option>
                      {(contractPeriodsMap[panelUnforeseen.projectId as number] || []).map(period => (
                        <option key={period.period_id} value={period.period_id}>{period.year_label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך עסקה *</label>
                    <input
                      type="date"
                      value={panelUnforeseen.txDate ?? ''}
                      onChange={e => setPanelUnforeseen(prev => ({ ...prev, txDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סטטוס</label>
                  <div className="flex gap-2">
                    {([
                      { value: 'draft', label: 'טיוטה', color: 'gray' },
                      { value: 'waiting_for_approval', label: 'מחכה לאישור', color: 'amber' },
                      { value: 'executed', label: 'בוצע', color: 'green' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPanelUnforeseen(prev => ({ ...prev, unforeseenStatus: opt.value }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                          panelUnforeseen.unforeseenStatus === opt.value
                            ? opt.color === 'gray' ? 'bg-gray-500 border-gray-500 text-white'
                              : opt.color === 'amber' ? 'bg-amber-500 border-amber-500 text-white'
                              : 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description + Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                    <input
                      type="text"
                      value={panelUnforeseen.description ?? ''}
                      onChange={e => setPanelUnforeseen(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="תיאור העסקה"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">הערות</label>
                    <input
                      type="text"
                      value={panelUnforeseen.notes ?? ''}
                      onChange={e => setPanelUnforeseen(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="הערות"
                    />
                  </div>
                </div>

                {/* Incomes section */}
                <div className="space-y-2 p-4 rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-green-700 dark:text-green-400">הכנסות</span>
                    <button
                      type="button"
                      onClick={() => setPanelUnforeseen(prev => ({ ...prev, incomes: [...(prev.incomes ?? []), { amount: '', description: '', documentFiles: [] }] }))}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> הוסף הכנסה
                    </button>
                  </div>
                  {(panelUnforeseen.incomes ?? []).map((income, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="סכום"
                        value={income.amount}
                        onChange={e => {
                          const arr = [...(panelUnforeseen.incomes ?? [])]
                          arr[idx] = { ...arr[idx], amount: e.target.value ? Number(e.target.value) : '' }
                          setPanelUnforeseen(prev => ({ ...prev, incomes: arr }))
                        }}
                        className="w-24 px-2 py-1.5 text-sm border border-green-200 dark:border-green-800 rounded-lg bg-white dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="text"
                        placeholder="תיאור"
                        value={income.description}
                        onChange={e => {
                          const arr = [...(panelUnforeseen.incomes ?? [])]
                          arr[idx] = { ...arr[idx], description: e.target.value }
                          setPanelUnforeseen(prev => ({ ...prev, incomes: arr }))
                        }}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-green-200 dark:border-green-800 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <label className="cursor-pointer">
                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={e => {
                          if (!e.target.files) return
                          const files = Array.from(e.target.files)
                          const arr = [...(panelUnforeseen.incomes ?? [])]
                          arr[idx] = { ...arr[idx], documentFiles: [...(arr[idx].documentFiles || []), ...files] }
                          setPanelUnforeseen(prev => ({ ...prev, incomes: arr }))
                          e.target.value = ''
                        }} />
                        <span className={`inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border cursor-pointer ${(income.documentFiles?.length || 0) > 0 ? 'bg-green-100 dark:bg-green-900/30 border-green-300 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'}`}>
                          <Upload className="w-3.5 h-3.5" />{(income.documentFiles?.length || 0) > 0 ? income.documentFiles!.length : ''}
                        </span>
                      </label>
                      {(income.documentFiles || []).map((f, fi) => (
                        <span key={fi} className="flex items-center gap-1 text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border truncate max-w-[80px]">
                          <span className="truncate">{f.name}</span>
                          <button type="button" onClick={() => {
                            const arr = [...(panelUnforeseen.incomes ?? [])]
                            arr[idx] = { ...arr[idx], documentFiles: arr[idx].documentFiles.filter((_, i) => i !== fi) }
                            setPanelUnforeseen(prev => ({ ...prev, incomes: arr }))
                          }} className="text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      {(panelUnforeseen.incomes ?? []).length > 1 && (
                        <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, incomes: (prev.incomes ?? []).filter((_, i) => i !== idx) }))} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Expenses section */}
                <div className="space-y-2 p-4 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-red-700 dark:text-red-400">הוצאות</span>
                    <button
                      type="button"
                      onClick={() => setPanelUnforeseen(prev => ({ ...prev, expenses: [...(prev.expenses ?? []), { amount: '', description: '', documentFiles: [] }] }))}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> הוסף הוצאה
                    </button>
                  </div>
                  {(panelUnforeseen.expenses ?? []).map((expense, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="סכום"
                        value={expense.amount}
                        onChange={e => {
                          const arr = [...(panelUnforeseen.expenses ?? [])]
                          arr[idx] = { ...arr[idx], amount: e.target.value ? Number(e.target.value) : '' }
                          setPanelUnforeseen(prev => ({ ...prev, expenses: arr }))
                        }}
                        className="w-24 px-2 py-1.5 text-sm border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <input
                        type="text"
                        placeholder="תיאור"
                        value={expense.description}
                        onChange={e => {
                          const arr = [...(panelUnforeseen.expenses ?? [])]
                          arr[idx] = { ...arr[idx], description: e.target.value }
                          setPanelUnforeseen(prev => ({ ...prev, expenses: arr }))
                        }}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <label className="cursor-pointer">
                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={e => {
                          if (!e.target.files) return
                          const files = Array.from(e.target.files)
                          const arr = [...(panelUnforeseen.expenses ?? [])]
                          arr[idx] = { ...arr[idx], documentFiles: [...(arr[idx].documentFiles || []), ...files] }
                          setPanelUnforeseen(prev => ({ ...prev, expenses: arr }))
                          e.target.value = ''
                        }} />
                        <span className={`inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border cursor-pointer ${(expense.documentFiles?.length || 0) > 0 ? 'bg-red-100 dark:bg-red-900/30 border-red-300 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'}`}>
                          <Upload className="w-3.5 h-3.5" />{(expense.documentFiles?.length || 0) > 0 ? expense.documentFiles!.length : ''}
                        </span>
                      </label>
                      {(expense.documentFiles || []).map((f, fi) => (
                        <span key={fi} className="flex items-center gap-1 text-[10px] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border truncate max-w-[80px]">
                          <span className="truncate">{f.name}</span>
                          <button type="button" onClick={() => {
                            const arr = [...(panelUnforeseen.expenses ?? [])]
                            arr[idx] = { ...arr[idx], documentFiles: arr[idx].documentFiles.filter((_, i) => i !== fi) }
                            setPanelUnforeseen(prev => ({ ...prev, expenses: arr }))
                          }} className="text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      {(panelUnforeseen.expenses ?? []).length > 1 && (
                        <button type="button" onClick={() => setPanelUnforeseen(prev => ({ ...prev, expenses: (prev.expenses ?? []).filter((_, i) => i !== idx) }))} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setActivePanelType(null)} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all font-medium">
                  ביטול
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSavePanelUnforeseen}
                  disabled={!panelUnforeseen.projectId}
                  className="px-8 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  שמור
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}


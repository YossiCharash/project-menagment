import {motion} from 'framer-motion'
import {ChevronLeft} from 'lucide-react'

interface Subproject {
    id: number
    name: string
}

interface SubprojectsListProps {
    isParentProject: boolean
    subprojects: Subproject[]
    subprojectsLoading: boolean
    onNavigate: (path: string) => void
}

export default function SubprojectsList({
    isParentProject,
    subprojects,
    subprojectsLoading,
    onNavigate
}: SubprojectsListProps) {
    if (!isParentProject) return null

    return (
        <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.05}}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                תתי-פרויקטים
            </h3>
            {subprojectsLoading ? (
                <div className="text-center py-4 text-sm text-gray-600 dark:text-gray-400">
                    טוען תתי-פרויקטים...
                </div>
            ) : subprojects.length > 0 ? (
                <div className="space-y-1.5">
                    {subprojects.map((subproject) => (
                        <div
                            key={subproject.id}
                            onClick={() => onNavigate(`/projects/${subproject.id}`)}
                            className="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer group"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                    {subproject.name}
                                </span>
                                <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"/>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                    אין תתי-פרויקטים תחת פרויקט זה
                </div>
            )}
        </motion.div>
    )
}

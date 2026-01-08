import React from 'react'
import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <motion.div
      className={`${sizeClasses[size]} ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <svg
        className="w-full h-full text-blue-600"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </motion.div>
  )
}

interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <motion.div
      className={`bg-gray-200 dark:bg-gray-700 rounded-md ${className}`}
      style={{ width, height }}
      animate={{
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

interface LoadingCardProps {
  className?: string
}

export function LoadingCard({ className = '' }: LoadingCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      <div className="space-y-4">
        <Skeleton height="h-6" width="w-3/4" />
        <Skeleton height="h-4" width="w-1/2" />
        <div className="space-y-2">
          <Skeleton height="h-3" width="w-full" />
          <Skeleton height="h-3" width="w-5/6" />
          <Skeleton height="h-3" width="w-4/6" />
        </div>
        <div className="flex gap-2">
          <Skeleton height="h-8" width="w-20" />
          <Skeleton height="h-8" width="w-20" />
        </div>
      </div>
    </div>
  )
}

interface LoadingDashboardProps {
  count?: number
}

export function LoadingDashboard({ count = 6 }: LoadingDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <Skeleton height="h-8" width="w-48" />
        <div className="flex gap-3">
          <Skeleton height="h-10" width="w-32" />
          <Skeleton height="h-10" width="w-24" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height="h-12" width="w-full" />
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: count }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </div>
  )
}

interface LoadingOverlayProps {
  message?: string
}

export function LoadingOverlay({ message = 'טוען...' }: LoadingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">{message}</p>
      </div>
    </motion.div>
  )
}

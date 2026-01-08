import React, { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  showText?: boolean
  collapsed?: boolean
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
  '2xl': 'w-24 h-24',
  '3xl': 'w-32 h-32',
  '4xl': 'w-64 h-64'
}

export function Logo({ className, size = 'md', showText = false, collapsed = false }: LogoProps) {
  const [imageError, setImageError] = useState(false)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {!imageError ? (
        <img
          src="/logo.png"
          alt="לוגו מערכת ניהול נכסים"
          className={cn(
            'object-contain',
            sizeClasses[size],
            collapsed && 'mx-auto'
          )}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className={cn(
          'bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0',
          sizeClasses[size],
          collapsed && 'mx-auto'
        )}>
          <Building2 className={cn(
            'text-white',
            size === 'sm' ? 'w-4 h-4' : 
            size === 'md' ? 'w-5 h-5' : 
            size === 'lg' ? 'w-6 h-6' : 
            size === 'xl' ? 'w-8 h-8' :
            size === '2xl' ? 'w-12 h-12' :
            size === '3xl' ? 'w-16 h-16' :
            'w-24 h-24'
          )} />
        </div>
      )}
      {showText && !collapsed && (
        <div className="flex flex-col">
          <h1 className="font-bold text-lg text-gray-900 dark:text-white">ZIPO</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">מערכת ניהול נכסים</p>
        </div>
      )}
    </div>
  )
}


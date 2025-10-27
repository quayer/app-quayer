'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AccessibleDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function AccessibleDialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: AccessibleDialogProps) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`${sizeClasses[size]} p-0 gap-0 overflow-hidden dialog-content-animated`}
        aria-describedby={description ? 'dialog-description' : undefined}
      >
        <DialogHeader className="p-6 pb-4 border-b border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold text-white">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription
                  id="dialog-description"
                  className="text-gray-300 mt-2 text-sm"
                >
                  {description}
                </DialogDescription>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-full"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[60vh] overflow-y-auto">{children}</div>

        {footer && (
          <DialogFooter className="p-6 pt-4 border-t border-gray-800 bg-gray-900/50">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
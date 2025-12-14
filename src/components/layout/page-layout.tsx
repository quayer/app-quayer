import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
    children: ReactNode
    className?: string
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full'
}

const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full',
}

export function PageContainer({
    children,
    className,
    maxWidth = '7xl'
}: PageContainerProps) {
    return (
        <div className={cn(
            'container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8',
            maxWidthClasses[maxWidth],
            className
        )}>
            {children}
        </div>
    )
}

interface PageHeaderProps {
    title: string
    description?: string
    icon?: ReactNode
    actions?: ReactNode
    className?: string
}

export function PageHeader({
    title,
    description,
    icon,
    actions,
    className
}: PageHeaderProps) {
    return (
        <div className={cn('space-y-4 mb-6 sm:mb-8', className)}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    {icon && (
                        <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                            {title}
                        </h1>
                        {description && (
                            <p className="text-muted-foreground mt-1 sm:mt-2 text-base sm:text-lg">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                {actions && (
                    <div className="flex-shrink-0">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    )
}

interface PageSectionProps {
    children: ReactNode
    title?: string
    description?: string
    className?: string
}

export function PageSection({
    children,
    title,
    description,
    className
}: PageSectionProps) {
    return (
        <section className={cn('space-y-4 sm:space-y-6', className)}>
            {(title || description) && (
                <div className="space-y-1">
                    {title && (
                        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                            {title}
                        </h2>
                    )}
                    {description && (
                        <p className="text-sm sm:text-base text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
            )}
            {children}
        </section>
    )
}

interface EmptyStateProps {
    icon?: ReactNode
    title: string
    description?: string
    action?: ReactNode
    className?: string
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    className
}: EmptyStateProps) {
    return (
        <div className={cn(
            'flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-lg border-2 border-dashed bg-muted/30',
            className
        )}>
            {icon && (
                <div className="mb-4 p-3 bg-muted rounded-full">
                    {icon}
                </div>
            )}
            <h3 className="text-lg sm:text-xl font-semibold mb-2">
                {title}
            </h3>
            {description && (
                <p className="text-sm sm:text-base text-muted-foreground mb-4 max-w-md">
                    {description}
                </p>
            )}
            {action}
        </div>
    )
}

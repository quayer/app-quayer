import { Skeleton } from "@/components/ui/skeleton"

interface TableSkeletonProps {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 5, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-3 mt-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={j} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

interface ActivitySkeletonProps {
  items?: number
}

export function ActivitySkeleton({ items = 5 }: ActivitySkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="w-2 h-2 rounded-full mt-2" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

interface ChartSkeletonProps {
  bars?: number
}

export function ChartSkeleton({ bars = 7 }: ChartSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between h-64 gap-2">
          {Array.from({ length: bars }).map((_, i) => {
            const height = Math.random() * 100 + 50
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <Skeleton
                  className="w-full rounded-t-md"
                  style={{ height: `${height}px` }}
                />
                <Skeleton className="h-3 w-8" />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

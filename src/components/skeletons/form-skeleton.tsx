import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"

interface FormSkeletonProps {
  fields?: number
}

export function FormSkeleton({ fields = 4 }: FormSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </CardFooter>
    </Card>
  )
}

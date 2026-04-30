import { Skeleton } from "@/client/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
    </div>
  )
}

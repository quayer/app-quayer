import { PageHeaderSkeleton } from "@/client/components/skeletons/page-header-skeleton"
import { StatsSkeleton } from "@/client/components/skeletons/stats-skeleton"
import { TableSkeleton } from "@/client/components/skeletons/table-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeaderSkeleton />
      <StatsSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </div>
  )
}

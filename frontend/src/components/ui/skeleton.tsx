import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full">
      <div className="rounded-md border">
        <div className="border-b bg-gray-50 px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
            <Skeleton className="h-4 w-full sm:w-32" />
            <Skeleton className="h-4 w-3/4 sm:w-24" />
            <Skeleton className="h-4 w-1/2 sm:w-20" />
            <Skeleton className="h-4 w-1/3 sm:w-16" />
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-3 sm:space-y-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-full sm:w-32" />
                </div>

                <div className="flex flex-1 items-center justify-between gap-4">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-full sm:w-24" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-4 sm:p-6 shadow-sm">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Skeleton className="h-6 w-full sm:w-48" />
          <Skeleton className="h-8 w-full sm:w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 sm:w-3/4" />
          <Skeleton className="h-4 w-1/2 sm:w-1/2" />
        </div>
      </div>
    </div>
  )
}

export { Skeleton, TableSkeleton, CardSkeleton }
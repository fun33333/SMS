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

// Animated Chart Skeleton with chart-specific animations
function ChartSkeleton({ type = "bar" }: { type?: "bar" | "pie" | "line" | "gauge" | "stacked" | "radial" }) {
  return (
    <div className="rounded-lg border bg-white p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Chart Area */}
      <div className="h-64 flex items-end justify-around gap-2 px-4">
        {type === "bar" && (
          <>
            {[60, 80, 45, 90, 70, 55, 85].map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-blue-300 to-blue-100 rounded-t-md animate-[growUp_1.5s_ease-out_infinite]"
                style={{
                  height: `${height}%`,
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </>
        )}

        {/* Gauge/Attendance Skeleton - Circular progress meter */}
        {type === "gauge" && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="relative w-48 h-48">
              {/* Background arc */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth="8"
                />
                {/* Animated progress arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#93C5FD"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="200"
                  strokeDashoffset="50"
                  className="animate-pulse"
                  style={{ animationDuration: '2s' }}
                />
                {/* Secondary arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="30"
                  fill="none"
                  stroke="#DBEAFE"
                  strokeWidth="6"
                  strokeDasharray="150"
                  strokeDashoffset="30"
                  className="animate-pulse"
                  style={{ animationDelay: '0.3s', animationDuration: '2s' }}
                />
              </svg>
              {/* Center text placeholder */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        )}

        {/* Attendance Bar Chart Skeleton - Grouped bars with days */}
        {type === "stacked" && (
          <div className="w-full h-full flex flex-col">
            {/* Chart area */}
            <div className="flex-1 flex items-end justify-around gap-3 px-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  {/* Bar group */}
                  <div className="w-full flex gap-1 items-end h-48">
                    {/* Present bar */}
                    <div
                      className="flex-1 bg-gradient-to-t from-blue-400 to-blue-200 rounded-t-sm animate-pulse"
                      style={{
                        height: `${50 + (i * 6)}%`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '1.8s'
                      }}
                    />
                    {/* Absent bar */}
                    <div
                      className="flex-1 bg-gradient-to-t from-blue-200 to-blue-100 rounded-t-sm animate-pulse"
                      style={{
                        height: `${20 + (i * 4)}%`,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: '1.8s'
                      }}
                    />
                  </div>
                  {/* Day label */}
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Radial Progress Skeleton - Blue shades only */}
        {type === "radial" && (
          <div className="w-full h-full flex items-center justify-around">
            {[75, 60, 85].map((value, i) => (
              <div key={i} className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={['#3B82F6', '#60A5FA', '#93C5FD'][i]}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${value * 2.51} 251`}
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 0.3}s`, animationDuration: '2s' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Skeleton className="h-4 w-8" />
                </div>
              </div>
            ))}
          </div>
        )}


        {type === "pie" && (
          <div className="w-48 h-48 mx-auto relative">
            {/* V0-style Pie Chart Skeleton with SPINNING animation */}
            <svg
              className="w-full h-full animate-[spin_4s_linear_infinite]"
              viewBox="0 0 100 100"
            >
              {/* Pie segments */}
              {[
                { start: 0, end: 90, color: '#93C5FD' },
                { start: 90, end: 180, color: '#BFDBFE' },
                { start: 180, end: 260, color: '#DBEAFE' },
                { start: 260, end: 320, color: '#E0E7FF' },
                { start: 320, end: 360, color: '#C7D2FE' },
              ].map((segment, i) => {
                const startAngle = (segment.start - 90) * (Math.PI / 180);
                const endAngle = (segment.end - 90) * (Math.PI / 180);
                const x1 = 50 + 40 * Math.cos(startAngle);
                const y1 = 50 + 40 * Math.sin(startAngle);
                const x2 = 50 + 40 * Math.cos(endAngle);
                const y2 = 50 + 40 * Math.sin(endAngle);
                const largeArc = segment.end - segment.start > 180 ? 1 : 0;

                return (
                  <path
                    key={i}
                    d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={segment.color}
                  />
                );
              })}
            </svg>
            {/* Fixed center donut hole (doesn't spin) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 bg-white rounded-full shadow-inner flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {type === "line" && (
          <div className="w-full h-full relative overflow-hidden">
            {/* Animated Line Chart Skeleton with wave effect */}
            <svg className="w-full h-full" viewBox="0 0 300 200">
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="0"
                  y1={i * 50}
                  x2="300"
                  y2={i * 50}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                />
              ))}
              {/* Animated line with wave effect */}
              <path
                d="M 0 150 Q 50 100, 75 120 T 150 80 T 225 100 T 300 60"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="3"
                className="animate-[waveMove_2s_ease-in-out_infinite]"
              />
              {/* Animated dots moving up */}
              {[0, 75, 150, 225, 300].map((x, i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={[150, 120, 80, 100, 60][i]}
                  r="5"
                  fill="#3B82F6"
                  className="animate-[bounceUp_1.5s_ease-in-out_infinite]"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Legend - Chart-type specific */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center">
        {type === "bar" && (
          <>
            {/* Bar chart legend - small bars */}
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-4 h-3 rounded-sm bg-gradient-to-t from-blue-300 to-blue-100 animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </>
        )}
        {type === "pie" && (
          <>
            {/* Pie chart legend - pie slice shapes */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full animate-pulse overflow-hidden"
                  style={{
                    background: `conic-gradient(from 0deg, ${['#93C5FD', '#BFDBFE', '#DBEAFE'][i - 1]} 0deg, ${['#93C5FD', '#BFDBFE', '#DBEAFE'][i - 1]} 120deg, transparent 120deg)`,
                    animationDelay: `${i * 0.3}s`
                  }}
                />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </>
        )}
        {type === "line" && (
          <>
            {/* Line chart legend - dots with lines */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center">
                  <div className="w-3 h-0.5 bg-blue-300 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                  <div
                    className="w-2 h-2 rounded-full bg-blue-500 animate-pulse -ml-0.5"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                  <div className="w-3 h-0.5 bg-blue-300 animate-pulse -ml-0.5" style={{ animationDelay: `${i * 0.2}s` }} />
                </div>
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes growUp {
          0%, 100% {
            transform: scaleY(0.3);
            transform-origin: bottom;
          }
          50% {
            transform: scaleY(1);
            transform-origin: bottom;
          }
        }
        @keyframes waveMove {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes bounceUp {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  )
}

// V0-style KPI Card Skeleton with technical visualization
function KpiCardSkeleton() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border relative overflow-hidden">
      {/* Shimmer effect overlay */}
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative">
        {/* Header with icon */}
        <div className="flex items-center justify-between mb-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Animated icon placeholder */}
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 animate-pulse flex items-center justify-center">
            <div className="h-5 w-5 bg-blue-300 rounded animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>

        {/* Animated number visualization */}
        <div className="space-y-2 mb-2">
          {/* Main number with bars */}
          <div className="flex items-end gap-1">
            {[70, 85, 60, 90, 75].map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-gray-200 to-gray-100 rounded-sm animate-pulse"
                style={{
                  height: `${height * 0.4}px`,
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '1.8s'
                }}
              />
            ))}
          </div>
        </div>

        {/* Description with trend indicator */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-32" />
          {/* Animated upward trend arrow */}
          <div className="flex items-center gap-1 relative h-6 overflow-hidden">
            {/* Animated arrow moving upward */}
            <div className="absolute animate-[slideUp_1.5s_ease-in-out_infinite]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-500">
                <path d="M8 3L12 7L11 8L8.5 5.5V13H7.5V5.5L5 8L4 7L8 3Z" fill="currentColor" />
              </svg>
            </div>
            <Skeleton className="h-2 w-8 ml-4" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes slideUp {
          0% {
            transform: translateY(8px);
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(-8px);
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  )
}

export { Skeleton, TableSkeleton, CardSkeleton, ChartSkeleton, KpiCardSkeleton }
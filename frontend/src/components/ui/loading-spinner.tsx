"use client"

interface LoadingSpinnerProps {
  message?: string
  fullScreen?: boolean
}

export function LoadingSpinner({ message = "Loading...", fullScreen = false }: LoadingSpinnerProps) {
  const containerClass = fullScreen
    ? "min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-white to-blue-300"
    : "flex items-center justify-center p-8"

  return (
    <div className={containerClass}>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full border-8 border-blue-400 border-t-transparent animate-spin"
            style={{ borderTopColor: "#FFD700" }}
          ></div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-blue-900 mb-2 tracking-tight">
            {message}
          </h2>
          <span className="block mt-2 text-sm text-yellow-700 font-semibold">
            Powered by Idara Al-Khair Foundation
          </span>
        </div>
      </div>
    </div>
  )
}

// Minimal inline loader for buttons, cards, etc.
export function InlineLoader({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-3",
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeClasses[size]} rounded-full border-blue-400 border-t-transparent animate-spin`}
        style={{ borderTopColor: "#FFD700" }}
      ></div>
    </div>
  )
}


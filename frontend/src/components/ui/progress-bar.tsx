"use client"

import { Progress } from "@/components/ui/progress"
import { CheckCircle } from "lucide-react"

interface Step {
  id: number
  title: string
}

interface ProgressBarProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (stepId: number) => void
  showClickable?: boolean
}

export function ProgressBar({ steps, currentStep, onStepClick, showClickable = false }: ProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        {steps.map((step, index) => (
          <button
            key={step.id}
            onClick={() => onStepClick && onStepClick(step.id)}
            disabled={!showClickable || !onStepClick}
            className="flex items-center flex-1 disabled:cursor-default"
          >
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : currentStep === step.id
                    ? 'bg-[#6096BA] text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {currentStep > step.id ? <CheckCircle className="h-5 w-5" /> : step.id}
              </div>
              <span className="mt-2 text-sm text-gray-600 hidden sm:block">{step.title}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-1 mx-2 bg-gray-200">
                <div
                  className={`h-full transition-all ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                  style={{ width: currentStep > step.id ? '100%' : '0%' }}
                />
              </div>
            )}
          </button>
        ))}
      </div>
      <Progress value={(currentStep / steps.length) * 100} className="h-2" />
    </div>
  )
}


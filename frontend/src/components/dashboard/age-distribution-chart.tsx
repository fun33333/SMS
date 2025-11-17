"use client"

import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartData } from "@/types/dashboard"

interface AgeDistributionChartProps {
  data: ChartData[]
}

const AGE_COLORS = ['#274C77', '#6096BA', '#A3CEF1', '#10b981', '#14b8a6']

export function AgeDistributionChart({ data }: AgeDistributionChartProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-[#274C77]">{payload[0].payload.name}</p>
          <p className="text-sm text-muted-foreground">
            Students: <span className="font-medium text-foreground">{payload[0].value}</span>
          </p>
        </div>
      )
    }
    return null
  }

  // Calculate dynamic Y-axis domain
  const maxValue = Math.max(...data.map(d => d.value), 0)
  // Dynamic scaling based on max value
  const yMax = maxValue === 0 ? 10 : Math.ceil(maxValue * 1.2 / 10) * 10

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-cyan-50 to-teal-50">
        <CardTitle className="text-xl font-bold text-[#274c77]">Age Distribution</CardTitle>
        <CardDescription className="text-gray-600">Students by age groups</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6">
        <div className="h-64 sm:h-72 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              margin={{ 
                top: 20, 
                right: isMobile ? 10 : 30, 
                left: isMobile ? 5 : 20, 
                bottom: isMobile ? 60 : 60 
              }}
            >
              <defs>
                {AGE_COLORS.map((color, idx) => (
                  <linearGradient key={idx} id={`ageGradient${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={color} stopOpacity={0.6}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="name" 
                stroke="#6b7280"
                angle={isMobile ? -60 : -45}
                textAnchor="end"
                height={isMobile ? 80 : 60}
                style={{ fontSize: isMobile ? '10px' : '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: isMobile ? '10px' : '12px' }}
                domain={[0, yMax]}
                width={isMobile ? 40 : 60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="value" 
                radius={[8, 8, 0, 0]}
                style={{
                  filter: 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))',
                }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#ageGradient${index % AGE_COLORS.length})`} />
                ))}
                <LabelList 
                  dataKey="value" 
                  position="top" 
                  style={{ 
                    fill: '#374151', 
                    fontSize: isMobile ? '10px' : '12px', 
                    fontWeight: 600 
                  }} 
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}


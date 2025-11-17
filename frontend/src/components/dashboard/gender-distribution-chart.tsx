"use client"

import { useState, useEffect } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChartData } from "@/types/dashboard"

interface GenderDistributionChartProps {
  data: ChartData[]
}

// Custom palette for gender chart (case-insensitive keys)
const GENDER_COLORS: Record<string, string> = {
  female: '#ec4899', // Pink for female
  male: '#274C77', // Blue for male
  other: '#a3a3a3',
}

export function GenderDistributionChart({ data }: GenderDistributionChartProps) {
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
      const data = payload[0].payload
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-muted-foreground">
            Students: <span className="font-medium text-foreground">{data.value}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Percentage:{" "}
            <span className="font-medium text-foreground">{((data.value / data.total) * 100).toFixed(1)}%</span>
          </p>
        </div>
      )
    }
    return null
  }

  // Calculate total for percentage calculation
  const dataWithTotal = data.map((item) => ({
    ...item,
    total: data.reduce((sum, d) => sum + d.value, 0),
  }))

  return (
    <Card className="h-full shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-pink-50 to-purple-50">
        <CardTitle className="text-xl font-bold text-[#274c77]">Gender Distribution</CardTitle>
        <CardDescription className="text-gray-600">Student enrollment by gender</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6">
        <div className="h-64 sm:h-72 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie 
                data={dataWithTotal} 
                cx="50%" 
                cy="50%" 
                outerRadius="70%" 
                innerRadius={0}
                dataKey="value"
                label={(props: any) => {
                  // Hide labels on very small screens, show on larger
                  if (isMobile) return ''
                  return `${props.name}: ${((props.percent ?? 0) * 100).toFixed(0)}%`
                }}
                labelLine={!isMobile}
              >
                {dataWithTotal.map((entry: any, index: number) => {
                  const key = (entry?.name ?? '').toString().trim().toLowerCase()
                  const mapped = GENDER_COLORS[key]
                  const fill = mapped || entry?.fill || '#3B82F6'
                  return <Cell key={`cell-${index}`} fill={fill} />
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                formatter={(value, entry) => <span style={{ color: entry.color, fontWeight: 500, fontSize: '12px' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

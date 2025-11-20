"use client"

import { TrendingUp } from "lucide-react"
import { LabelList, RadialBar, RadialBarChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
  students: {
    label: "Students",
  },
  male: {
    label: "Male",
    color: "#274c77",
  },
  female: {
    label: "Female", 
    color: "#6096ba",
  },
  morning: {
    label: "Morning",
    color: "#a3cef1",
  },
  afternoon: {
    label: "Afternoon",
    color: "#8b8c89",
  },
} satisfies ChartConfig

interface RadialChartProps {
  data: {
    male_students: number
    female_students: number
    morning_students: number
    afternoon_students: number
    total_students: number
  }
}

export function StudentRadialChart({ data }: RadialChartProps) {
  // Normalize values against a fixed "max" so visual rings look staggered and comparable
  // You can tweak this cap if your campuses generally have more or fewer students
  const MAX_CAP = 1000

  const clampToCap = (value: number) => {
    const safe = Math.max(0, value || 0)
    return Math.min(safe, MAX_CAP)
  }

  const maleRaw = clampToCap(data.male_students)
  const femaleRaw = clampToCap(data.female_students)
  const morningRaw = clampToCap(data.morning_students)
  const afternoonRaw = clampToCap(data.afternoon_students)

  // For the chart radius itself we only care about relative size, so map to 0–100 scale
  const toPercent = (value: number) =>
    MAX_CAP ? Math.round((clampToCap(value) / MAX_CAP) * 100) : 0

  const chartData = [
    { 
      category: "male", 
      students: toPercent(maleRaw),
      raw: maleRaw,
      fill: "#274c77",
    },
    { 
      category: "female", 
      students: toPercent(femaleRaw),
      raw: femaleRaw,
      fill: "#6096ba",
    },
    { 
      category: "morning", 
      students: toPercent(morningRaw),
      raw: morningRaw,
      fill: "#a3cef1",
    },
    { 
      category: "afternoon", 
      students: toPercent(afternoonRaw),
      raw: afternoonRaw,
      fill: "#8b8c89",
    },
  ]

  const malePercentage = data.total_students ? Math.round((data.male_students / data.total_students) * 100) : 0
  const femalePercentage = data.total_students ? Math.round((data.female_students / data.total_students) * 100) : 0

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Student Demographics</CardTitle>
        <CardDescription>Gender & Shift Distribution</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={-90}
            endAngle={380}
            innerRadius={30}
            outerRadius={110}
          >
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="category"
                  // Show real counts in tooltip, not the 0–100 normalized value
                  formatter={(value, name, item) => {
                    const raw = (item.payload as any)?.raw ?? value
                    return (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {Number(raw || 0).toLocaleString()}
                      </span>
                    )
                  }}
                />
              }
            />
            <RadialBar dataKey="students" background>
              <LabelList
                position="insideStart"
                dataKey="category"
                className="fill-white capitalize mix-blend-luminosity"
                fontSize={11}
              />
            </RadialBar>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          Male: {malePercentage}% • Female: {femalePercentage}% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Total Students: {data.total_students}
        </div>
      </CardFooter>
    </Card>
  )
}

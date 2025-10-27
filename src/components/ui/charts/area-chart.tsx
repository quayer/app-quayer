'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface AreaChartProps {
  title?: string
  description?: string
  data: Array<Record<string, any>>
  xKey: string
  areas: Array<{
    dataKey: string
    name: string
    color?: string
  }>
  height?: number
  stacked?: boolean
}

export function AreaChart({ title, description, data, xKey, areas, height = 300, stacked = false }: AreaChartProps) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <Card>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsAreaChart data={data}>
            <defs>
              {areas.map((area, index) => {
                const color = area.color || colors[index % colors.length]
                return (
                  <linearGradient key={area.dataKey} id={`color${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey={xKey}
              className="text-sm text-muted-foreground"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-sm text-muted-foreground"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend />
            {areas.map((area, index) => (
              <Area
                key={area.dataKey}
                type="monotone"
                dataKey={area.dataKey}
                name={area.name}
                stroke={area.color || colors[index % colors.length]}
                fill={`url(#color${index})`}
                strokeWidth={2}
                stackId={stacked ? '1' : undefined}
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

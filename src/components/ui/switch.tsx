"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Base styles - padrão shadcn/ui
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm",
        // Transitions
        "transition-colors duration-200",
        // States - cores com bom contraste
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        // Focus ring - WCAG 2.1 compliant
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Thumb size - 20px com 2px de padding em cada lado
          "pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0",
          // Cor do thumb - branco sempre para máximo contraste
          "bg-white dark:bg-white",
          // Transition
          "transition-transform duration-200",
          // Position based on state
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

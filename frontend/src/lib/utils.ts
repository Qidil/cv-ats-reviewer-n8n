import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseRouteId(value: string | undefined): number | null {
  if (value === undefined) return null
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

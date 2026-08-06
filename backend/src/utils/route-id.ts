export function parseId(raw: string | string[]): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

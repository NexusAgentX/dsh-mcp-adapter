export function resourceNameToToolName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '')
  return cleaned || 'resource'
}

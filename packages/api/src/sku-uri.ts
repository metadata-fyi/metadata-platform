export function skuUri(vertical: string, collection: string, id: string): string {
  return `metadata:${vertical.toLowerCase()}:${collection.toLowerCase()}:${id.toLowerCase()}`
}

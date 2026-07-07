/**
 * Presentation helpers for warehouse selection UIs.
 */

/**
 * Builds a human-readable warehouse label that disambiguates sub-warehouses
 * sharing the same name by prefixing the parent name and appending the location.
 *
 * Example: parent "מרכזי", name "צפון", location "קומה 2"
 *          → "מרכזי / צפון — קומה 2"
 */
export function warehouseLabel(warehouse: {
  name: string
  location?: string | null
  parent_name?: string | null
}): string {
  const parentPrefix = warehouse.parent_name ? `${warehouse.parent_name} / ` : ''
  const locationSuffix = warehouse.location ? ` — ${warehouse.location}` : ''
  return `${parentPrefix}${warehouse.name}${locationSuffix}`
}

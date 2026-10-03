/* eslint-disable @typescript-eslint/no-explicit-any */
export default (collection: Array<Record<string, any>>, predicate: Record<string, string>): any => {
  let result = {}
  collection.forEach((value: any) => {
    if (value.type && value.type === predicate.type) {
      result = value
    }
  })
  return result
}

export default function (timeout: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, _) => {
    setTimeout(resolve, timeout)
  })
}

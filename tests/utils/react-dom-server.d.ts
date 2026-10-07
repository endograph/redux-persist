// The one react-dom API the tests use (react-dom ships no types of its own)
declare module 'react-dom/server' {
  import type { ReactNode } from 'react'
  export function renderToString(element: ReactNode): string
}

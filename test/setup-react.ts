// Setup file for the "react" vitest project (happy-dom environment).
// Registers @testing-library/jest-dom matchers like toBeInTheDocument().
// Kept separate from test/setup.ts so the "node" project does not load DOM-only
// matchers that fail without a document global.

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Happy-dom does NOT auto-unmount rendered React trees between tests. Without
// this hook the previous test's DOM lingers and queries like getByLabelText
// throw "Found multiple elements" on the second render in the same file.
afterEach(() => {
  cleanup()
})

// happy-dom shim for components that read matchMedia (theme, responsive hooks).
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

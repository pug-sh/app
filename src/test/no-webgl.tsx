import { Component, type ReactNode } from 'react'
import { vi } from 'vitest'

// A browser that hands out no WebGL2 context: WebGL turned off, or a blocklisted GPU now that Chrome
// no longer falls back to software rendering. happy-dom has no WebGL either, but a test that only
// passes because of what the environment lacks stops testing anything the day that changes.
export const withoutWebGL2 = () => {
  const getContext = HTMLCanvasElement.prototype.getContext
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    id: string,
    options?: unknown,
  ) {
    return id === 'webgl2' ? null : getContext.call(this, id, options)
  })
}

export const CRASHED = 'Something went wrong on this page'

// Stands in for RouteErrorBoundary, which wraps every route: what a crash there costs is the whole
// page, not the one component that threw.
export class CrashBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  render() {
    return this.state.crashed ? <p>{CRASHED}</p> : this.props.children
  }
}

import { describe, expect, it } from 'vitest'

import { AllowPlaceholderTenant } from '../decorators/allow-placeholder.decorator'
import { isPlaceholderAllowedForRoute } from './auth.guard'

describe('placeholder workspace authorization', () => {
  it('allows a placeholder workspace only when the route explicitly opts in', () => {
    class Controller {
      handler() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler')
    expect(descriptor).toBeDefined()
    AllowPlaceholderTenant()(Controller.prototype, 'handler', descriptor!)

    expect(isPlaceholderAllowedForRoute(descriptor!.value as object, Controller)).toBe(true)
  })

  it('supports controller-level opt-in', () => {
    class Controller {}
    AllowPlaceholderTenant()(Controller)

    expect(isPlaceholderAllowedForRoute(() => undefined, Controller)).toBe(true)
  })

  it('denies an undecorated route even when its URL could resemble an authentication route', () => {
    class Controller {}

    expect(isPlaceholderAllowedForRoute(() => undefined, Controller)).toBe(false)
  })
})

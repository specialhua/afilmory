import type { HttpContextAuth } from '@core/context/http-context.values'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Controller, createZodSchemaDto, Get, HttpContext, Query } from '@tsuki-hono/common'
import { z } from 'zod'

import { FeaturedGalleriesService } from './featured-galleries.service'

class GalleryDirectoryQueryDto extends createZodSchemaDto(
  z.object({
    q: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform(value => value || undefined),
    limit: z.coerce.number().int().min(1).max(40).default(20),
  }),
) {}

@Controller('gallery-directory')
@SkipTenantGuard()
@BypassResponseTransform()
export class FeaturedGalleriesController {
  constructor(private readonly featuredGalleriesService: FeaturedGalleriesService) {}

  @AllowPlaceholderTenant()
  @Get('/')
  async listFeaturedGalleries(@Query() query: GalleryDirectoryQueryDto) {
    const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
    return await this.featuredGalleriesService.listFeaturedGalleries(auth?.user?.id, {
      query: query.q,
      limit: query.limit,
    })
  }
}

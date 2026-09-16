import assert from 'node:assert/strict'

import type { PhotoRegion } from '@afilmory/builder'
import { it } from 'vitest'

import { getFloatingLabelPosition, getRenderablePhotoRegions } from './photo-region-bounds'

it('getRenderablePhotoRegions excludes metadata-only and zero-area regions from viewer controls', () => {
  const regions: PhotoRegion[] = [
    {
      name: '',
      type: 'Focus',
      area: null,
      appliedToDimensions: { width: 6000, height: 4000, unit: 'pixel' },
    },
    {
      name: 'Collapsed',
      type: 'Object',
      area: { x: 0.5, y: 0.5, width: 0, height: 0.2, unit: 'normalized' },
      appliedToDimensions: null,
    },
    {
      name: 'Northern Rough-winged Swallow',
      type: 'Object',
      area: { x: 0.47, y: 0.39, width: 0.25, height: 0.31, unit: 'normalized' },
      appliedToDimensions: null,
    },
  ]

  assert.deepEqual(
    getRenderablePhotoRegions(regions).map(region => region.name),
    ['Northern Rough-winged Swallow'],
  )
})

it('getRenderablePhotoRegions uses the photo dimensions when pixel regions omit their own dimensions', () => {
  const region: PhotoRegion = {
    name: 'Subject',
    type: 'Object',
    area: { x: 2000, y: 1500, width: 1000, height: 800, unit: 'pixel' },
    appliedToDimensions: null,
  }

  assert.deepEqual(getRenderablePhotoRegions([region]), [])
  assert.deepEqual(getRenderablePhotoRegions([region], 6000, 4000), [region])
})

it('getRenderablePhotoRegions restores missing area data from XMP metadata', () => {
  const region: PhotoRegion = {
    name: '家鸦',
    type: 'Face',
    area: null,
    appliedToDimensions: { width: 5376, height: 4032, unit: 'pixel' },
  }

  assert.deepEqual(
    getRenderablePhotoRegions([region], 5376, 4032, undefined, {
      RegionList: [
        {
          Name: '家鸦',
          Type: 'Face',
          Area: { X: 0.45925, Y: 0.51667, W: 0.26389, H: 0.35185 },
        },
      ],
    }),
    [
      {
        ...region,
        area: { x: 0.45925, y: 0.51667, width: 0.26389, height: 0.35185, unit: 'normalized' },
      },
    ],
  )
})

it('places floating labels below regions near the overlay top edge', () => {
  assert.equal(getFloatingLabelPosition(0.02, 1000), 'below')
  assert.equal(getFloatingLabelPosition(0.1, 1000), 'above')
})

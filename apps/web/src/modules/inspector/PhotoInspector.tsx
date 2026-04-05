import type { PickedExif } from '@afilmory/builder'
import type { FC } from 'react'

import { injectConfig, siteConfig } from '~/config'
import { ExifPanel } from '~/modules/metadata/ExifPanel'
import type { PhotoManifest } from '~/types/photo'

import { InspectorPanel } from './InspectorPanel'

export interface PhotoInspectorProps {
  currentPhoto: PhotoManifest
  exifData: PickedExif | null
  visible?: boolean
  onClose?: () => void
}

const CloudInspector: FC<PhotoInspectorProps> = (props) => <InspectorPanel {...props} />

const LegacyInspector: FC<PhotoInspectorProps> = ({ currentPhoto, exifData, ...rest }) => (
  <ExifPanel currentPhoto={currentPhoto} exifData={exifData} {...rest} />
)

const shouldUseInspectorTabs = injectConfig.useCloud || siteConfig.comments?.provider === 'waline'

export const PhotoInspector: FC<PhotoInspectorProps> = shouldUseInspectorTabs ? CloudInspector : LegacyInspector

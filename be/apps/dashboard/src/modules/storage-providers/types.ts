export type StorageProviderType = string

export interface StorageProvider {
  id: string
  name: string
  type: StorageProviderType
  config: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

export interface StorageProvidersPayload {
  providers: StorageProvider[]
  activeProviderId: string | null
}

export interface StorageSettingEntry {
  key: string
  value: string
}

export interface StorageProviderFieldDefinition {
  key: string
  label: string
  placeholder?: string | null
  description?: string | null
  helperText?: string | null
  multiline?: boolean
  sensitive?: boolean
  required?: boolean
}

export interface StorageProviderFormSchema {
  types: ReadonlyArray<{ value: StorageProviderType, label: string }>
  fields: Record<string, ReadonlyArray<StorageProviderFieldDefinition>>
}

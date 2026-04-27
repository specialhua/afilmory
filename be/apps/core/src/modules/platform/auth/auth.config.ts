import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { injectable } from 'tsyringe'

export interface SocialProviderOptions {
  clientId: string
  clientSecret: string
}

export interface SocialProvidersConfig {
  google?: SocialProviderOptions
  github?: SocialProviderOptions
}

export interface AuthModuleOptions {
  prefix: string
  useDrizzle: boolean
  socialProviders: SocialProvidersConfig
  baseDomain: string
  oauthGatewayUrl: string | null
}

@injectable()
export class AuthConfig {
  constructor(private readonly systemSettings: SystemSettingService) {}

  async getOptions(): Promise<AuthModuleOptions> {
    const prefix = '/auth'
    const { socialProviders, baseDomain, oauthGatewayUrl } = await this.systemSettings.getAuthModuleConfig()

    return {
      prefix,
      useDrizzle: true,
      socialProviders,
      baseDomain,
      oauthGatewayUrl,
    }
  }
}

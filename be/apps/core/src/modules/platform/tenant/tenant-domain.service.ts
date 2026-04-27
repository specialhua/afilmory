import { randomBytes } from 'node:crypto'
import { promises as dns } from 'node:dns'

import { DEFAULT_BASE_DOMAIN } from '@afilmory/utils'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { injectable } from 'tsyringe'

import { TenantService } from './tenant.service'
import type { TenantDomainAggregate, TenantDomainRecord } from './tenant.types'
import { TenantDomainRepository } from './tenant-domain.repository'

@injectable()
export class TenantDomainService {
  private readonly log = logger.extend('TenantDomainService')
  private readonly verificationTxtLabel = '_afilmory-verification'

  constructor(
    private readonly repository: TenantDomainRepository,
    private readonly tenantService: TenantService,
    private readonly systemSettings: SystemSettingService,
  ) {}

  async resolveTenantByDomain(host: string): Promise<TenantDomainAggregate | null> {
    const normalized = this.normalizeDomain(host)
    if (!normalized) {
      return null
    }

    const aggregate = await this.repository.findActiveByDomain(normalized)
    if (!aggregate) {
      return null
    }

    this.tenantService.ensureTenantIsActive(aggregate.tenant)
    return aggregate
  }

  async listDomainsForTenant(): Promise<TenantDomainRecord[]> {
    const tenantContext = requireTenantContext()
    return await this.repository.listByTenant(tenantContext.tenant.id)
  }

  async requestDomain(domain: string): Promise<TenantDomainAggregate> {
    const tenantContext = requireTenantContext()
    const normalized = this.normalizeDomain(domain)
    if (!normalized) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, { message: '域名不能为空' })
    }

    const baseDomain = await this.getBaseDomain()
    if (normalized === baseDomain || normalized.endsWith(`.${baseDomain}`)) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '无需绑定主域名或其子域名' })
    }

    const existing = await this.repository.findByDomain(normalized)
    if (existing && existing.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: '该域名已被其他空间绑定' })
    }

    if (existing) {
      if (existing.domain.status === 'verified') {
        return existing
      }
      const verificationToken = this.generateVerificationToken()
      return await this.repository.updateDomain(existing.domain.id, {
        status: 'pending',
        verificationToken,
        verifiedAt: null,
      })
    }

    const verificationToken = this.generateVerificationToken()
    return await this.repository.createDomain({
      tenantId: tenantContext.tenant.id,
      domain: normalized,
      verificationToken,
    })
  }

  async verifyDomain(domainId: string): Promise<TenantDomainAggregate> {
    const tenantContext = requireTenantContext()
    const aggregate = await this.repository.findById(domainId)
    if (!aggregate) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '未找到该域名记录' })
    }
    if (aggregate.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, { message: '无法操作其他空间的域名' })
    }

    if (aggregate.domain.status === 'verified') {
      return aggregate
    }

    this.tenantService.ensureTenantIsActive(aggregate.tenant)

    const verification = await this.performDnsVerification(aggregate.domain)
    if (!verification.ok) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: verification.reason ?? '域名未正确指向，请稍后再试',
      })
    }

    return await this.repository.updateDomain(aggregate.domain.id, {
      status: 'verified',
      verifiedAt: new Date().toISOString(),
    })
  }

  async deleteDomain(domainId: string): Promise<void> {
    const tenantContext = requireTenantContext()
    const aggregate = await this.repository.findById(domainId)
    if (!aggregate) {
      return
    }
    if (aggregate.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, { message: '无法操作其他空间的域名' })
    }
    await this.repository.deleteDomain(domainId)
  }

  private normalizeDomain(value?: string | null): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) {
      return null
    }

    const withoutProtocol = trimmed.replace(/^https?:\/\//, '')
    const [hostname] = withoutProtocol.split('/', 1)
    const [hostWithoutPort] = hostname.split(':', 1)
    const normalized = hostWithoutPort.endsWith('.') ? hostWithoutPort.slice(0, -1) : hostWithoutPort

    return normalized.length > 0 ? normalized : null
  }

  private generateVerificationToken(): string {
    return randomBytes(16).toString('hex')
  }

  private async performDnsVerification(domain: TenantDomainRecord): Promise<{ ok: boolean; reason?: string }> {
    const baseDomain = await this.getBaseDomain()
    const normalizedBase = baseDomain.toLowerCase()
    const token = domain.verificationToken ?? ''

    const txtHosts = [domain.domain, `${this.verificationTxtLabel}.${domain.domain}`]
    this.log.verbose('Starting DNS verification', {
      domainId: domain.id,
      domain: domain.domain,
      tokenPresent: token.length > 0,
      txtHosts,
    })
    const txtRecordsPerHost = await Promise.all(txtHosts.map((host) => this.resolveTxt(host)))
    const txtMatches = token.length > 0 && this.txtContainsToken(txtRecordsPerHost.flat(), token)

    if (txtMatches) {
      this.log.info('DNS verification via TXT succeeded', {
        domainId: domain.id,
        domain: domain.domain,
        txtHosts,
        txtRecords: txtRecordsPerHost,
      })
      return { ok: true }
    }

    const cnameChain = await this.resolveCnameChain(domain.domain)
    const cnameTerminal = cnameChain.at(-1)
    const pointsToBase = cnameTerminal ? this.matchesBaseDomain(cnameTerminal, normalizedBase) : false
    const reasonDetails = pointsToBase
      ? '已检测到 CNAME 指向基础域名，但缺少 TXT 验证记录'
      : cnameChain.length > 0
        ? `当前 CNAME 链终点为 ${cnameTerminal ?? cnameChain.at(-1)}`
        : '未检测到 CNAME 记录'

    this.log.warn('DNS verification failed', {
      domainId: domain.id,
      domain: domain.domain,
      txtHosts,
      txtMatches,
      txtRecords: txtRecordsPerHost,
      cnameChain,
      pointsToBase,
    })

    return {
      ok: false,
      reason: `未找到包含验证 token 的 TXT 记录；${reasonDetails}`,
    }
  }

  private async resolveCnameChain(domain: string): Promise<string[]> {
    const resolvers = await this.getResolvers(domain)
    for (const resolver of resolvers) {
      try {
        const chain: string[] = []
        const visited = new Set<string>()
        let current = domain

        while (!visited.has(current) && chain.length < 10) {
          visited.add(current)
          const records = await resolver.resolveCname(current)
          if (!records?.length) break
          const target = records[0].replace(/\.$/, '').toLowerCase()
          chain.push(target)
          current = target
        }

        return chain
      } catch (error) {
        this.log.debug(`resolveCname failed for ${domain} via resolver`, error)
      }
    }
    return []
  }

  private async resolveTxt(domain: string): Promise<string[][]> {
    const resolvers = await this.getResolvers(domain)
    for (const resolver of resolvers) {
      try {
        return await resolver.resolveTxt(domain)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') {
          this.log.debug(`resolveTxt no data for ${domain} via resolver`, error)
          return []
        }
        this.log.debug(`resolveTxt failed for ${domain} via resolver`, error)
      }
    }
    return []
  }

  private async getResolvers(domain: string): Promise<Array<typeof dns | dns.Resolver>> {
    const resolvers: Array<typeof dns | dns.Resolver> = []

    const authoritative = await this.createAuthoritativeResolver(domain)
    if (authoritative) {
      resolvers.push(authoritative)
    }

    resolvers.push(dns)
    return resolvers
  }

  private async createAuthoritativeResolver(domain: string): Promise<dns.Resolver | null> {
    try {
      const nameServers = await dns.resolveNs(domain)
      if (nameServers.length === 0) {
        return null
      }
      const resolver = new dns.Resolver()
      resolver.setServers(nameServers)
      return resolver
    } catch (error) {
      this.log.debug(`resolveNs failed for ${domain}`, error)
      return null
    }
  }

  private txtContainsToken(records: string[][], token: string): boolean {
    return records.some((entries) => entries.some((txt) => txt.includes(token)))
  }

  private matchesBaseDomain(target: string, baseDomain: string): boolean {
    const normalizedTarget = target.trim().toLowerCase().replace(/\.$/, '')
    const normalizedBase = baseDomain.trim().toLowerCase().replace(/\.$/, '')

    return normalizedTarget === normalizedBase || normalizedTarget.endsWith(`.${normalizedBase}`)
  }

  private async getBaseDomain(): Promise<string> {
    const settings = await this.systemSettings.getSettings()
    return settings.baseDomain || DEFAULT_BASE_DOMAIN
  }
}

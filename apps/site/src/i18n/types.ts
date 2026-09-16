export type Locale = 'zh' | 'en'

export interface Translations {
  meta: {
    title: string
    description: string
  }
  nav: {
    features?: string
    demo: string
    discover: string
    docs: string
    github: string
    login: string
    create: string
    lang: string
  }
  hero: {
    eyebrow: string
    title: string
    subtitle: string
    cta: string
    login: string
    secondary: string
    note: string
    appStoreEyebrow: string
    appStore: string
  }
  bento: {
    eyebrow: string
    title: string
    subtitle: string
    exif: {
      badge: string
      title: string
      description: string
    }
    color: {
      badge: string
      title: string
      description: string
    }
    live: {
      badge: string
      title: string
      description: string
    }
    map: {
      badge: string
      title: string
      description: string
    }
    arch: {
      badge: string
      title: string
      description: string
    }
  }
  demo: {
    label: string
    chapters: {
      grid: { index: string, title: string, body: string }
      lightbox: { index: string, title: string, body: string }
      create: { index: string, title: string, body: string, cta: string }
    }
    exif: {
      headerTitle: string
      basicInfo: string
      captureParams: string
      deviceInfo: string
      filename: string
      format: string
      dimensions: string
      size: string
      pixels: string
      colorSpace: string
      dateTaken: string
      camera: string
      lens: string
      focalActual: string
      focalEquiv: string
    }
  }
  createModal: {
    label: string
    title: string
    description: string
    inputLabel: string
    placeholder: string
    domainSuffix: string
    tipsTitle: string
    tips: string[]
    button: string
    buttonPending: string
    close: string
    validations: {
      required: string
      minLength: string
      invalid: string
    }
    errors: {
      generic: string
      network: string
      missingRedirect: string
    }
  }
  loginModal: {
    label: string
    title: string
    description: string
    inputLabel: string
    placeholder: string
    domainSuffix: string
    button: string
    close: string
    validations: {
      required: string
      minLength: string
      invalid: string
    }
  }
  discover: {
    label: string
    title: string
    description: string
    photos: string
    loading: string
    empty: string
    error: string
  }
  footer: {
    terms: string
    privacy: string
    docs: string
    github: string
    selfHost: string
    appStore: string
    copy: string
  }
}

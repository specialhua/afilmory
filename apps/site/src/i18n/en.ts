import type { Translations } from './types'

export const en: Translations = {
  meta: {
    title: 'Afilmory — Give your photos a real exhibition',
    description:
      'Turn photographs into an online exhibition instead of burying them in cloud storage. Your space, careful viewing, live in minutes.',
  },
  nav: {
    features: 'Features',
    demo: 'Exhibition',
    discover: 'Galleries',
    docs: 'Docs',
    github: 'GitHub',
    login: 'Log in',
    create: 'Create space',
    lang: '中文',
  },
  hero: {
    eyebrow: 'A Film + Memory',
    title: 'Photos should not live in a drive.',
    subtitle:
      'They deserve an exhibition floor. Afilmory gives you a space of your own: hang work in your order, open a frame to read EXIF, share a link that feels like a show.',
    cta: 'Create my space',
    login: 'Log in',
    secondary: 'Explore exhibition →',
    note: 'SaaS live in minutes · self-host if you prefer',
    appStoreEyebrow: 'Download on the',
    appStore: 'App Store',
  },
  bento: {
    eyebrow: 'Crafted for Photographers',
    title: 'Precision in every detail.',
    subtitle:
      'From color spaces and sensor ratios to lossless EXIF inspection and interactive map journeys, Afilmory treats digital photography with real respect.',
    exif: {
      badge: 'Sensor & Optics',
      title: 'Geek-grade EXIF Inspector',
      description:
        'Read full exposure triangles, sensor models, focal lengths, and lenses directly from image headers with zero compression.',
    },
    color: {
      badge: 'Dynamic Aesthetics',
      title: 'Adaptive Ambience',
      description:
        'Background radiance and translucent glass chrome dynamically harmonize with the dominant tones of the active photograph.',
    },
    live: {
      badge: 'Time & Motion',
      title: 'Live Photos & Parallax',
      description:
        'Long press or hover to play original Live Photos with synchronized audio and fluid motion gestures.',
    },
    map: {
      badge: 'Geography & Travel',
      title: 'MapLibre Footprints',
      description:
        'Trace journeys across the world with vector tile clusters, GPS pins, and chronological location tracks.',
    },
    arch: {
      badge: 'Freedom of Choice',
      title: 'SaaS & Self-Hosting',
      description: 'Host on our zero-config cloud or deploy your own node with Docker, S3, MinIO, and Cloudflare.',
    },
  },
  demo: {
    label: 'Live exhibition',
    chapters: {
      grid: {
        index: '01',
        title: 'Hung on the wall first.',
        body: 'Not a folder of thumbnails. Work laid out by proportion — scrolling is walking the room. Click a frame to look closer.',
      },
      lightbox: {
        index: '02',
        title: 'Look carefully. Specs stay.',
        body: 'Large image, camera, lens, aperture, shutter, ISO beside it — how photographers look, not another social swipe.',
      },
      create: {
        index: '03',
        title: 'Your gallery next.',
        body: 'Pick a short name for your URL. You decide the order. Visitors open an exhibition, not a dump.',
        cta: 'Create my space',
      },
    },
    exif: {
      headerTitle: 'Photo Inspector',
      basicInfo: 'Basic Information',
      captureParams: 'Capture Parameters',
      deviceInfo: 'Device Information',
      filename: 'Filename',
      format: 'Format',
      dimensions: 'Dimensions',
      size: 'File Size',
      pixels: 'Pixels',
      colorSpace: 'Color Space',
      dateTaken: 'Capture Time',
      camera: 'Camera',
      lens: 'Lens',
      focalActual: 'Focal Length',
      focalEquiv: '35mm Equivalent',
    },
  },
  createModal: {
    label: 'Create space',
    title: 'Create your space',
    description: 'Choose a unique name. It becomes your URL.',
    inputLabel: 'Space name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    tipsTitle: 'Good to know:',
    tips: [
      'Name must be 3-32 characters (letters, numbers, hyphens)',
      'Free tier includes up to 500 photos and 5GB storage',
      'You can map a custom domain anytime in settings',
    ],
    button: 'Create space',
    buttonPending: 'Creating...',
    close: 'Close',
    validations: {
      required: 'Please enter a space name',
      minLength: 'Space name must be at least 3 characters',
      invalid: 'Only lowercase letters, numbers, and hyphens are allowed',
    },
    errors: {
      generic: 'Failed to create space. Please try again.',
      network: 'Network error. Please check your connection.',
      missingRedirect: 'Server responded, but redirect URL was missing.',
    },
  },
  loginModal: {
    label: 'Log in',
    title: 'Enter your space',
    description: 'Enter your space name to open the dashboard.',
    inputLabel: 'Space name',
    placeholder: 'your-name',
    domainSuffix: '.afilmory.art',
    button: 'Go to space',
    close: 'Close',
    validations: {
      required: 'Please enter a space name',
      minLength: 'Space name must be at least 3 characters',
      invalid: 'Only lowercase letters, numbers, and hyphens are allowed',
    },
  },
  discover: {
    label: 'Community galleries',
    title: 'Spaces in the wild',
    description: 'Explore live exhibitions curated by photographers using Afilmory.',
    photos: 'photos',
    loading: 'Loading galleries...',
    empty: 'No featured galleries yet.',
    error: 'Failed to load galleries.',
  },
  footer: {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    docs: 'Documentation',
    github: 'GitHub',
    selfHost: 'Self-Host Guide',
    appStore: 'App Store',
    copy: 'Give your photos a real exhibition.',
  },
}

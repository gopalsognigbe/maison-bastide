const STORAGE_KEY = 'maison-bastide-lang'

export const LOCALES = ['fr', 'en']

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || 'fr').toLowerCase()
  return nav.startsWith('en') ? 'en' : 'fr'
}

export function persistLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

const copy = {
  fr: {
    cursorScroll: 'Défiler',
    cursorRead: 'Lire',
    navCta: 'Nos cafés',
    navLabel: 'Navigation principale',
    langSwitch: 'EN',
    langSwitchAria: 'Switch to English',
    loaderBrand: 'Maison Bastide',
    heroAria: 'Héros',
    heroSr:
      'Maison Bastide — Le café comme un métier d’art. Parlons de votre prochain café.',
    heroScroll: 'Faites défiler',
    heroTechOrigin: 'HUILA · COLOMBIE',
    heroTechDetail: '1750 M · LAVÉ · CATURRA',
    beats: {
      1: ['Le café', 'comme un', 'métier d’art'],
      2: ['Torréfié', 'par petites', 'mains, à feu lent'],
      3: ['Des origines', 'choisies,', 'une signature nette'],
      4: ['Chaque lot', 'a son tempo,', 'sa propre chaleur'],
      5: ['Parlons de', 'votre prochain', 'café'],
    },
    metierLabel: 'Le métier',
    metierTitle1: 'Une torréfaction lente,',
    metierTitle2: 'au service du grain',
    metierText:
      'Maison Bastide sélectionne des cafés de terroir, les torréfie par petits lots et les livre à leur pic aromatique. Chaque origine est traitée pour révéler sa signature — jamais pour la masquer.',
    originesLabel: 'Origines',
    originesTitle: 'Trois terroirs, trois signatures',
    origines: [
      {
        name: 'Huila, Colombie',
        note: 'Fruits rouges, sucre roux',
        detail: '1750 M · LAVÉ · CATURRA',
      },
      {
        name: 'Yirgacheffe, Éthiopie',
        note: 'Bergamote, thé noir',
        detail: '2000 M · NATUREL · HEIRLOOM',
      },
      {
        name: 'Nariño, Colombie',
        note: 'Cacao, noisette',
        detail: '1900 M · HONEY · CASTILLO',
      },
    ],
    ctaTitle: 'Goûtez la prochaine récolte',
    ctaText:
      'Abonnez-vous à la sélection saisonnière et recevez chaque mois un café fraîchement torréfié, avec sa fiche de dégustation.',
    ctaButton: 'Nous contacter',
    contactLabel: 'Contact',
    contactTitle: 'Parlons de votre prochain café',
    contactText:
      'Commande, collaboration, torréfaction sur mesure — écrivez-nous.',
    footerCopy: 'Torréfaction artisanale · Depuis 2014',
  },
  en: {
    cursorScroll: 'Scroll',
    cursorRead: 'Read',
    navCta: 'Our coffees',
    navLabel: 'Main navigation',
    langSwitch: 'FR',
    langSwitchAria: 'Passer en français',
    loaderBrand: 'Maison Bastide',
    heroAria: 'Hero',
    heroSr:
      'Maison Bastide — Coffee as a craft. Let’s talk about your next coffee.',
    heroScroll: 'Scroll',
    heroTechOrigin: 'HUILA · COLOMBIA',
    heroTechDetail: '1750 M · WASHED · CATURRA',
    beats: {
      1: ['Coffee', 'as a', 'craft'],
      2: ['Roasted', 'by small hands,', 'over a slow fire'],
      3: ['Origins', 'chosen,', 'a clear signature'],
      4: ['Each lot', 'has its tempo,', 'its own heat'],
      5: ['Let’s talk', 'about your next', 'coffee'],
    },
    metierLabel: 'The craft',
    metierTitle1: 'A slow roast,',
    metierTitle2: 'in service of the bean',
    metierText:
      'Maison Bastide sources terroir coffees, roasts them in small lots, and ships them at peak aroma. Each origin is treated to reveal its signature — never to mask it.',
    originesLabel: 'Origins',
    originesTitle: 'Three terroirs, three signatures',
    origines: [
      {
        name: 'Huila, Colombia',
        note: 'Red fruit, raw sugar',
        detail: '1750 M · WASHED · CATURRA',
      },
      {
        name: 'Yirgacheffe, Ethiopia',
        note: 'Bergamot, black tea',
        detail: '2000 M · NATURAL · HEIRLOOM',
      },
      {
        name: 'Nariño, Colombia',
        note: 'Cacao, hazelnut',
        detail: '1900 M · HONEY · CASTILLO',
      },
    ],
    ctaTitle: 'Taste the next harvest',
    ctaText:
      'Subscribe to the seasonal selection and receive a freshly roasted coffee each month, with its tasting notes.',
    ctaButton: 'Contact us',
    contactLabel: 'Contact',
    contactTitle: 'Let’s talk about your next coffee',
    contactText:
      'Orders, collaborations, custom roasting — write to us.',
    footerCopy: 'Artisan roasting · Since 2014',
  },
}

export function t(lang) {
  return copy[lang] || copy.fr
}

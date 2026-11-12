import type { ProductDocument } from '@ecommerce/shared';

export interface DemoCategorySeed {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
}

export interface DemoProductSeed {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  pricePaise: number;
  compareAtPaise: number | null;
  sku: string;
  stock: number;
  categorySlug: string;
  images: string[];
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  ratingAvg: number;
  reviewCount: number;
}

export const DEMO_CATEGORIES: DemoCategorySeed[] = [
  {
    id: 'cat-audio',
    name: 'Audio & Headphones',
    slug: 'audio-headphones',
    description: 'Studio headphones, ANC earbuds, and wireless speakers.',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'cat-keyboards',
    name: 'Mechanical Keyboards',
    slug: 'mechanical-keyboards',
    description: 'Hot-swappable wireless keyboards, keycaps, and switches.',
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'cat-smarthome',
    name: 'Smart Home & Lighting',
    slug: 'smart-home-lighting',
    description: 'Ambient desk lamps, smart displays, and air purifiers.',
    imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'cat-wearables',
    name: 'Wearables & Watches',
    slug: 'wearables-watches',
    description: 'AMOLED fitness trackers and minimalist smartwatches.',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'cat-desk',
    name: 'Desk & Studio Gear',
    slug: 'desk-studio-gear',
    description: 'Ergonomic laptop stands, GaN chargers, and Thunderbolt hubs.',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'cat-creator',
    name: 'Creator & Camera Gear',
    slug: 'creator-camera-gear',
    description: 'Mirrorless cameras, studio microphones, and pocket gimbals.',
    imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80',
  },
];

export const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    id: 'prod-sony-xm5',
    title: 'Sony WH-1000XM5 Studio ANC Headphones',
    slug: 'sony-wh-1000xm5-studio-anc',
    description:
      'Industry-leading adaptive noise cancellation with 8 microphones, 30-hour battery life, multipoint Bluetooth 5.2, and plush synthetic leather earpads.',
    brand: 'Sony',
    pricePaise: 2499000,
    compareAtPaise: 2999000,
    sku: 'AUD-SONY-XM5',
    stock: 18,
    categorySlug: 'audio-headphones',
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { color: 'Midnight Black', battery: '30 Hours', anc: true, bluetooth: '5.2' },
    tags: ['anc', 'wireless', 'audiophile', 'bluetooth'],
    ratingAvg: 4.9,
    reviewCount: 42,
  },
  {
    id: 'prod-senn-m4',
    title: 'Sennheiser Momentum 4 Wireless Over-Ear',
    slug: 'sennheiser-momentum-4-wireless',
    description:
      'Signature 42mm transducer clarity with up to 60 hours of playback, smart pause, and custom sound personalization.',
    brand: 'Sennheiser',
    pricePaise: 2299000,
    compareAtPaise: 2699000,
    sku: 'AUD-SENN-M4',
    stock: 14,
    categorySlug: 'audio-headphones',
    images: [
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { color: 'Graphite', battery: '60 Hours', anc: true, driver: '42mm' },
    tags: ['wireless', 'studio', 'headphones'],
    ratingAvg: 4.8,
    reviewCount: 28,
  },
  {
    id: 'prod-marshall-emb2',
    title: 'Marshall Emberton II Portable Bluetooth Speaker',
    slug: 'marshall-emberton-ii-speaker',
    description:
      '360-degree True Stereophonic outdoor sound in an IP67 dust- and waterproof iconic chassis with 30+ hours of playtime.',
    brand: 'Marshall',
    pricePaise: 1499900,
    compareAtPaise: 1799900,
    sku: 'AUD-MAR-EMB2',
    stock: 16,
    categorySlug: 'audio-headphones',
    images: [
      'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { rating: 'IP67', battery: '30+ Hours', bluetooth: '5.1' },
    tags: ['speaker', 'portable', 'bluetooth'],
    ratingAvg: 4.7,
    reviewCount: 31,
  },
  {
    id: 'prod-bose-qc-ultra',
    title: 'Bose QuietComfort Ultra Spatial Earbuds',
    slug: 'bose-quietcomfort-ultra-earbuds',
    description:
      'CustomTune world-class noise cancellation in true wireless earbuds with Immersive Audio and IPX4 sweat resistance.',
    brand: 'Bose',
    pricePaise: 1999000,
    compareAtPaise: 2590000,
    sku: 'AUD-BOSE-QCU',
    stock: 22,
    categorySlug: 'audio-headphones',
    images: [
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { anc: true, battery: '24 Hours w/ Case', waterResistance: 'IPX4' },
    tags: ['earbuds', 'anc', 'spatial-audio', 'wireless'],
    ratingAvg: 4.6,
    reviewCount: 19,
  },
  {
    id: 'prod-keychron-q1p',
    title: 'Keychron Q1 Pro QMK/VIA Aluminum Keyboard',
    slug: 'keychron-q1-pro-qmk-aluminum',
    description:
      'CNC-machined 6063 aluminum wireless mechanical keyboard with gasket mount, PBT double-shot keycaps, and hot-swappable tactile switches.',
    brand: 'Keychron',
    pricePaise: 1749900,
    compareAtPaise: 1999900,
    sku: 'KEY-KCH-Q1P',
    stock: 25,
    categorySlug: 'mechanical-keyboards',
    images: [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { layout: '75%', switches: 'Banana Tactile', wireless: true, frame: 'Aluminum' },
    tags: ['mechanical', 'qmk', 'via', 'wireless', 'mac-windows'],
    ratingAvg: 4.9,
    reviewCount: 54,
  },
  {
    id: 'prod-nuphy-air75',
    title: 'NuPhy Air75 V2 Low-Profile Mechanical',
    slug: 'nuphy-air75-v2-low-profile',
    description:
      'Ultra-slim tri-mode wireless mechanical keyboard with 1000Hz 2.4GHz polling, PBT keycaps, and multi-OS QMK firmware.',
    brand: 'NuPhy',
    pricePaise: 1199900,
    compareAtPaise: 1399900,
    sku: 'KEY-NUP-A75',
    stock: 30,
    categorySlug: 'mechanical-keyboards',
    images: [
      'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { layout: '75% Low Profile', switches: 'Moss', polling: '1000Hz' },
    tags: ['low-profile', 'portable', 'mechanical'],
    ratingAvg: 4.8,
    reviewCount: 37,
  },
  {
    id: 'prod-wooting-60he',
    title: 'Wooting 60HE+ Rapid Trigger Hall-Effect Keyboard',
    slug: 'wooting-60he-plus-rapid-trigger',
    description:
      'Magnetic Lekker analog switches with adjustable 0.1mm actuation point, Rapid Trigger reset, and zero-latency esports performance.',
    brand: 'Wooting',
    pricePaise: 1899900,
    compareAtPaise: 2149900,
    sku: 'KEY-WOO-60HE',
    stock: 11,
    categorySlug: 'mechanical-keyboards',
    images: [
      'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { layout: '60%', switches: 'Lekker L60 Magnetic', actuation: '0.1mm - 4.0mm' },
    tags: ['hall-effect', 'gaming', 'esports', 'mechanical'],
    ratingAvg: 4.9,
    reviewCount: 64,
  },
  {
    id: 'prod-benq-halo',
    title: 'BenQ ScreenBar Halo Desk Monitor Light',
    slug: 'benq-screenbar-halo-monitor-light',
    description:
      'Asymmetric optical monitor light bar with wireless rotary puck controller, warm-to-cool stepless dimming, and zero screen glare.',
    brand: 'BenQ',
    pricePaise: 1499000,
    compareAtPaise: 1699000,
    sku: 'SHM-BENQ-HALO',
    stock: 12,
    categorySlug: 'smart-home-lighting',
    images: [
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { cri: 'Ra>95', control: 'Wireless Dial', colorTemp: '2700K-6500K' },
    tags: ['lighting', 'desk-setup', 'monitor-bar'],
    ratingAvg: 4.8,
    reviewCount: 23,
  },
  {
    id: 'prod-philips-hue',
    title: 'Philips Hue Gradient Ambience Smart Lamp',
    slug: 'philips-hue-gradient-smart-lamp',
    description:
      'Multi-color gradient desk lamp compatible with Matter, Apple HomeKit, and Google Home for warm evenings or focus sessions.',
    brand: 'Philips',
    pricePaise: 949900,
    compareAtPaise: 1149900,
    sku: 'SHM-PHIL-HUE',
    stock: 22,
    categorySlug: 'smart-home-lighting',
    images: [
      'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { protocol: 'Matter / Zigbee', lumens: 1000 },
    tags: ['smart-home', 'lighting', 'rgb'],
    ratingAvg: 4.6,
    reviewCount: 18,
  },
  {
    id: 'prod-dyson-solarcycle',
    title: 'Dyson Solarcycle Morph Desk Task Light',
    slug: 'dyson-solarcycle-morph-desk-light',
    description:
      'Intelligent daylight-tracking LED desk light with heat-pipe cooling, magnetic 360-degree optical head, and ambient glow mode.',
    brand: 'Dyson',
    pricePaise: 4990000,
    compareAtPaise: 5490000,
    sku: 'SHM-DYS-SOLAR',
    stock: 6,
    categorySlug: 'smart-home-lighting',
    images: [
      'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { cri: '90+', lifeRating: '60 Years', appControl: 'MyDyson' },
    tags: ['architectural', 'desk-lamp', 'smart-home'],
    ratingAvg: 4.7,
    reviewCount: 11,
  },
  {
    id: 'prod-garmin-265',
    title: 'Garmin Forerunner 265 AMOLED GPS Watch',
    slug: 'garmin-forerunner-265-amoled',
    description:
      'Vibrant AMOLED running smartwatch with multi-band GPS, training readiness insights, HRV tracking, and 13-day battery endurance.',
    brand: 'Garmin',
    pricePaise: 3899000,
    compareAtPaise: 4499000,
    sku: 'WRB-GAR-265',
    stock: 9,
    categorySlug: 'wearables-watches',
    images: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { display: 'AMOLED 1.3"', gps: 'Multi-band', waterRating: '5 ATM' },
    tags: ['fitness', 'gps', 'smartwatch', 'amoled'],
    ratingAvg: 4.9,
    reviewCount: 36,
  },
  {
    id: 'prod-nothing-wp2',
    title: 'Nothing Watch Pro 2 Minimalist Smartwatch',
    slug: 'nothing-watch-pro-2-minimalist',
    description:
      'Interchangeable anodized aluminum bezel, crisp 1.32-inch AMOLED display, Bluetooth calling, and 11-day battery.',
    brand: 'Nothing',
    pricePaise: 499900,
    compareAtPaise: 599900,
    sku: 'WRB-NTH-WP2',
    stock: 40,
    categorySlug: 'wearables-watches',
    images: [
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { display: 'AMOLED 1.32"', battery: '11 Days', bezel: 'Swappable' },
    tags: ['smartwatch', 'budget', 'minimal'],
    ratingAvg: 4.5,
    reviewCount: 51,
  },
  {
    id: 'prod-apple-watch-s10',
    title: 'Apple Watch Series 10 Titanium 46mm GPS',
    slug: 'apple-watch-series-10-46mm',
    description:
      'Wide-angle OLED display in a thin grade-5 titanium case with fast 30-minute charging, ECG, and sleep apnea notifications.',
    brand: 'Apple',
    pricePaise: 4690000,
    compareAtPaise: 4990000,
    sku: 'WRB-APL-S10',
    stock: 8,
    categorySlug: 'wearables-watches',
    images: [
      'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { size: '46mm', display: 'Wide-Angle OLED', waterResistance: '50m' },
    tags: ['apple', 'smartwatch', 'wearable'],
    ratingAvg: 4.8,
    reviewCount: 29,
  },
  {
    id: 'prod-anker-140w',
    title: 'Anker Prime 140W 4-Port GaN Charger',
    slug: 'anker-prime-140w-gan-charger',
    description:
      'Compact GaN fast charger with dual 140W USB-C PD 3.1 ports, real-time wattage LCD display, and ActiveShield thermal monitoring.',
    brand: 'Anker',
    pricePaise: 649900,
    compareAtPaise: 799900,
    sku: 'DSK-ANK-140W',
    stock: 35,
    categorySlug: 'desk-studio-gear',
    images: [
      'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { output: '140W PD 3.1', ports: '3x USB-C, 1x USB-A', gan: true },
    tags: ['charger', 'gan', 'usb-c', 'laptop'],
    ratingAvg: 4.8,
    reviewCount: 47,
  },
  {
    id: 'prod-logi-mx3s',
    title: 'Logitech MX Master 3S Wireless Performance Mouse',
    slug: 'logitech-mx-master-3s-wireless',
    description:
      '8000 DPI quiet-click productivity mouse with MagSpeed electromagnetic scroll wheel and multi-device Flow switching.',
    brand: 'Logitech',
    pricePaise: 899500,
    compareAtPaise: 1099500,
    sku: 'DSK-LOG-MX3S',
    stock: 28,
    categorySlug: 'desk-studio-gear',
    images: [
      'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { sensor: '8000 DPI', quietClick: true, charging: 'USB-C' },
    tags: ['mouse', 'ergonomic', 'productivity'],
    ratingAvg: 4.9,
    reviewCount: 83,
  },
  {
    id: 'prod-twelvesouth-stand',
    title: 'Twelve South Curve Flex Aluminum Laptop Stand',
    slug: 'twelve-south-curve-flex-stand',
    description:
      'Adjustable height and angle aluminum laptop riser that folds flat with travel sleeve for studio or cafe desks.',
    brand: 'Twelve South',
    pricePaise: 549900,
    compareAtPaise: 649900,
    sku: 'DSK-TWS-CURVE',
    stock: 20,
    categorySlug: 'desk-studio-gear',
    images: [
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { material: 'Aluminum', weight: '790g', foldable: true },
    tags: ['stand', 'ergonomic', 'macbook'],
    ratingAvg: 4.6,
    reviewCount: 21,
  },
  {
    id: 'prod-caldigit-ts4',
    title: 'CalDigit TS4 Thunderbolt 4 18-Port Pro Dock',
    slug: 'caldigit-ts4-thunderbolt-4-dock',
    description:
      'Single-cable 98W host charging dock with 2.5GbE Ethernet, UHS-II SD/microSD slots, DisplayPort 1.4, and 8 USB ports.',
    brand: 'CalDigit',
    pricePaise: 3299000,
    compareAtPaise: 3699000,
    sku: 'DSK-CAL-TS4',
    stock: 7,
    categorySlug: 'desk-studio-gear',
    images: [
      'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { ports: '18 Ports', hostPower: '98W', ethernet: '2.5GbE' },
    tags: ['thunderbolt', 'dock', 'macbook', 'studio'],
    ratingAvg: 4.9,
    reviewCount: 16,
  },
  {
    id: 'prod-fuji-x100vi',
    title: 'Fujifilm X100VI 40MP APS-C Rangefinder Camera',
    slug: 'fujifilm-x100vi-40mp-camera',
    description:
      'Iconic compact digital camera with 40.2MP X-Trans CMOS 5 HR sensor, 5-axis IBIS, 23mm f/2 lens, and 20 Film Simulations.',
    brand: 'Fujifilm',
    pricePaise: 15999000,
    compareAtPaise: 16999000,
    sku: 'CAM-FUJI-X100VI',
    stock: 4,
    categorySlug: 'creator-camera-gear',
    images: [
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { sensor: '40.2MP APS-C', lens: '23mm f/2', ibis: '6 Stops' },
    tags: ['camera', 'fujifilm', 'street-photography'],
    ratingAvg: 4.9,
    reviewCount: 14,
  },
  {
    id: 'prod-rode-podmic-usb',
    title: 'Rode PodMic USB & XLR Broadcast Microphone',
    slug: 'rode-podmic-usb-xlr-microphone',
    description:
      'Studio dynamic broadcast microphone with dual XLR and USB-C outputs, APHEX DSP processing, and zero-latency headphone monitoring.',
    brand: 'Rode',
    pricePaise: 1799000,
    compareAtPaise: 1999000,
    sku: 'CAM-RODE-PMUSB',
    stock: 19,
    categorySlug: 'creator-camera-gear',
    images: [
      'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { connectivity: 'XLR & USB-C', capsule: 'Dynamic', dsp: 'Revolution Preamp' },
    tags: ['microphone', 'podcast', 'creator', 'usb-c'],
    ratingAvg: 4.8,
    reviewCount: 25,
  },
  {
    id: 'prod-dji-pocket3',
    title: 'DJI Osmo Pocket 3 1-Inch CMOS Creator Combo',
    slug: 'dji-osmo-pocket-3-creator-combo',
    description:
      'Pocket-sized 3-axis gimbal camera with 1-inch CMOS sensor, 4K/120fps D-Log M recording, rotatable 2-inch OLED screen, and wireless Mic 2.',
    brand: 'DJI',
    pricePaise: 5499000,
    compareAtPaise: 5999000,
    sku: 'CAM-DJI-OP3',
    stock: 10,
    categorySlug: 'creator-camera-gear',
    images: [
      'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1000&q=80',
    ],
    attributes: { sensor: '1-inch CMOS', video: '4K 120fps', gimbal: '3-Axis' },
    tags: ['vlog', 'gimbal', 'camera', '4k'],
    ratingAvg: 4.9,
    reviewCount: 33,
  },
];

export function buildDemoProductDocuments(): ProductDocument[] {
  const categoryBySlug = new Map(DEMO_CATEGORIES.map((c) => [c.slug, c]));
  const now = new Date('2026-11-12T00:00:00.000Z').toISOString();

  return DEMO_PRODUCTS.map((p) => {
    const cat = categoryBySlug.get(p.categorySlug) ?? DEMO_CATEGORIES[0];
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      brand: p.brand,
      pricePaise: p.pricePaise,
      compareAtPaise: p.compareAtPaise,
      sku: p.sku,
      stock: p.stock,
      isActive: true,
      images: p.images,
      attributes: p.attributes,
      tags: p.tags,
      ratingAvg: p.ratingAvg,
      reviewCount: p.reviewCount,
      categoryId: cat.id,
      categoryName: cat.name,
      categorySlug: cat.slug,
      createdAt: now,
      updatedAt: now,
    };
  });
}


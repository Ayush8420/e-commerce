import { DiscountType, OutboxStatus, PrismaClient, UserRole } from '@prisma/client';
import { Client } from '@opensearch-project/opensearch';
import * as bcrypt from 'bcryptjs';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from '../src/catalog/demo-catalog.data';
import {
  buildOpenSearchClientOptions,
  getProductIndexDefinition,
} from '../src/search/opensearch.service';

const prisma = new PrismaClient();

export const DEMO_STORES = [
  // Mumbai
  {
    code: 'MUM-FLAGSHIP',
    name: 'AetherMart Flagship Bandra',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Linking Road, Bandra West, Mumbai, MH 400050',
    latitude: 19.0607,
    longitude: 72.8362,
  },
  {
    code: 'MUM-POWAI',
    name: 'AetherMart Tech Hub Powai',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Central Avenue, Hiranandani Gardens, Powai, Mumbai, MH 400076',
    latitude: 19.1197,
    longitude: 72.9051,
  },
  // Pune
  {
    code: 'PUN-FC',
    name: 'AetherMart FC Road Center',
    city: 'Pune',
    state: 'Maharashtra',
    address: 'Fergusson College Road, Shivajinagar, Pune, MH 411004',
    latitude: 18.5246,
    longitude: 73.8412,
  },
  {
    code: 'PUN-VIMAN',
    name: 'AetherMart Viman Nagar Hub',
    city: 'Pune',
    state: 'Maharashtra',
    address: 'Phoenix Marketcity Corridor, Viman Nagar, Pune, MH 411014',
    latitude: 18.5679,
    longitude: 73.9143,
  },
  // Delhi
  {
    code: 'DEL-CP',
    name: 'AetherMart Connaught Place',
    city: 'Delhi',
    state: 'Delhi',
    address: 'Inner Circle, Connaught Place, New Delhi, DL 110001',
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    code: 'DEL-SAKET',
    name: 'AetherMart Saket District Center',
    city: 'Delhi',
    state: 'Delhi',
    address: 'Press Enclave Road, Saket, New Delhi, DL 110017',
    latitude: 28.5284,
    longitude: 77.2185,
  },
  // Bengaluru
  {
    code: 'BLR-INDIRA',
    name: 'AetherMart Indiranagar 100ft',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: '100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, KA 560038',
    latitude: 12.9719,
    longitude: 77.6412,
  },
  {
    code: 'BLR-KORAMANGALA',
    name: 'AetherMart Koramangala Hub',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: '80 Feet Road, 4th Block, Koramangala, Bengaluru, KA 560034',
    latitude: 12.9352,
    longitude: 77.6245,
  },
  // Hyderabad
  {
    code: 'HYD-HITEC',
    name: 'AetherMart Hitec City Experience',
    city: 'Hyderabad',
    state: 'Telangana',
    address: 'Cyber Towers Road, Madhapur, Hitec City, Hyderabad, TG 500081',
    latitude: 17.4474,
    longitude: 78.3762,
  },
  {
    code: 'HYD-BANJARA',
    name: 'AetherMart Banjara Hills',
    city: 'Hyderabad',
    state: 'Telangana',
    address: 'Road No. 12, Banjara Hills, Hyderabad, TG 500034',
    latitude: 17.4156,
    longitude: 78.4357,
  },
  // Chennai
  {
    code: 'CHN-TNAGAR',
    name: 'AetherMart T. Nagar Retail',
    city: 'Chennai',
    state: 'Tamil Nadu',
    address: 'Usman Road, T. Nagar, Chennai, TN 600017',
    latitude: 13.0418,
    longitude: 80.2341,
  },
  {
    code: 'CHN-VELACHERY',
    name: 'AetherMart Velachery Hub',
    city: 'Chennai',
    state: 'Tamil Nadu',
    address: 'Velachery Bypass Road, Chennai, TN 600042',
    latitude: 12.9815,
    longitude: 80.2180,
  },
  // Kolkata
  {
    code: 'KOL-PARKST',
    name: 'AetherMart Park Street',
    city: 'Kolkata',
    state: 'West Bengal',
    address: 'Park Street, Kolkata, WB 700016',
    latitude: 22.5512,
    longitude: 88.3524,
  },
  {
    code: 'KOL-SALTLAKE',
    name: 'AetherMart Salt Lake Sector V',
    city: 'Kolkata',
    state: 'West Bengal',
    address: 'Block EP & GP, Sector V, Bidhannagar, Kolkata, WB 700091',
    latitude: 22.5760,
    longitude: 88.4344,
  },
  // Ahmedabad
  {
    code: 'AMD-SGHIGHWAY',
    name: 'AetherMart SG Highway Flagship',
    city: 'Ahmedabad',
    state: 'Gujarat',
    address: 'Sarkhej - Gandhinagar Hwy, Bodakdev, Ahmedabad, GJ 380054',
    latitude: 23.0435,
    longitude: 72.5173,
  },
  {
    code: 'AMD-CGROAD',
    name: 'AetherMart CG Road Center',
    city: 'Ahmedabad',
    state: 'Gujarat',
    address: 'Chimanlal Girdharlal Rd, Navrangpura, Ahmedabad, GJ 380009',
    latitude: 23.0338,
    longitude: 72.5562,
  },
];

async function main() {
  console.log('Seeding authentication accounts...');
  const adminPasswordHash = await bcrypt.hash('Admin@12345', 10);
  const customerPasswordHash = await bcrypt.hash('Customer@12345', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@aethermart.local' },
    create: {
      email: 'admin@aethermart.local',
      name: 'Aarav Sharma (Admin)',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      emailVerified: true,
    },
    update: {},
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@aethermart.local' },
    create: {
      email: 'customer@aethermart.local',
      name: 'Priya Nair',
      passwordHash: customerPasswordHash,
      role: UserRole.CUSTOMER,
      emailVerified: true,
    },
    update: {},
  });

  console.log('Seeding retail physical stores across India...');
  const seededStores = [];
  for (const storeDef of DEMO_STORES) {
    const store = await prisma.store.upsert({
      where: { code: storeDef.code },
      create: storeDef,
      update: storeDef,
    });
    seededStores.push(store);
  }
  console.log(`Seeded ${seededStores.length} physical stores across 8 Indian cities.`);

  console.log('Seeding product categories...');
  const categories: Record<string, { id: string; name: string; slug: string }> = {};
  for (const def of DEMO_CATEGORIES) {
    const { id: _demoId, ...fields } = def;
    const cat = await prisma.category.upsert({
      where: { slug: def.slug },
      create: fields,
      update: fields,
    });
    categories[def.slug] = cat;
  }

  console.log('Seeding products and per-store inventory...');
  const createdProducts: Array<{ id: string; slug: string }> = [];
  let productIdx = 0;

  for (const def of DEMO_PRODUCTS) {
    const category = categories[def.categorySlug];
    const { id: _demoId, categorySlug: _catSlug, ...rest } = def;
    const product = await prisma.product.upsert({
      where: { slug: def.slug },
      create: {
        ...rest,
        categoryId: category.id,
      },
      update: {
        title: rest.title,
        description: rest.description,
        brand: rest.brand,
        pricePaise: rest.pricePaise,
        compareAtPaise: rest.compareAtPaise,
        images: rest.images,
        attributes: rest.attributes,
        tags: rest.tags,
        categoryId: category.id,
      },
    });
    createdProducts.push({ id: product.id, slug: product.slug });

    // Seed per-store inventory
    let totalStock = 0;
    for (let sIdx = 0; sIdx < seededStores.length; sIdx++) {
      const store = seededStores[sIdx];
      // Create realistic variation: certain items out of stock in a couple of cities for filter testing
      let quantity = 8 + ((productIdx * 3 + sIdx * 5) % 15);
      if (productIdx === 1 && store.city.toLowerCase() === 'ahmedabad') {
        quantity = 0; // deliberately out of stock in Ahmedabad
      }
      if (productIdx === 2 && store.city.toLowerCase() === 'kolkata') {
        quantity = 0; // deliberately out of stock in Kolkata
      }

      await prisma.inventory.upsert({
        where: {
          productId_storeId: {
            productId: product.id,
            storeId: store.id,
          },
        },
        create: {
          productId: product.id,
          storeId: store.id,
          quantity,
        },
        update: {
          quantity,
        },
      });
      totalStock += quantity;
    }

    // Sync global stock to match aggregate store inventories
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: totalStock },
    });

    await prisma.review.upsert({
      where: {
        productId_userId: { productId: product.id, userId: customer.id },
      },
      create: {
        productId: product.id,
        userId: customer.id,
        rating: 5,
        title: 'Excellent build quality & fast delivery',
        comment:
          'Checked out seamlessly via UPI QR and collected from our local store in pristine condition.',
      },
      update: {},
    });

    productIdx += 1;
  }

  console.log('Seeding promo codes...');
  const promos = [
    {
      code: 'WELCOME10',
      description: '10% off on orders above ₹999',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      minOrderPaise: 99900,
      maxDiscountPaise: 150000,
      isActive: true,
    },
    {
      code: 'FLAT500',
      description: 'Flat ₹500 off on orders above ₹2,999',
      discountType: DiscountType.FIXED,
      discountValue: 50000,
      minOrderPaise: 299900,
      maxDiscountPaise: null,
      isActive: true,
    },
    {
      code: 'UPIFIRST',
      description: '15% instant discount on UPI orders (up to ₹1,000)',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      minOrderPaise: 149900,
      maxDiscountPaise: 100000,
      isActive: true,
    },
  ];

  for (const promo of promos) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      create: promo,
      update: promo,
    });
  }

  // Sync to OpenSearch
  console.log('Indexing products into OpenSearch...');
  const fullProducts = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      category: true,
      inventories: {
        include: { store: true },
      },
    },
  });

  const indexName = process.env.OPENSEARCH_PRODUCTS_INDEX || 'products_v1';
  try {
    const configReader = {
      get: <T = string>(key: string, defaultValue?: T) => (process.env[key] as unknown as T) ?? defaultValue,
    };
    const clientOptions = buildOpenSearchClientOptions(configReader);
    const osClient = new Client(clientOptions);

    const existsRes = await osClient.indices.exists({ index: indexName });
    if (!existsRes.body) {
      await osClient.indices.create({
        index: indexName,
        body: getProductIndexDefinition() as never,
      });
    }

    const bulkBody = fullProducts.flatMap((p) => {
      const activeInventories = p.inventories.filter((inv) => inv.quantity > 0);
      const availableCities = Array.from(
        new Set(activeInventories.map((inv) => inv.store.city.toLowerCase())),
      );
      const storesWithStock = activeInventories.map((inv) => inv.store.code);

      return [
        { index: { _index: indexName, _id: p.id } },
        {
          id: p.id,
          title: p.title,
          slug: p.slug,
          description: p.description,
          brand: p.brand,
          pricePaise: p.pricePaise,
          compareAtPaise: p.compareAtPaise,
          sku: p.sku,
          stock: p.stock,
          isActive: p.isActive,
          images: p.images,
          attributes: p.attributes,
          tags: p.tags,
          ratingAvg: p.ratingAvg,
          reviewCount: p.reviewCount,
          categoryId: p.categoryId,
          categoryName: p.category.name,
          categorySlug: p.category.slug,
          availableCities,
          storesWithStock,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        },
      ];
    });

    if (bulkBody.length > 0) {
      await osClient.bulk({ body: bulkBody, refresh: true });
    }
    console.log(`Seeded and indexed ${fullProducts.length} products directly into OpenSearch.`);
  } catch (osErr) {
    console.log(`OpenSearch indexing skipped at seed (${osErr instanceof Error ? osErr.message : String(osErr)}); outbox will relay.`);
    for (const p of createdProducts) {
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'Product',
          aggregateId: p.id,
          topic: 'catalog.events',
          eventType: 'product.updated',
          status: OutboxStatus.PENDING,
          payload: {
            eventId: `seed-${p.id}`,
            type: 'product.updated',
            productId: p.id,
            occurredAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  console.log(`\nSeed completed successfully!`);
  console.log(`Admin Account:    ${admin.email} / Admin@12345`);
  console.log(`Customer Account: ${customer.email} / Customer@12345`);
}

main()
  .catch((err) => {
    console.error('Seed script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

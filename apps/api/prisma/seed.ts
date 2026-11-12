import { DiscountType, OutboxStatus, PrismaClient, UserRole } from '@prisma/client';
import { Client } from '@opensearch-project/opensearch';
import * as bcrypt from 'bcryptjs';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from '../src/catalog/demo-catalog.data';

const prisma = new PrismaClient();

async function main() {
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

  const createdProducts: Array<{ id: string; slug: string }> = [];
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
        stock: rest.stock,
        images: rest.images,
        attributes: rest.attributes,
        tags: rest.tags,
        categoryId: category.id,
      },
    });
    createdProducts.push({ id: product.id, slug: product.slug });

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
          'Checked out seamlessly via UPI QR and received the package in pristine condition. Solid daily driver.',
      },
      update: {},
    });
  }

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

  const fullProducts = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: true },
  });

  const openSearchNode = process.env.OPENSEARCH_NODE || 'http://localhost:9200';
  const indexName = process.env.OPENSEARCH_PRODUCTS_INDEX || 'products_v1';
  try {
    const osClient = new Client({ node: openSearchNode });
    const existsRes = await osClient.indices.exists({ index: indexName });
    if (!existsRes.body) {
      await osClient.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              filter: {
                autocomplete_filter: { type: 'edge_ngram', min_gram: 2, max_gram: 15 },
              },
              analyzer: {
                autocomplete_index: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'autocomplete_filter'],
                },
                autocomplete_search: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase'],
                },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                  autocomplete: {
                    type: 'text',
                    analyzer: 'autocomplete_index',
                    search_analyzer: 'autocomplete_search',
                  },
                },
              },
              slug: { type: 'keyword' },
              description: { type: 'text' },
              brand: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 128 } } },
              pricePaise: { type: 'integer' },
              compareAtPaise: { type: 'integer' },
              sku: { type: 'keyword' },
              stock: { type: 'integer' },
              isActive: { type: 'boolean' },
              images: { type: 'keyword', index: false },
              tags: { type: 'keyword' },
              ratingAvg: { type: 'float' },
              reviewCount: { type: 'integer' },
              categoryId: { type: 'keyword' },
              categoryName: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 128 } } },
              categorySlug: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
    }
    const bulkBody = fullProducts.flatMap((p) => [
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
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      },
    ]);
    if (bulkBody.length > 0) {
      await osClient.bulk({ body: bulkBody, refresh: true });
    }
    console.log(`Seeded and indexed ${fullProducts.length} products directly into OpenSearch.`);
  } catch {
    console.log('OpenSearch not reachable during seed; enqueuing Outbox catalog.events instead.');
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

  console.log(`Seed complete! Admin: ${admin.email} | Customer: ${customer.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

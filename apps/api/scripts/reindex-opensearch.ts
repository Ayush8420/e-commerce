import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from '@opensearch-project/opensearch';
import { PrismaClient } from '@prisma/client';
import { ProductDocument } from '@ecommerce/shared';
import {
  buildOpenSearchClientOptions,
  getProductIndexDefinition,
} from '../src/search/opensearch.service';

const dotenvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: dotenvPath });

const configReader = {
  get: <T = string>(key: string, defaultValue?: T): T | undefined => {
    const val = process.env[key];
    if (val === undefined || val === '') {
      return defaultValue;
    }
    return val as unknown as T;
  },
};

async function main() {
  const indexName = configReader.get<string>('OPENSEARCH_PRODUCTS_INDEX', 'products_v1') || 'products_v1';
  const shouldRecreate = process.argv.includes('--recreate') || process.argv.includes('-r');

  const clientOptions = buildOpenSearchClientOptions(configReader);
  console.log(`Connecting to OpenSearch at: ${clientOptions.node}`);
  console.log(`Target index: ${indexName}`);

  const client = new Client(clientOptions);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    const health = await client.cluster.health();
    console.log(`OpenSearch cluster status: ${health.body.status}`);

    const existsRes = await client.indices.exists({ index: indexName });
    if (existsRes.body && shouldRecreate) {
      console.log(`Deleting existing index "${indexName}" (--recreate flag)...`);
      await client.indices.delete({ index: indexName });
      console.log(`Index "${indexName}" deleted.`);
    }

    const existsAfterDelete = await client.indices.exists({ index: indexName });
    if (!existsAfterDelete.body) {
      console.log(`Creating index "${indexName}" with latest mapping and edge-ngram autocomplete analyzer...`);
      await client.indices.create({
        index: indexName,
        body: getProductIndexDefinition() as never,
      });
      console.log(`Index "${indexName}" created successfully.`);
    } else {
      console.log(`Index "${indexName}" already exists. Reindexing documents into it...`);
    }

    console.log('Fetching active products from PostgreSQL...');
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        inventories: { include: { store: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`Found ${products.length} active products in PostgreSQL.`);

    if (products.length === 0) {
      console.log('No products to index. Consider running `npm run db:seed` first.');
      return;
    }

    const docs: ProductDocument[] = products.map((product) => {
      const activeInvs = (product.inventories ?? []).filter((i) => i.quantity > 0);
      const availableCities = Array.from(new Set(activeInvs.map((i) => i.store.city.toLowerCase())));
      const storesWithStock = activeInvs.map((i) => i.store.code);

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        pricePaise: product.pricePaise,
        compareAtPaise: product.compareAtPaise,
        sku: product.sku,
        stock: product.stock,
        isActive: product.isActive,
        images: product.images,
        attributes: (product.attributes as Record<string, string | number | boolean>) ?? {},
        tags: product.tags,
        ratingAvg: product.ratingAvg,
        reviewCount: product.reviewCount,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        categorySlug: product.category.slug,
        availableCities,
        storesWithStock,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      };
    });

    const batchSize = 100;
    let indexedCount = 0;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const body = batch.flatMap((doc) => [
        { index: { _index: indexName, _id: doc.id } },
        doc,
      ]);
      const bulkRes = await client.bulk({ body, refresh: true });
      if (bulkRes.body.errors) {
        console.warn('Some items failed during bulk indexing:', JSON.stringify(bulkRes.body.items));
      }
      indexedCount += batch.length;
      console.log(`Indexed ${indexedCount}/${docs.length} products...`);
    }

    await client.indices.refresh({ index: indexName });
    const countRes = await client.count({ index: indexName });
    console.log(`\nReindexing complete! Total documents in "${indexName}": ${countRes.body.count}`);
  } catch (error) {
    console.error('\n[Error] Reindexing failed:');
    console.error(`- OpenSearch Node: ${clientOptions.node}`);
    console.error(`- Reason: ${error instanceof Error ? error.message : String(error)}`);
    console.error('\nPlease verify your Aiven OpenSearch credentials and DATABASE_URL in .env, or if testing locally, ensure Docker OpenSearch is running (npm run infra:up).\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();

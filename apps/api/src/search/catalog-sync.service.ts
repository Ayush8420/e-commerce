import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProductDocument } from '@ecommerce/shared';
import { Category, Inventory, Product, Store } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenSearchService } from './opensearch.service';

@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenSearchService) private readonly openSearch: OpenSearchService,
  ) {}

  toProductDocument(
    product: Product & {
      category: Category;
      inventories?: Array<Inventory & { store: Store }>;
    },
  ): ProductDocument {
    const activeInventories = (product.inventories ?? []).filter((inv) => inv.quantity > 0);
    const availableCities = Array.from(
      new Set(activeInventories.map((inv) => inv.store.city.toLowerCase())),
    );
    const storesWithStock = activeInventories.map((inv) => inv.store.code);

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
  }

  async syncProductById(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        inventories: {
          include: { store: true },
        },
      },
    });

    if (!product || !product.isActive) {
      await this.openSearch.deleteProduct(productId);
      this.logger.log(`Removed product ${productId} from OpenSearch`);
      return;
    }

    await this.openSearch.upsertProduct(this.toProductDocument(product));
    this.logger.log(`Indexed product ${product.id} (${product.slug}) in OpenSearch`);
  }

  async reindexAllProducts(): Promise<{ indexed: number }> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        inventories: {
          include: { store: true },
        },
      },
    });
    const docs = products.map((p) => this.toProductDocument(p));
    const indexed = await this.openSearch.bulkIndexProducts(docs);
    this.logger.log(`Bulk indexed ${indexed} products into OpenSearch`);
    return { indexed };
  }
}


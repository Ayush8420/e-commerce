import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductDocument, SearchFacetBucket, SearchResponse } from '@ecommerce/shared';
import { Client } from '@opensearch-project/opensearch';
import { Prisma } from '@prisma/client';
import { buildDemoProductDocuments } from '../catalog/demo-catalog.data';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchQueryInput {
  q?: string;
  category?: string;
  brand?: string;
  minPricePaise?: number;
  maxPricePaise?: number;
  minRating?: number;
  inStock?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
  page?: number;
  limit?: number;
}

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private readonly client: Client;
  private readonly indexName: string;
  private indexEnsured = false;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const node = this.config.get<string>('OPENSEARCH_NODE', 'http://localhost:9200');
    const username = this.config.get<string>('OPENSEARCH_USERNAME', '');
    const password = this.config.get<string>('OPENSEARCH_PASSWORD', '');
    this.indexName = this.config.get<string>('OPENSEARCH_PRODUCTS_INDEX', 'products_v1');

    this.client = new Client({
      node,
      ...(username && password ? { auth: { username, password } } : {}),
    });
  }

  onModuleInit(): void {
    if (process.env.SKIP_INFRA_BOOT === 'true') {
      return;
    }
    void this.ensureIndex().catch((error: unknown) => {
      this.logger.warn(
        `OpenSearch not reachable at boot (${error instanceof Error ? error.message : String(error)}). Search will use fallback until OpenSearch is up.`,
      );
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.client.info();
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }

  async ensureIndex(): Promise<void> {
    if (this.indexEnsured) {
      return;
    }
    const existsRes = await this.client.indices.exists({ index: this.indexName });
    if (!existsRes.body) {
      await this.client.indices.create({
        index: this.indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              filter: {
                autocomplete_filter: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 15,
                },
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
              brand: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 128 },
                },
              },
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
              categoryName: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 128 },
                },
              },
              categorySlug: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      this.logger.log(`Created OpenSearch index "${this.indexName}"`);
    }
    this.indexEnsured = true;
  }

  async upsertProduct(doc: ProductDocument): Promise<void> {
    await this.ensureIndex();
    await this.client.index({
      index: this.indexName,
      id: doc.id,
      body: doc,
      refresh: true,
    });
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.ensureIndex();
    await this.client
      .delete({
        index: this.indexName,
        id: productId,
        refresh: true,
      })
      .catch((error: { meta?: { statusCode?: number } }) => {
        if (error?.meta?.statusCode !== 404) {
          throw error;
        }
      });
  }

  async bulkIndexProducts(docs: ProductDocument[]): Promise<number> {
    await this.ensureIndex();
    if (docs.length === 0) {
      return 0;
    }
    const body = docs.flatMap((doc) => [
      { index: { _index: this.indexName, _id: doc.id } },
      doc,
    ]);
    await this.client.bulk({ body, refresh: true });
    return docs.length;
  }

  async searchProducts(params: SearchQueryInput): Promise<SearchResponse> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(48, Math.max(1, params.limit ?? 12));
    const from = (page - 1) * limit;

    try {
      await this.ensureIndex();

      const filter: Array<Record<string, unknown>> = [{ term: { isActive: true } }];
      if (params.category) {
        const categories = params.category
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (categories.length === 1) {
          filter.push({ term: { categorySlug: categories[0] } });
        } else if (categories.length > 1) {
          filter.push({ terms: { categorySlug: categories } });
        }
      }
      if (params.brand) {
        const brands = params.brand
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean);
        if (brands.length === 1) {
          filter.push({ term: { 'brand.keyword': brands[0] } });
        } else if (brands.length > 1) {
          filter.push({ terms: { 'brand.keyword': brands } });
        }
      }
      if (params.minPricePaise !== undefined || params.maxPricePaise !== undefined) {
        const range: Record<string, number> = {};
        if (params.minPricePaise !== undefined) range.gte = params.minPricePaise;
        if (params.maxPricePaise !== undefined) range.lte = params.maxPricePaise;
        filter.push({ range: { pricePaise: range } });
      }
      if (params.minRating !== undefined && params.minRating > 0) {
        filter.push({ range: { ratingAvg: { gte: params.minRating } } });
      }
      if (params.inStock) {
        filter.push({ range: { stock: { gt: 0 } } });
      }

      const must: Array<Record<string, unknown>> = [];
      const queryText = params.q?.trim();
      if (queryText) {
        must.push({
          bool: {
            should: [
              {
                multi_match: {
                  query: queryText,
                  fields: ['title^4', 'brand^3', 'categoryName^2', 'tags^2', 'description'],
                  fuzziness: 'AUTO',
                  prefix_length: 1,
                },
              },
              {
                match_phrase_prefix: {
                  title: {
                    query: queryText,
                    boost: 3,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        });
      }

      const sort = this.buildOpenSearchSort(params.sort, Boolean(queryText));

      const searchBody = {
        from,
        size: limit,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort,
        aggs: {
          categories: {
            terms: { field: 'categorySlug', size: 25 },
            aggs: {
              category_label: {
                terms: { field: 'categoryName.keyword', size: 1 },
              },
            },
          },
          brands: {
            terms: { field: 'brand.keyword', size: 30 },
          },
          price_stats: {
            stats: { field: 'pricePaise' },
          },
        },
      };

      const response = await this.client.search({
        index: this.indexName,
        body: searchBody as never,
      });

      const body = response.body as {
        hits: {
          total: { value: number } | number;
          hits: Array<{ _source: ProductDocument }>;
        };
        aggregations?: {
          categories?: {
            buckets: Array<{
              key: string;
              doc_count: number;
              category_label?: { buckets: Array<{ key: string }> };
            }>;
          };
          brands?: { buckets: Array<{ key: string; doc_count: number }> };
          price_stats?: { min: number | null; max: number | null };
        };
      };

      const total =
        typeof body.hits.total === 'number' ? body.hits.total : (body.hits.total?.value ?? 0);
      const items = body.hits.hits.map((hit) => hit._source);

      const categoryBuckets: SearchFacetBucket[] = (
        body.aggregations?.categories?.buckets ?? []
      ).map((bucket) => ({
        key: bucket.key,
        label: bucket.category_label?.buckets?.[0]?.key ?? bucket.key,
        count: bucket.doc_count,
      }));

      const brandBuckets: SearchFacetBucket[] = (body.aggregations?.brands?.buckets ?? []).map(
        (bucket) => ({
          key: bucket.key,
          label: bucket.key,
          count: bucket.doc_count,
        }),
      );

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        searchEngine: 'opensearch',
        facets: {
          categories: categoryBuckets,
          brands: brandBuckets,
          minPricePaise: Math.round(body.aggregations?.price_stats?.min ?? 0),
          maxPricePaise: Math.round(body.aggregations?.price_stats?.max ?? 0),
        },
      };
    } catch (error) {
      this.logger.warn(
        `OpenSearch query failed, using PostgreSQL fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.postgresFallbackSearch({ ...params, page, limit });
    }
  }

  async suggestProducts(prefix: string): Promise<Array<{ id: string; title: string; slug: string; brand: string; pricePaise: number; image?: string }>> {
    const trimmed = prefix.trim();
    if (trimmed.length < 2) {
      return [];
    }

    try {
      await this.ensureIndex();
      const response = await this.client.search({
        index: this.indexName,
        body: {
          size: 6,
          _source: ['id', 'title', 'slug', 'brand', 'pricePaise', 'images'],
          query: {
            bool: {
              filter: [{ term: { isActive: true } }],
              must: [
                {
                  multi_match: {
                    query: trimmed,
                    fields: ['title.autocomplete^3', 'brand^2', 'categoryName'],
                  },
                },
              ],
            },
          },
        },
      });
      const hits = (response.body as { hits: { hits: Array<{ _source: ProductDocument }> } }).hits
        .hits;
      return hits.map((h) => ({
        id: h._source.id,
        title: h._source.title,
        slug: h._source.slug,
        brand: h._source.brand,
        pricePaise: h._source.pricePaise,
        image: h._source.images?.[0],
      }));
    } catch {
      try {
        const rows = await this.prisma.product.findMany({
          where: {
            isActive: true,
            OR: [
              { title: { contains: trimmed, mode: 'insensitive' } },
              { brand: { contains: trimmed, mode: 'insensitive' } },
            ],
          },
          take: 6,
          select: { id: true, title: true, slug: true, brand: true, pricePaise: true, images: true },
        });
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          brand: row.brand,
          pricePaise: row.pricePaise,
          image: row.images[0],
        }));
      } catch {
        const lower = trimmed.toLowerCase();
        return buildDemoProductDocuments()
          .filter(
            (p) =>
              p.title.toLowerCase().includes(lower) ||
              p.brand.toLowerCase().includes(lower) ||
              p.categoryName.toLowerCase().includes(lower),
          )
          .slice(0, 6)
          .map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            brand: p.brand,
            pricePaise: p.pricePaise,
            image: p.images[0],
          }));
      }
    }
  }

  private buildOpenSearchSort(
    sort: SearchQueryInput['sort'],
    hasQuery: boolean,
  ): Array<Record<string, unknown>> {
    switch (sort) {
      case 'price_asc':
        return [{ pricePaise: { order: 'asc' } }];
      case 'price_desc':
        return [{ pricePaise: { order: 'desc' } }];
      case 'rating_desc':
        return [{ ratingAvg: { order: 'desc' } }, { reviewCount: { order: 'desc' } }];
      case 'newest':
        return [{ createdAt: { order: 'desc' } }];
      case 'relevance':
      default:
        return hasQuery
          ? [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }]
          : [{ createdAt: { order: 'desc' } }];
    }
  }

  private async postgresFallbackSearch(
    params: SearchQueryInput & { page: number; limit: number },
  ): Promise<SearchResponse> {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (params.category) {
      const slugs = params.category.split(',').map((s) => s.trim()).filter(Boolean);
      if (slugs.length > 0) {
        where.category = { slug: { in: slugs } };
      }
    }
    if (params.brand) {
      const brands = params.brand.split(',').map((b) => b.trim()).filter(Boolean);
      if (brands.length > 0) {
        where.brand = { in: brands };
      }
    }
    if (params.minPricePaise !== undefined || params.maxPricePaise !== undefined) {
      where.pricePaise = {
        ...(params.minPricePaise !== undefined ? { gte: params.minPricePaise } : {}),
        ...(params.maxPricePaise !== undefined ? { lte: params.maxPricePaise } : {}),
      };
    }
    if (params.minRating !== undefined && params.minRating > 0) {
      where.ratingAvg = { gte: params.minRating };
    }
    if (params.inStock) {
      where.stock = { gt: 0 };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      params.sort === 'price_asc'
        ? { pricePaise: 'asc' }
        : params.sort === 'price_desc'
          ? { pricePaise: 'desc' }
          : params.sort === 'rating_desc'
            ? { ratingAvg: 'desc' }
            : { createdAt: 'desc' };

    try {
      const [rows, total, allMatchingForFacets] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: { category: true },
          orderBy,
          skip: (params.page - 1) * params.limit,
          take: params.limit,
        }),
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where: { isActive: true },
          select: {
            brand: true,
            pricePaise: true,
            category: { select: { slug: true, name: true } },
          },
        }),
      ]);

      const categoryMap = new Map<string, { label: string; count: number }>();
      const brandMap = new Map<string, number>();
      let minPrice = Number.MAX_SAFE_INTEGER;
      let maxPrice = 0;

      for (const row of allMatchingForFacets) {
        const catEntry = categoryMap.get(row.category.slug) ?? { label: row.category.name, count: 0 };
        catEntry.count += 1;
        categoryMap.set(row.category.slug, catEntry);
        brandMap.set(row.brand, (brandMap.get(row.brand) ?? 0) + 1);
        if (row.pricePaise < minPrice) minPrice = row.pricePaise;
        if (row.pricePaise > maxPrice) maxPrice = row.pricePaise;
      }

      const items: ProductDocument[] = rows.map((p) => ({
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
        attributes: (p.attributes as Record<string, string | number | boolean>) ?? {},
        tags: p.tags,
        ratingAvg: p.ratingAvg,
        reviewCount: p.reviewCount,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
        searchEngine: 'postgres-fallback',
        facets: {
          categories: Array.from(categoryMap.entries()).map(([key, v]) => ({
            key,
            label: v.label,
            count: v.count,
          })),
          brands: Array.from(brandMap.entries()).map(([key, count]) => ({
            key,
            label: key,
            count,
          })),
          minPricePaise: minPrice === Number.MAX_SAFE_INTEGER ? 0 : minPrice,
          maxPricePaise: maxPrice,
        },
      };
    } catch (dbError) {
      this.logger.warn(
        `PostgreSQL unavailable, serving built-in demo catalog: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
      return this.demoFallbackSearch(params);
    }
  }

  private demoFallbackSearch(
    params: SearchQueryInput & { page: number; limit: number },
  ): SearchResponse {
    const allDocs = buildDemoProductDocuments();
    const categoryFilter = params.category
      ? params.category.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const brandFilter = params.brand
      ? params.brand.split(',').map((b) => b.trim()).filter(Boolean)
      : [];
    const queryLower = params.q?.trim().toLowerCase() ?? '';

    const filtered = allDocs.filter((p) => {
      if (queryLower) {
        const hay = `${p.title} ${p.brand} ${p.categoryName} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(queryLower)) return false;
      }
      if (categoryFilter.length > 0 && !categoryFilter.includes(p.categorySlug)) return false;
      if (brandFilter.length > 0 && !brandFilter.includes(p.brand)) return false;
      if (params.minPricePaise !== undefined && p.pricePaise < params.minPricePaise) return false;
      if (params.maxPricePaise !== undefined && p.pricePaise > params.maxPricePaise) return false;
      if (params.minRating !== undefined && p.ratingAvg < params.minRating) return false;
      if (params.inStock && p.stock <= 0) return false;
      return true;
    });

    filtered.sort((a, b) => {
      switch (params.sort) {
        case 'price_asc':
          return a.pricePaise - b.pricePaise;
        case 'price_desc':
          return b.pricePaise - a.pricePaise;
        case 'rating_desc':
          return b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount;
        default:
          return b.reviewCount - a.reviewCount;
      }
    });

    const categoryMap = new Map<string, { label: string; count: number }>();
    const brandMap = new Map<string, number>();
    let minPrice = Number.MAX_SAFE_INTEGER;
    let maxPrice = 0;

    for (const doc of allDocs) {
      const catEntry = categoryMap.get(doc.categorySlug) ?? { label: doc.categoryName, count: 0 };
      catEntry.count += 1;
      categoryMap.set(doc.categorySlug, catEntry);
      brandMap.set(doc.brand, (brandMap.get(doc.brand) ?? 0) + 1);
      if (doc.pricePaise < minPrice) minPrice = doc.pricePaise;
      if (doc.pricePaise > maxPrice) maxPrice = doc.pricePaise;
    }

    const total = filtered.length;
    const start = (params.page - 1) * params.limit;
    const items = filtered.slice(start, start + params.limit);

    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
      searchEngine: 'demo-fallback',
      facets: {
        categories: Array.from(categoryMap.entries()).map(([key, v]) => ({
          key,
          label: v.label,
          count: v.count,
        })),
        brands: Array.from(brandMap.entries()).map(([key, count]) => ({
          key,
          label: key,
          count,
        })),
        minPricePaise: minPrice === Number.MAX_SAFE_INTEGER ? 0 : minPrice,
        maxPricePaise: maxPrice,
      },
    };
  }
}

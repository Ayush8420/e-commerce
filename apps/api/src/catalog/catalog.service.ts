import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KAFKA_TOPICS } from '@ecommerce/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OutboxService } from '../kafka/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildDemoProductDocuments, DEMO_CATEGORIES } from './demo-catalog.data';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreatePromoDto,
  CreateReviewDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async listCategories() {
    try {
      const categories = await this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              products: { where: { isActive: true } },
            },
          },
        },
      });
      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: c.imageUrl,
        productCount: c._count.products,
      }));
    } catch {
      const docs = buildDemoProductDocuments();
      return DEMO_CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: c.imageUrl,
        productCount: docs.filter((p) => p.categorySlug === c.slug).length,
      }));
    }
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug: this.slugify(dto.slug),
        description: dto.description?.trim() ?? null,
        imageUrl: dto.imageUrl?.trim() ?? null,
      },
    });
  }

  async listFeaturedProducts(limit = 8) {
    try {
      return await this.prisma.product.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: [{ ratingAvg: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });
    } catch {
      return buildDemoProductDocuments().slice(0, limit);
    }
  }

  async listAllProductsAdmin() {
    return this.prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductBySlug(slug: string) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { slug },
        include: {
          category: true,
          inventories: {
            include: { store: true },
            orderBy: { store: { city: 'asc' } },
          },
          reviews: {
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, name: true, avatarUrl: true },
              },
            },
          },
        },
      });
      if (!product || !product.isActive) {
        throw new NotFoundException('Product not found');
      }
      return product;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const demo = buildDemoProductDocuments().find((p) => p.slug === slug);
      if (!demo) {
        throw new NotFoundException('Product not found');
      }
      return {
        ...demo,
        category: {
          id: demo.categoryId,
          name: demo.categoryName,
          slug: demo.categorySlug,
        },
        reviews: [
          {
            id: `demo-rev-${demo.id}`,
            rating: 5,
            title: 'Excellent build quality & fast delivery',
            comment:
              'Checked out seamlessly via UPI QR and received the package in pristine condition.',
            createdAt: demo.createdAt,
            user: { id: 'demo-user-1', name: 'Priya Nair', avatarUrl: null },
          },
        ],
      };
    }
  }

  async createProduct(dto: CreateProductDto) {
    const baseSlug = this.slugify(dto.slug || dto.title);
    const uniqueSlug = `${baseSlug}-${randomUUID().slice(0, 5)}`;

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title: dto.title.trim(),
          slug: uniqueSlug,
          description: dto.description.trim(),
          brand: dto.brand.trim(),
          pricePaise: dto.pricePaise,
          compareAtPaise: dto.compareAtPaise ?? null,
          sku: dto.sku.trim().toUpperCase(),
          stock: dto.stock,
          isActive: dto.isActive ?? true,
          images: dto.images ?? [],
          attributes: (dto.attributes ?? {}) as Prisma.InputJsonValue,
          tags: dto.tags ?? [],
          categoryId: dto.categoryId,
        },
        include: { category: true },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Product',
        aggregateId: created.id,
        topic: KAFKA_TOPICS.CATALOG_EVENTS,
        eventType: 'product.created',
        payload: {
          eventId: randomUUID(),
          type: 'product.created',
          productId: created.id,
          occurredAt: new Date().toISOString(),
        },
      });

      return created;
    });

    this.outbox.triggerFlush();
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.product.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand.trim() } : {}),
          ...(dto.pricePaise !== undefined ? { pricePaise: dto.pricePaise } : {}),
          ...(dto.compareAtPaise !== undefined ? { compareAtPaise: dto.compareAtPaise } : {}),
          ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.images !== undefined ? { images: dto.images } : {}),
          ...(dto.attributes !== undefined
            ? { attributes: dto.attributes as Prisma.InputJsonValue }
            : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        },
        include: { category: true },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Product',
        aggregateId: row.id,
        topic: KAFKA_TOPICS.CATALOG_EVENTS,
        eventType: 'product.updated',
        payload: {
          eventId: randomUUID(),
          type: 'product.updated',
          productId: row.id,
          occurredAt: new Date().toISOString(),
        },
      });

      return row;
    });

    this.outbox.triggerFlush();
    return updated;
  }

  async deleteProduct(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Product',
        aggregateId: id,
        topic: KAFKA_TOPICS.CATALOG_EVENTS,
        eventType: 'product.deleted',
        payload: {
          eventId: randomUUID(),
          type: 'product.deleted',
          productId: id,
          occurredAt: new Date().toISOString(),
        },
      });
    });

    this.outbox.triggerFlush();
    return { deleted: true, id };
  }

  async upsertReview(productId: string, userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.upsert({
        where: {
          productId_userId: { productId, userId },
        },
        create: {
          productId,
          userId,
          rating: dto.rating,
          title: dto.title.trim(),
          comment: dto.comment.trim(),
        },
        update: {
          rating: dto.rating,
          title: dto.title.trim(),
          comment: dto.comment.trim(),
        },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

      const stats = await tx.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      const ratingAvg = Number((stats._avg.rating ?? 0).toFixed(2));
      const reviewCount = stats._count.rating;

      await tx.product.update({
        where: { id: productId },
        data: { ratingAvg, reviewCount },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Product',
        aggregateId: productId,
        topic: KAFKA_TOPICS.CATALOG_EVENTS,
        eventType: 'product.rating_updated',
        payload: {
          eventId: randomUUID(),
          type: 'product.rating_updated',
          productId,
          occurredAt: new Date().toISOString(),
        },
      });

      return { review, ratingAvg, reviewCount };
    });

    this.outbox.triggerFlush();
    return result;
  }

  async validatePromoCode(codeInput: string, subtotalPaise: number) {
    const code = codeInput.trim().toUpperCase();
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.isActive) {
      throw new BadRequestException('Promo code is invalid or inactive');
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new BadRequestException('Promo code has expired');
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Promo code usage limit has been reached');
    }
    if (subtotalPaise < promo.minOrderPaise) {
      throw new BadRequestException(
        `Minimum order of ₹${(promo.minOrderPaise / 100).toFixed(0)} required for this promo code`,
      );
    }

    let discountPaise =
      promo.discountType === 'PERCENTAGE'
        ? Math.floor((subtotalPaise * promo.discountValue) / 100)
        : promo.discountValue;

    if (promo.maxDiscountPaise !== null && discountPaise > promo.maxDiscountPaise) {
      discountPaise = promo.maxDiscountPaise;
    }
    if (discountPaise > subtotalPaise) {
      discountPaise = subtotalPaise;
    }

    return {
      valid: true,
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountPaise,
    };
  }

  async listPromosAdmin() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPromoAdmin(dto: CreatePromoDto) {
    return this.prisma.promoCode.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderPaise: dto.minOrderPaise ?? 0,
        maxDiscountPaise: dto.maxDiscountPaise ?? null,
        maxUses: dto.maxUses ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async togglePromoAdmin(id: string, isActive: boolean) {
    return this.prisma.promoCode.update({
      where: { id },
      data: { isActive },
    });
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}


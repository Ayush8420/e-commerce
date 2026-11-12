import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: { category: true },
            },
          },
        },
      },
    });

    if (!cart) {
      return {
        items: [],
        itemCount: 0,
        subtotalPaise: 0,
      };
    }

    const activeItems = cart.items.filter((item) => item.product.isActive);
    const subtotalPaise = activeItems.reduce(
      (sum, item) => sum + item.product.pricePaise * item.quantity,
      0,
    );
    const itemCount = activeItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      items: activeItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        product: {
          id: item.product.id,
          title: item.product.title,
          slug: item.product.slug,
          brand: item.product.brand,
          pricePaise: item.product.pricePaise,
          compareAtPaise: item.product.compareAtPaise,
          stock: item.product.stock,
          images: item.product.images,
          categoryName: item.product.category.name,
        },
      })),
      itemCount,
      subtotalPaise,
    };
  }

  async addItem(userId: string, productId: string, quantity = 1) {
    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }
    if (product.stock < 1) {
      throw new BadRequestException('Product is currently out of stock');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    const desiredQty = Math.min(product.stock, (existing?.quantity ?? 0) + quantity);
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity: desiredQty },
      update: { quantity: desiredQty },
    });

    void this.analytics.track({
      type: 'cart.item_added',
      userId,
      productId,
      metadata: { quantity },
    });

    return this.getCart(userId);
  }

  async setItemQuantity(userId: string, productId: string, quantity: number) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      return this.getCart(userId);
    }

    if (quantity <= 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
      return this.getCart(userId);
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    const boundedQty = Math.min(product.stock, quantity);
    if (boundedQty <= 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
    } else {
      await this.prisma.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: { cartId: cart.id, productId, quantity: boundedQty },
        update: { quantity: boundedQty },
      });
    }

    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
    }
    return this.getCart(userId);
  }

  async mergeGuestItems(
    userId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    for (const item of items) {
      if (item.productId && item.quantity > 0) {
        await this.addItem(userId, item.productId, item.quantity).catch(() => undefined);
      }
    }
    return this.getCart(userId);
  }
}


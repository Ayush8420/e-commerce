export const KAFKA_TOPICS = {
  CATALOG_EVENTS: 'catalog.events',
  ORDER_EVENTS: 'order.events',
  NOTIFICATION_EVENTS: 'notification.events',
  ANALYTICS_EVENTS: 'analytics.events',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export type UserRole = 'CUSTOMER' | 'ADMIN';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_VERIFIED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export type PaymentMethod = 'UPI_QR' | 'UPI_VPA' | 'CARD_TEST';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type FulfillmentType = 'HOME_DELIVERY' | 'STORE_PICKUP';

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  fulfillmentType?: FulfillmentType;
  pickupStoreId?: string;
  pickupStoreName?: string;
}

export interface ProductDocument {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  pricePaise: number;
  compareAtPaise: number | null;
  sku: string;
  stock: number;
  isActive: boolean;
  images: string[];
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  ratingAvg: number;
  reviewCount: number;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  availableCities: string[];
  storesWithStock: string[];
  storeStock?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface SearchFacetBucket {
  key: string;
  label?: string;
  count: number;
}

export interface SearchResponse {
  items: ProductDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchEngine: 'opensearch' | 'postgres-fallback' | 'demo-fallback';
  tookMs?: number;
  facets: {
    categories: SearchFacetBucket[];
    brands: SearchFacetBucket[];
    cities: SearchFacetBucket[];
    minPricePaise: number;
    maxPricePaise: number;
  };
}

export interface StoreDto {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

export interface StoreInventoryDto {
  storeId: string;
  storeName: string;
  city: string;
  quantity: number;
}

export interface CatalogEventPayload {
  eventId: string;
  type:
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.stock_changed'
  | 'product.price_changed'
  | 'product.rating_updated'
  | 'inventory.changed'
  | 'inventory.low_stock';
  productId: string;
  storeId?: string;
  city?: string;
  quantity?: number;
  pricePaise?: number;
  availableCities?: string[];
  occurredAt: string;
}

export interface OrderEventPayload {
  eventId: string;
  type:
  | 'order.created'
  | 'order.payment_succeeded'
  | 'order.payment_failed'
  | 'order.status_updated'
  | 'order.cancelled'
  | 'order.pickup_ready';
  orderId: string;
  orderNumber?: string;
  userId?: string;
  status?: string;
  previousStatus?: OrderStatus;
  totalPaise?: number;
  storeId?: string;
  city?: string;
  fulfillmentType?: FulfillmentType;
  occurredAt?: string;
}

export interface ConsumerGroupLag {
  groupId: string;
  topic: string;
  partition: number;
  currentOffset: string;
  logEndOffset: string;
  lag: number;
}

export interface KafkaMetricsResponse {
  status: 'connected' | 'disconnected';
  groups: ConsumerGroupLag[];
  totalLag: number;
  timestamp: string;
}

export interface NotificationEmailEventPayload {
  eventId: string;
  type:
  | 'email.welcome'
  | 'email.verify'
  | 'email.password_reset'
  | 'email.order_confirmed'
  | 'email.payment_failed'
  | 'email.order_status_updated';
  to: string;
  userId?: string;
  subject: string;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface AnalyticsEventPayload {
  eventId: string;
  type:
  | 'search.performed'
  | 'product.viewed'
  | 'cart.item_added'
  | 'checkout.started'
  | 'order.completed';
  userId?: string;
  sessionId?: string;
  query?: string;
  productId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export function formatInrFromPaise(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function buildUpiDeepLink(params: {
  merchantVpa: string;
  merchantName: string;
  transactionRef: string;
  amountPaise: number;
  note: string;
}): string {
  const amountRupees = (params.amountPaise / 100).toFixed(2);
  const query = new URLSearchParams({
    pa: params.merchantVpa,
    pn: params.merchantName,
    tr: params.transactionRef,
    tn: params.note,
    am: amountRupees,
    cu: 'INR',
  });
  return `upi://pay?${query.toString()}`;
}

export const UPI_VPA_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;


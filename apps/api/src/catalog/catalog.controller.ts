import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../common/auth.guards';
import { CatalogSyncService } from '../search/catalog-sync.service';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreatePromoDto,
  CreateReviewDto,
  UpdateProductDto,
  ValidatePromoDto,
} from './dto/catalog.dto';

@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CatalogSyncService) private readonly catalogSync: CatalogSyncService,
  ) {}

  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  listFeatured(@Query('limit') limit?: string) {
    return this.catalog.listFeaturedProducts(limit ? Number(limit) : 8);
  }

  @Get('products/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Post('products/:id/reviews')
  @UseGuards(JwtAuthGuard)
  addReview(
    @Param('id') productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.catalog.upsertReview(productId, user.id, dto);
  }

  @Post('promos/validate')
  validatePromo(@Body() dto: ValidatePromoDto) {
    return this.catalog.validatePromoCode(dto.code, dto.subtotalPaise);
  }

  // --- Admin Catalog Endpoints ---

  @Get('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listProductsAdmin() {
    return this.catalog.listAllProductsAdmin();
  }

  @Post('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Post('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Delete('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteProduct(@Param('id') id: string) {
    return this.catalog.deleteProduct(id);
  }

  @Post('admin/search/reindex')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reindexOpenSearch() {
    return this.catalogSync.reindexAllProducts();
  }

  @Get('admin/promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listPromosAdmin() {
    return this.catalog.listPromosAdmin();
  }

  @Post('admin/promos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createPromoAdmin(@Body() dto: CreatePromoDto) {
    return this.catalog.createPromoAdmin(dto);
  }

  @Patch('admin/promos/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  togglePromoAdmin(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.catalog.togglePromoAdmin(id, Boolean(isActive));
  }
}


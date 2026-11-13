import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, Roles } from '../common/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../common/auth.guards';
import { CheckoutDto, RetryUpiDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get('stores')
  listStores() {
    return this.ordersService.listStores();
  }

  @Get('stores/inventory/:productId')
  getProductStoreInventory(@Param('productId') productId: string) {
    return this.ordersService.getProductStoreInventory(productId);
  }

  @Post('orders/checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(user.id, dto);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  listMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listMyOrders(user.id);
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  getOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getOrderById(user.id, id, user.role === 'ADMIN');
  }

  @Post('orders/:id/retry-upi')
  @UseGuards(JwtAuthGuard)
  retryUpi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RetryUpiDto,
  ) {
    return this.ordersService.retryUpiPayment(user.id, id, dto);
  }

  @Post('orders/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.cancelOrder(user.id, id, user.role === 'ADMIN');
  }

  @Get('admin/orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listAllOrdersAdmin() {
    return this.ordersService.listAllOrdersAdmin();
  }

  @Patch('admin/orders/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateStatusAdmin(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatusAdmin(id, dto.status);
  }
}


import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../common/auth.decorators';
import { JwtAuthGuard } from '../common/auth.guards';
import { CartService } from './cart.service';

class AddCartItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

class UpdateCartQtyDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}

class MergeCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  items!: AddCartItemDto[];
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(@Inject(CartService) private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  setQuantity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartQtyDto,
  ) {
    return this.cartService.setItemQuantity(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(user.id, productId);
  }

  @Post('merge')
  mergeGuestCart(@CurrentUser() user: AuthenticatedUser, @Body() dto: MergeCartDto) {
    return this.cartService.mergeGuestItems(user.id, dto.items);
  }
}


import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class ShippingAddressDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsString()
  @MinLength(4)
  line1!: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @MinLength(2)
  state!: string;

  @IsString()
  @MinLength(4)
  postalCode!: string;

  @IsString()
  @MinLength(2)
  country!: string;
}

export class CheckoutDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsIn(['UPI_QR', 'UPI_VPA', 'CARD_TEST'])
  paymentMethod!: 'UPI_QR' | 'UPI_VPA' | 'CARD_TEST';

  @IsOptional()
  @IsString()
  upiVpa?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;
}

export class RetryUpiDto {
  @IsIn(['UPI_QR', 'UPI_VPA'])
  paymentMethod!: 'UPI_QR' | 'UPI_VPA';

  @IsOptional()
  @IsString()
  upiVpa?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
  status!: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
}


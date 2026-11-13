import { Global, Module } from '@nestjs/common';
import { SystemActivityService } from './system-activity.service';
import { SystemController } from './system.controller';

@Global()
@Module({
  controllers: [SystemController],
  providers: [SystemActivityService],
  exports: [SystemActivityService],
})
export class SystemModule {}


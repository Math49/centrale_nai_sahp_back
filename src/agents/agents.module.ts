import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule],
  controllers: [AgentsController, RolesController],
  providers: [AgentsService, RolesService],
  exports: [AgentsService, RolesService],
})
export class AgentsModule {}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions, SansPermission } from '../auth/decorateurs';
import { PERMISSIONS } from './permissions';
import {
  ModificationRoleDto,
  PermissionCatalogueeDto,
  RoleDto,
} from './roles.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth('jeton')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @SansPermission()
  @ApiOperation({
    summary: 'Grades et leurs permissions',
    description:
      "Lisible par tout agent connecté : savoir ce qu'un grade autorise ne révèle rien sur les données.",
  })
  @ApiResponse({ status: 200, type: [RoleDto] })
  lister(): Promise<RoleDto[]> {
    return this.roles.lister();
  }

  @Get('catalogue-permissions')
  @Permissions(PERMISSIONS.ROLE_GERER)
  @ApiOperation({ summary: 'Catalogue des permissions attribuables' })
  @ApiResponse({ status: 200, type: [PermissionCatalogueeDto] })
  catalogue(): PermissionCatalogueeDto[] {
    return this.roles.catalogue();
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ROLE_GERER)
  @ApiOperation({ summary: "Configuration d'un grade" })
  @ApiResponse({ status: 200, type: RoleDto })
  modifier(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationRoleDto,
  ): Promise<RoleDto> {
    return this.roles.modifier(auteur.id, id, corps);
  }
}

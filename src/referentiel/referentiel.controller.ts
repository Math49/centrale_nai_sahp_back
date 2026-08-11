import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Agent, type AgentCourant } from '../auth/agent-courant';
import { SansPermission, SuperAdminSeul } from '../auth/decorateurs';
import {
  ApercuGabaritDto,
  CompositionOngletDto,
  CreationChampDto,
  CreationOngletDto,
  CreationTypeEntiteDto,
  CreationTypeLienDto,
  DefinitionChampDto,
  ModificationChampDto,
  ModificationOngletDto,
  ModificationTypeEntiteDto,
  ModificationTypeLienDto,
  OngletDto,
  OrdreDto,
  ReferentielDto,
  ResultatApercuDto,
  TypeEntiteDto,
  TypeLienDto,
} from './referentiel.dto';
import { ReferentielService } from './referentiel.service';

@ApiTags('referentiel')
@ApiBearerAuth('jeton')
@Controller('referentiel')
export class ReferentielController {
  constructor(private readonly referentiel: ReferentielService) {}

  @Get()
  @SansPermission()
  @ApiOperation({ summary: 'Catalogue complet en une requête' })
  @ApiResponse({ status: 200, type: ReferentielDto })
  catalogue(): Promise<ReferentielDto> {
    return this.referentiel.catalogue();
  }

  @Post('types-entites')
  @SuperAdminSeul()
  @ApiOperation({ summary: "Création d'un type d'entité" })
  @ApiResponse({ status: 201, type: TypeEntiteDto })
  creerTypeEntite(
    @Agent() auteur: AgentCourant,
    @Body() corps: CreationTypeEntiteDto,
  ): Promise<TypeEntiteDto> {
    return this.referentiel.creerTypeEntite(auteur.id, corps);
  }

  @Patch('types-entites/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: TypeEntiteDto })
  modifierTypeEntite(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationTypeEntiteDto,
  ): Promise<TypeEntiteDto> {
    return this.referentiel.modifierTypeEntite(auteur.id, id, corps);
  }

  @Delete('types-entites/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Suppression d'un type d'entité",
    description:
      "Refusée dès qu'une entité de ce type existe : le référentiel ne se vide pas sous les données qui en dépendent.",
  })
  @ApiResponse({ status: 409, description: 'Type encore utilisé' })
  supprimerTypeEntite(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.referentiel.supprimerTypeEntite(auteur.id, id);
  }

  @Post('types-entites/ordre')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Ordre d'affichage des types d'entités" })
  ordonnerTypesEntites(
    @Agent() auteur: AgentCourant,
    @Body() corps: OrdreDto,
  ): Promise<void> {
    return this.referentiel.ordonnerTypesEntites(auteur.id, corps.ids);
  }

  @Post('types-entites/apercu-gabarit')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Aperçu d'un gabarit de libellé",
    description: "Vérifie sa forme et montre ce qu'il produirait.",
  })
  @ApiResponse({ status: 200, type: ResultatApercuDto })
  apercuGabarit(@Body() corps: ApercuGabaritDto): ResultatApercuDto {
    return this.referentiel.apercuGabarit(corps.modeleLibelle);
  }

  @Post('champs')
  @SuperAdminSeul()
  @ApiResponse({ status: 201, type: DefinitionChampDto })
  creerChamp(
    @Agent() auteur: AgentCourant,
    @Body() corps: CreationChampDto,
  ): Promise<DefinitionChampDto> {
    return this.referentiel.creerChamp(auteur.id, corps);
  }

  @Patch('champs/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: DefinitionChampDto })
  modifierChamp(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationChampDto,
  ): Promise<DefinitionChampDto> {
    return this.referentiel.modifierChamp(auteur.id, id, corps);
  }

  @Delete('champs/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerChamp(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.referentiel.supprimerChamp(auteur.id, id);
  }

  @Post('types-entites/:id/champs/ordre')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  ordonnerChamps(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: OrdreDto,
  ): Promise<void> {
    return this.referentiel.ordonnerChamps(auteur.id, id, corps.ids);
  }

  @Post('types-liens')
  @SuperAdminSeul()
  @ApiOperation({
    summary: "Création d'un type de lien",
    description:
      'Ses contraintes de domaine sont définitives : des liens déjà posés les respectent.',
  })
  @ApiResponse({ status: 201, type: TypeLienDto })
  creerTypeLien(
    @Agent() auteur: AgentCourant,
    @Body() corps: CreationTypeLienDto,
  ): Promise<TypeLienDto> {
    return this.referentiel.creerTypeLien(auteur.id, corps);
  }

  @Patch('types-liens/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: TypeLienDto })
  modifierTypeLien(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationTypeLienDto,
  ): Promise<TypeLienDto> {
    return this.referentiel.modifierTypeLien(auteur.id, id, corps);
  }

  @Delete('types-liens/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerTypeLien(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.referentiel.supprimerTypeLien(auteur.id, id);
  }

  @Post('onglets')
  @SuperAdminSeul()
  @ApiResponse({ status: 201, type: OngletDto })
  creerOnglet(
    @Agent() auteur: AgentCourant,
    @Body() corps: CreationOngletDto,
  ): Promise<OngletDto> {
    return this.referentiel.creerOnglet(auteur.id, corps);
  }

  @Patch('onglets/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: OngletDto })
  modifierOnglet(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationOngletDto,
  ): Promise<OngletDto> {
    return this.referentiel.modifierOnglet(auteur.id, id, corps);
  }

  @Delete('onglets/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerOnglet(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.referentiel.supprimerOnglet(auteur.id, id);
  }

  @Post('types-entites/:id/onglets/ordre')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  ordonnerOnglets(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: OrdreDto,
  ): Promise<void> {
    return this.referentiel.ordonnerOnglets(auteur.id, id, corps.ids);
  }

  @Put('onglets/:id/types-liens')
  @SuperAdminSeul()
  @ApiOperation({
    summary: "Composition d'un onglet",
    description:
      "Jeu complet, dans l'ordre. Le sens doit placer le type d'entité de l'onglet du bon côté du lien.",
  })
  @ApiResponse({ status: 200, type: OngletDto })
  @ApiResponse({
    status: 400,
    description: 'Sens incohérent avec le domaine du lien',
  })
  composerOnglet(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: CompositionOngletDto,
  ): Promise<OngletDto> {
    return this.referentiel.composerOnglet(auteur.id, id, corps);
  }
}

import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions } from '../auth/decorateurs';
import {
  EntiteOrphelineDto,
  EntreeAuditDto,
  EntreeConsultationDto,
} from './journal.dto';
import { JournalService } from './journal.service';

@ApiTags('journal')
@ApiBearerAuth('jeton')
@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get('audit')
  @Permissions(PERMISSIONS.JOURNAL_CONSULTER)
  @ApiOperation({
    summary: 'Journal d’audit',
    description:
      'Toute écriture y figure. Les libellés d’agent et de cible sont recalculés à la lecture, jamais recopiés à l’écriture — une trace figée survivrait à une anonymisation.',
  })
  @ApiQuery({ name: 'agent', required: false, format: 'uuid' })
  @ApiQuery({ name: 'cible', required: false, format: 'uuid' })
  @ApiQuery({ name: 'action', required: false })
  @ApiResponse({ status: 200, type: [EntreeAuditDto] })
  audit(
    @Agent() agent: AgentCourant,
    @Query('agent') agentId?: string,
    @Query('cible') cibleId?: string,
    @Query('action') action?: string,
    @Query('limite', new DefaultValuePipe(50), ParseIntPipe) limite = 50,
    @Query('decalage', new DefaultValuePipe(0), ParseIntPipe) decalage = 0,
  ): Promise<EntreeAuditDto[]> {
    return this.journal.audit(agent, {
      agentId,
      cibleId,
      action,
      limite: Math.min(limite, 200),
      decalage,
    });
  }

  @Get('consultations')
  @Permissions(PERMISSIONS.JOURNAL_CONSULTER)
  @ApiOperation({
    summary: 'Journal de consultation',
    description:
      'Toute lecture de fiche, **y compris celle d’un super-admin**, qui y est signalée comme telle. `derogation` distingue la lecture permise par habilitation de celle qui n’a été possible que par dérogation.',
  })
  @ApiQuery({ name: 'agent', required: false, format: 'uuid' })
  @ApiQuery({ name: 'objet', required: false, format: 'uuid' })
  @ApiQuery({ name: 'superAdmin', required: false, type: Boolean })
  @ApiQuery({ name: 'derogation', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [EntreeConsultationDto] })
  consultations(
    @Agent() agent: AgentCourant,
    @Query('agent') agentId?: string,
    @Query('objet') objetId?: string,
    @Query('superAdmin') superAdmin?: string,
    @Query('derogation') derogation?: string,
    @Query('limite', new DefaultValuePipe(50), ParseIntPipe) limite = 50,
    @Query('decalage', new DefaultValuePipe(0), ParseIntPipe) decalage = 0,
  ): Promise<EntreeConsultationDto[]> {
    return this.journal.consultations(agent, {
      agentId,
      objetId,
      superAdminSeulement: superAdmin === 'true',
      derogationSeulement: derogation === 'true',
      limite: Math.min(limite, 200),
      decalage,
    });
  }

  @Get('orphelines')
  // `entite.archiver` et non `journal.consulter`, malgré la place de l'écran en
  // administration : lier une liste de ménage à la permission des journaux
  // signifierait qu'on ne peut confier l'une sans confier l'autre — le relevé
  // de qui a consulté quoi est un pouvoir d'une tout autre nature. Et qui voit
  // un orphelin doit pouvoir en faire quelque chose.
  @Permissions(PERMISSIONS.ENTITE_ARCHIVER)
  @ApiOperation({
    summary: 'Entités orphelines',
    description:
      'Entités sans aucun lien actif, qu’une saisie en cascade interrompue peut laisser derrière elle. Liste discrète : elles ne remontent jamais en signal sur l’accueil — ce n’est pas un rapprochement, c’est du ménage.',
  })
  @ApiResponse({ status: 200, type: [EntiteOrphelineDto] })
  orphelines(@Agent() agent: AgentCourant): Promise<EntiteOrphelineDto[]> {
    return this.journal.orphelines(agent);
  }
}

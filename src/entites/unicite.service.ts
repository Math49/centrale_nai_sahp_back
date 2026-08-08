import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Explication des refus d'unicité.
 *
 * C'est la base qui refuse — la clé primaire de `valeur_unique`, maintenue par
 * trigger — et c'est très bien ainsi : la garantie ne dépend d'aucun contrôle
 * applicatif. Mais Prisma ne relaie ni le nom de la contrainte ni le message
 * levé par le trigger : il rend un P2002 sans cible. Ce service relit donc la
 * table pour nommer la valeur en cause, uniquement afin d'écrire une phrase
 * utile à l'agent.
 */
@Injectable()
export class UniciteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vrai lorsque l'erreur est un refus d'unicité venu de la base. */
  estUnRefusDUnicite(erreur: unknown): boolean {
    return (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === 'P2002'
    );
  }

  /**
   * Renvoie une phrase nommant la valeur déjà prise, ou `null` si aucune des
   * valeurs proposées n'est en cause.
   */
  async decrireLeConflit(
    typeEntiteId: string,
    candidats: { definitionChampId: string; valeur: unknown }[],
    entiteId?: string,
  ): Promise<string | null> {
    if (candidats.length === 0) {
      return null;
    }

    const champsUniques = await this.prisma.definitionChamp.findMany({
      where: {
        id: { in: candidats.map((candidat) => candidat.definitionChampId) },
        estUnique: true,
      },
    });

    for (const champ of champsUniques) {
      const candidat = candidats.find(
        (element) => element.definitionChampId === champ.id,
      );

      if (!candidat || typeof candidat.valeur !== 'string') {
        continue;
      }

      const detenteurs = await this.prisma.$queryRaw<{ entite_id: string }[]>`
        SELECT entite_id
          FROM valeur_unique
         WHERE type_entite_id = ${typeEntiteId}::uuid
           AND definition_champ_id = ${champ.id}::uuid
           AND valeur_normalisee = normaliser_valeur(${candidat.valeur})
      `;

      const ailleurs = detenteurs.find(
        (detenteur) => detenteur.entite_id !== entiteId,
      );

      if (ailleurs) {
        return `${champ.libelle} « ${candidat.valeur.trim()} » est déjà attribué à une autre fiche`;
      }
    }

    return null;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TypeDonnee, type DefinitionChamp } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Couleur d'un point dont on n'a pas choisi la teinte. Double `--accent`. */
const ACCENT = '#6f9dc4';

const HEXADECIMALE = /^#[0-9a-fA-F]{6}$/;

@Injectable()
export class ValidationDynamiqueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asynchrone à cause du seul type `carte`.
   *
   * Un point cite un type de repère, et vérifier qu'il existe demande la base.
   * Le faire ailleurs — dans les deux services appelants — écrirait la règle
   * deux fois, et le premier oubli laisserait passer un type inventé.
   */
  async valider(
    champ: DefinitionChamp,
    valeur: unknown,
  ): Promise<Prisma.InputJsonValue> {
    const nommer = (probleme: string): never => {
      throw new BadRequestException(`${champ.libelle} : ${probleme}`);
    };

    if (valeur === null || valeur === undefined) {
      return nommer('valeur absente');
    }

    switch (champ.typeDonnee) {
      case TypeDonnee.texte: {
        if (typeof valeur !== 'string' || valeur.trim().length === 0) {
          return nommer('texte attendu');
        }
        return valeur.trim();
      }

      case TypeDonnee.nombre: {
        if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
          return nommer('nombre attendu');
        }
        return valeur;
      }

      case TypeDonnee.booleen: {
        if (typeof valeur !== 'boolean') {
          return nommer('oui ou non attendu');
        }
        return valeur;
      }

      case TypeDonnee.date: {
        if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
          return nommer('date attendue au format AAAA-MM-JJ');
        }
        if (Number.isNaN(Date.parse(valeur))) {
          return nommer('date inexistante');
        }
        return valeur;
      }

      case TypeDonnee.datetime: {
        if (typeof valeur !== 'string' || Number.isNaN(Date.parse(valeur))) {
          return nommer('date et heure attendues au format ISO');
        }
        return new Date(valeur).toISOString();
      }

      case TypeDonnee.liste: {
        const options = this.optionsDe(champ);

        if (typeof valeur !== 'string') {
          return nommer('valeur de liste attendue');
        }
        if (!options.includes(valeur)) {
          return nommer(
            `valeur hors liste — attendu ${options.map((option) => `« ${option} »`).join(', ')}`,
          );
        }
        return valeur;
      }

      case TypeDonnee.fichier: {
        return nommer(
          'un champ de type fichier se renseigne par fichierId, pas par valeur',
        );
      }

      case TypeDonnee.carte: {
        return this.validerPoint(valeur, nommer);
      }
    }
  }

  /**
   * Un point posé sur le plan de la centrale.
   *
   * Les coordonnées sont **normalisées entre 0 et 1** : une position relative
   * sur le plan, jamais un pixel. C'est ce qui permet de changer de fond de
   * carte sans déplacer un point déjà posé.
   *
   * Un point hors cadre est refusé, jamais ramené au bord : ramené, il serait
   * faux sans le dire.
   */
  private async validerPoint(
    valeur: unknown,
    nommer: (probleme: string) => never,
  ): Promise<Prisma.InputJsonValue> {
    if (
      typeof valeur !== 'object' ||
      valeur === null ||
      Array.isArray(valeur)
    ) {
      return nommer('point attendu, sous la forme { x, y }');
    }

    const { x, y } = valeur as { x?: unknown; y?: unknown };

    if (typeof x !== 'number' || typeof y !== 'number') {
      return nommer('les deux coordonnées d’un point sont des nombres');
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return nommer('coordonnées non finies');
    }

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return nommer('point hors du plan — les coordonnées vont de 0 à 1');
    }

    const { typeRepereId, couleur } = valeur as {
      typeRepereId?: unknown;
      couleur?: unknown;
    };

    // Seules les clés relues ci-dessous sont retenues : une clé de plus, venue
    // d'un client bavard, s'installerait dans la projection sans que rien ne la
    // valide.
    return {
      x,
      y,
      typeRepereId: await this.validerTypeRepere(typeRepereId, nommer),
      couleur: this.validerCouleur(couleur, nommer),
    };
  }

  /**
   * Le type de repère d'un point de fiche.
   *
   * Facultatif : un point posé avant que ce choix existe reste un point, et un
   * service qui n'a encore défini aucun type doit pouvoir en poser un. Mais
   * s'il est donné, il doit exister — un identifiant inventé donnerait un
   * marqueur sans icône que personne ne saurait expliquer.
   *
   * Aucune clé étrangère ne tient cette référence : elle vit dans du `jsonb`.
   * C'est ici qu'elle s'établit, et dans `CarteService.verifierTypeNonCite`
   * qu'elle se défend à la suppression.
   */
  private async validerTypeRepere(
    valeur: unknown,
    nommer: (probleme: string) => never,
  ): Promise<string | null> {
    if (valeur === undefined || valeur === null || valeur === '') {
      return null;
    }

    if (typeof valeur !== 'string') {
      return nommer('type de repère attendu');
    }

    const type = await this.prisma.typeRepere.findUnique({
      where: { id: valeur },
      select: { id: true },
    });

    if (!type) {
      return nommer('type de repère inconnu');
    }

    return type.id;
  }

  private validerCouleur(
    valeur: unknown,
    nommer: (probleme: string) => never,
  ): string {
    if (valeur === undefined || valeur === null || valeur === '') {
      return ACCENT;
    }

    if (typeof valeur !== 'string' || !HEXADECIMALE.test(valeur)) {
      return nommer('couleur attendue au format #rrggbb');
    }

    return valeur.toLowerCase();
  }

  optionsDe(champ: DefinitionChamp): string[] {
    if (!Array.isArray(champ.options)) {
      return [];
    }

    return champ.options.filter(
      (option): option is string => typeof option === 'string',
    );
  }

  verifierObligatoires(
    champsDuType: DefinitionChamp[],
    fournis: string[],
  ): void {
    const manquants = champsDuType.filter(
      (champ) => champ.obligatoire && !fournis.includes(champ.id),
    );

    if (manquants.length > 0) {
      throw new BadRequestException(
        `champ obligatoire non renseigné : ${manquants.map((champ) => champ.libelle).join(', ')}`,
      );
    }
  }
}

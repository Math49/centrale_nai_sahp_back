import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TypeDonnee, type DefinitionChamp } from '@prisma/client';

@Injectable()
export class ValidationDynamiqueService {
  valider(champ: DefinitionChamp, valeur: unknown): Prisma.InputJsonValue {
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
    }
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

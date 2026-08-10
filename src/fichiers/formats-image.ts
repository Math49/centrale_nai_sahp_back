/**
 * Reconnaissance et nettoyage des images, **sur le contenu et non sur
 * l'extension**.
 *
 * Deux exigences de la conception §11 se règlent ici :
 *
 * - le type est vérifié en lisant les premiers octets, parce qu'une extension
 *   est une déclaration de l'agent, pas un fait ;
 * - les métadonnées sont retirées, parce qu'une photo prise en jeu ou hors jeu
 *   peut porter des coordonnées GPS, un horodatage et un identifiant d'appareil
 *   que personne n'a décidé de verser au dossier.
 *
 * **Aucun réencodage.** On retire des segments, on ne recompresse pas : une
 * pièce d'enquête ne doit pas ressortir dégradée du dépôt. C'est aussi ce qui
 * évite une dépendance native au traitement d'image.
 */

export type FormatImage = 'image/jpeg' | 'image/png' | 'image/webp';

/** Formats acceptés — laissé à l'implémentation par la conception §12. */
export const FORMATS_ACCEPTES: readonly FormatImage[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const EXTENSIONS: Record<FormatImage, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Type réel, lu dans les octets d'en-tête.
 *
 * Renvoie `null` sur tout ce qui n'est pas une des trois images acceptées —
 * y compris un fichier qui se présenterait comme telle.
 */
export function reconnaitreFormat(octets: Buffer): FormatImage | null {
  if (octets.length < 12) {
    return null;
  }

  // JPEG : SOI, toujours FF D8 FF.
  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG : signature de huit octets.
  if (octets.subarray(0, 8).equals(SIGNATURE_PNG)) {
    return 'image/png';
  }

  // WebP : conteneur RIFF, marque « WEBP » en huitième position.
  if (
    octets.subarray(0, 4).toString('ascii') === 'RIFF' &&
    octets.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

const SIGNATURE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Retire les métadonnées, sans toucher aux données d'image. */
export function nettoyerMetadonnees(
  octets: Buffer,
  format: FormatImage,
): Buffer {
  switch (format) {
    case 'image/jpeg':
      return nettoyerJpeg(octets);
    case 'image/png':
      return nettoyerPng(octets);
    case 'image/webp':
      return nettoyerWebp(octets);
  }
}

/**
 * JPEG — on écarte les segments applicatifs et les commentaires.
 *
 * `APP1` porte l'EXIF et le XMP, `APP2` l'ICC et parfois du MPF, `APP13` les
 * données IPTC de Photoshop. On garde `APP0` (JFIF), qui décrit la densité de
 * l'image et rien d'autre, et on s'arrête au premier `SOS` : au-delà commencent
 * les données compressées, où toute lecture de segment serait fantaisiste.
 */
function nettoyerJpeg(octets: Buffer): Buffer {
  const morceaux: Buffer[] = [octets.subarray(0, 2)]; // SOI
  let position = 2;

  while (position + 4 <= octets.length) {
    if (octets[position] !== 0xff) {
      // Flux mal formé : on rend l'original plutôt qu'une image tronquée.
      return octets;
    }

    const marqueur = octets[position + 1];

    // SOS — début des données compressées, qui vont jusqu'à la fin.
    if (marqueur === 0xda) {
      morceaux.push(octets.subarray(position));
      return Buffer.concat(morceaux);
    }

    const longueur = octets.readUInt16BE(position + 2);
    const fin = position + 2 + longueur;

    if (longueur < 2 || fin > octets.length) {
      return octets;
    }

    const applicatif = marqueur >= 0xe1 && marqueur <= 0xef;
    const commentaire = marqueur === 0xfe;

    if (!applicatif && !commentaire) {
      morceaux.push(octets.subarray(position, fin));
    }

    position = fin;
  }

  return Buffer.concat(morceaux);
}

/**
 * PNG — on ne garde que les blocs critiques et les blocs de rendu.
 *
 * Le format est une suite de blocs typés. `eXIf`, `tEXt`, `iTXt`, `zTXt` et
 * `tIME` portent respectivement l'EXIF, des commentaires et la date de dernière
 * modification : tous partent. `gAMA`, `cHRM` et `sRGB` restent, sans quoi les
 * couleurs de l'image changeraient.
 */
const BLOCS_PNG_CONSERVES = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'bKGD',
  'pHYs',
  'acTL',
  'fcTL',
  'fdAT',
]);

function nettoyerPng(octets: Buffer): Buffer {
  const morceaux: Buffer[] = [octets.subarray(0, 8)];
  let position = 8;

  while (position + 12 <= octets.length) {
    const longueur = octets.readUInt32BE(position);
    const type = octets.subarray(position + 4, position + 8).toString('ascii');
    const fin = position + 12 + longueur;

    if (fin > octets.length) {
      return octets;
    }

    if (BLOCS_PNG_CONSERVES.has(type)) {
      morceaux.push(octets.subarray(position, fin));
    }

    position = fin;

    if (type === 'IEND') {
      break;
    }
  }

  return Buffer.concat(morceaux);
}

/**
 * WebP — on retire les morceaux `EXIF` et `XMP ` du conteneur RIFF.
 *
 * La taille annoncée en tête du fichier doit être réécrite, faute de quoi les
 * lecteurs verraient un conteneur plus long que son contenu.
 */
function nettoyerWebp(octets: Buffer): Buffer {
  const morceaux: Buffer[] = [octets.subarray(12, 12)];
  let position = 12;
  let retire = false;

  while (position + 8 <= octets.length) {
    const type = octets.subarray(position, position + 4).toString('ascii');
    const longueur = octets.readUInt32LE(position + 4);
    // Les morceaux RIFF sont alignés sur deux octets.
    const fin = position + 8 + longueur + (longueur % 2);

    if (fin > octets.length) {
      return octets;
    }

    if (type === 'EXIF' || type === 'XMP ') {
      retire = true;
    } else {
      morceaux.push(octets.subarray(position, fin));
    }

    position = fin;
  }

  if (!retire) {
    return octets;
  }

  const contenu = Buffer.concat(morceaux);
  const entete = Buffer.from(octets.subarray(0, 12));

  // Taille RIFF = tout ce qui suit les huit premiers octets.
  entete.writeUInt32LE(contenu.length + 4, 4);

  return Buffer.concat([entete, contenu]);
}

/**
 * L'image porte-t-elle encore des métadonnées ?
 *
 * Sert à la vérification de sortie du dépôt, et aux tests : mieux vaut relire
 * le résultat que faire confiance au nettoyage.
 */
export function porteDesMetadonnees(
  octets: Buffer,
  format: FormatImage,
): boolean {
  if (format === 'image/jpeg') {
    let position = 2;

    while (position + 4 <= octets.length) {
      if (octets[position] !== 0xff) {
        return false;
      }

      const marqueur = octets[position + 1];

      if (marqueur === 0xda) {
        return false;
      }

      if ((marqueur >= 0xe1 && marqueur <= 0xef) || marqueur === 0xfe) {
        return true;
      }

      position += 2 + octets.readUInt16BE(position + 2);
    }

    return false;
  }

  if (format === 'image/png') {
    let position = 8;

    while (position + 12 <= octets.length) {
      const longueur = octets.readUInt32BE(position);
      const type = octets
        .subarray(position + 4, position + 8)
        .toString('ascii');

      if (!BLOCS_PNG_CONSERVES.has(type)) {
        return true;
      }

      position += 12 + longueur;
    }

    return false;
  }

  let position = 12;

  while (position + 8 <= octets.length) {
    const type = octets.subarray(position, position + 4).toString('ascii');
    const longueur = octets.readUInt32LE(position + 4);

    if (type === 'EXIF' || type === 'XMP ') {
      return true;
    }

    position += 8 + longueur + (longueur % 2);
  }

  return false;
}

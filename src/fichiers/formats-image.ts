export type FormatImage = 'image/jpeg' | 'image/png' | 'image/webp';

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

export function reconnaitreFormat(octets: Buffer): FormatImage | null {
  if (octets.length < 12) {
    return null;
  }

  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) {
    return 'image/jpeg';
  }

  if (octets.subarray(0, 8).equals(SIGNATURE_PNG)) {
    return 'image/png';
  }

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

function nettoyerJpeg(octets: Buffer): Buffer {
  const morceaux: Buffer[] = [octets.subarray(0, 2)];
  let position = 2;

  while (position + 4 <= octets.length) {
    if (octets[position] !== 0xff) {
      return octets;
    }

    const marqueur = octets[position + 1];

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

function nettoyerWebp(octets: Buffer): Buffer {
  const morceaux: Buffer[] = [octets.subarray(12, 12)];
  let position = 12;
  let retire = false;

  while (position + 8 <= octets.length) {
    const type = octets.subarray(position, position + 4).toString('ascii');
    const longueur = octets.readUInt32LE(position + 4);

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

  entete.writeUInt32LE(contenu.length + 4, 4);

  return Buffer.concat([entete, contenu]);
}

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

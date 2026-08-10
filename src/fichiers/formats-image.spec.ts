import {
  nettoyerMetadonnees,
  porteDesMetadonnees,
  reconnaitreFormat,
} from './formats-image';

/** Un segment JPEG : marqueur, longueur sur deux octets, charge utile. */
function segment(marqueur: number, charge: Uint8Array): Buffer {
  const entete = Buffer.alloc(4);
  entete[0] = 0xff;
  entete[1] = marqueur;
  entete.writeUInt16BE(charge.length + 2, 2);
  return Buffer.concat([entete, charge]);
}

function jpeg(options: { exif?: boolean; commentaire?: boolean } = {}): Buffer {
  const morceaux: Uint8Array[] = [Buffer.from([0xff, 0xd8])]; // SOI

  morceaux.push(segment(0xe0, Buffer.from('JFIF\0\0\0')));

  if (options.exif) {
    morceaux.push(
      segment(0xe1, Buffer.from('Exif\0\0MM*GPSLatitude 34.0522N')),
    );
  }

  if (options.commentaire) {
    morceaux.push(segment(0xfe, Buffer.from('Appareil de service n°4')));
  }

  // SOS puis données compressées, jusqu'à EOI.
  morceaux.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0]));
  morceaux.push(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]));

  return Buffer.concat(morceaux);
}

function blocPng(type: string, charge: Uint8Array): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(charge.length);
  // Le CRC n'est pas vérifié par le nettoyage : quatre octets suffisent.
  return Buffer.concat([
    longueur,
    Buffer.from(type, 'ascii'),
    charge,
    Buffer.alloc(4),
  ]);
}

function png(options: { texte?: boolean; exif?: boolean } = {}): Buffer {
  const morceaux: Uint8Array[] = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocPng('IHDR', Buffer.alloc(13)),
  ];

  if (options.texte) {
    morceaux.push(blocPng('tEXt', Buffer.from('Comment\0poste 12')));
  }

  if (options.exif) {
    morceaux.push(blocPng('eXIf', Buffer.from('MM*GPS')));
  }

  morceaux.push(blocPng('IDAT', Buffer.from([1, 2, 3, 4])));
  morceaux.push(blocPng('IEND', Buffer.alloc(0)));

  return Buffer.concat(morceaux);
}

function morceauRiff(type: string, charge: Uint8Array): Buffer {
  const entete = Buffer.alloc(8);
  entete.write(type, 0, 'ascii');
  entete.writeUInt32LE(charge.length, 4);
  const bourrage = charge.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([entete, charge, bourrage]);
}

function webp(options: { exif?: boolean } = {}): Buffer {
  const morceaux: Uint8Array[] = [
    morceauRiff('VP8 ', Buffer.from([1, 2, 3, 4, 5, 6])),
  ];

  if (options.exif) {
    morceaux.push(morceauRiff('EXIF', Buffer.from('MM*GPS 48.85N')));
  }

  const contenu = Buffer.concat(morceaux);
  const entete = Buffer.alloc(12);
  entete.write('RIFF', 0, 'ascii');
  entete.writeUInt32LE(contenu.length + 4, 4);
  entete.write('WEBP', 8, 'ascii');

  return Buffer.concat([entete, contenu]);
}

describe('reconnaissance du format', () => {
  it('lit le type dans les octets, pas dans l’extension', () => {
    expect(reconnaitreFormat(jpeg())).toBe('image/jpeg');
    expect(reconnaitreFormat(png())).toBe('image/png');
    expect(reconnaitreFormat(webp())).toBe('image/webp');
  });

  it('refuse ce qui n’est pas une image acceptée', () => {
    // Un exécutable Windows, qu'une extension .jpg ne rendrait pas inoffensif.
    const executable = Buffer.concat([
      Buffer.from('MZ'),
      Buffer.alloc(64, 0x90),
    ]);

    expect(reconnaitreFormat(executable)).toBeNull();
    expect(reconnaitreFormat(Buffer.from('GIF89a-----'))).toBeNull();
    expect(reconnaitreFormat(Buffer.alloc(4))).toBeNull();
  });
});

describe('nettoyage des métadonnées', () => {
  it('retire l’EXIF d’un JPEG', () => {
    const avec = jpeg({ exif: true });
    expect(porteDesMetadonnees(avec, 'image/jpeg')).toBe(true);

    const propre = nettoyerMetadonnees(avec, 'image/jpeg');

    expect(porteDesMetadonnees(propre, 'image/jpeg')).toBe(false);
    expect(propre.includes(Buffer.from('GPSLatitude'))).toBe(false);
  });

  it('retire aussi les commentaires', () => {
    const propre = nettoyerMetadonnees(
      jpeg({ commentaire: true }),
      'image/jpeg',
    );

    expect(propre.includes(Buffer.from('Appareil de service'))).toBe(false);
  });

  it('garde le JFIF et les données compressées intactes', () => {
    const propre = nettoyerMetadonnees(jpeg({ exif: true }), 'image/jpeg');

    // Le JFIF ne décrit que la densité : le retirer changerait le rendu.
    expect(propre.includes(Buffer.from('JFIF'))).toBe(true);
    // Les octets d'image ne sont pas touchés — aucun réencodage.
    expect(propre.includes(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]))).toBe(
      true,
    );
  });

  it('retire le texte et l’EXIF d’un PNG sans toucher aux données', () => {
    const avec = png({ texte: true, exif: true });
    expect(porteDesMetadonnees(avec, 'image/png')).toBe(true);

    const propre = nettoyerMetadonnees(avec, 'image/png');

    expect(porteDesMetadonnees(propre, 'image/png')).toBe(false);
    expect(propre.includes(Buffer.from('poste 12'))).toBe(false);
    expect(propre.includes(Buffer.from('IDAT'))).toBe(true);
    expect(propre.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('retire l’EXIF d’un WebP et corrige la taille du conteneur', () => {
    const avec = webp({ exif: true });
    expect(porteDesMetadonnees(avec, 'image/webp')).toBe(true);

    const propre = nettoyerMetadonnees(avec, 'image/webp');

    expect(porteDesMetadonnees(propre, 'image/webp')).toBe(false);
    expect(propre.includes(Buffer.from('GPS 48.85N'))).toBe(false);
    // Un conteneur qui annoncerait une taille fausse serait illisible.
    expect(propre.readUInt32LE(4)).toBe(propre.length - 8);
    expect(reconnaitreFormat(propre)).toBe('image/webp');
  });

  it('laisse intacte une image déjà propre', () => {
    for (const [octets, format] of [
      [jpeg(), 'image/jpeg'],
      [png(), 'image/png'],
      [webp(), 'image/webp'],
    ] as const) {
      expect(nettoyerMetadonnees(octets, format)).toEqual(octets);
    }
  });

  it('rend l’original plutôt qu’une image tronquée sur un flux mal formé', () => {
    const tronque = jpeg({ exif: true }).subarray(0, 12);

    expect(nettoyerMetadonnees(tronque, 'image/jpeg')).toEqual(tronque);
  });
});

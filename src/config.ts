// Datos del club en un solo sitio. Si cambia algo (nombre, CIF, dirección, email,
// club de Clupik), se edita aquí y se publica: no hace falta tocar nada más.
export const CLUB = {
  /** Nombre del club: portada, pie, textos legales y justificantes. Pendiente de que Iván confirme el nombre legal. */
  legalName: 'Club Deportivo Elemental Uros de Rivas',
  /** Nombre corto (título de la web, vista previa al compartir). */
  shortName: 'Uros de Rivas',
  /** CIF del club. Sustituir el valor de relleno antes de cobrar de verdad. */
  cif: 'GXXXXXXXXX',
  address: {
    street: 'Calle de Aigües Tortes',
    postalCode: '28522',
    city: 'Rivas-Vaciamadrid',
    province: 'Madrid',
  },
  contactEmail: 'administracion@urosderivas.com',
};

export const CLUPIK = {
  /** ID del club en Clupik (calendario, clasificaciones e importador de la tienda). */
  clubId: '67',
  /** Nombre del club tal como aparece en Clupik, para resaltarlo en las clasificaciones. */
  clubName: 'Uros de Rivas',
  languageId: '709',
};

export const clubAddressLine = `${CLUB.address.street}, ${CLUB.address.postalCode} - ${CLUB.address.city}, ${CLUB.address.province}`;

/** Avisos fijos de la barra superior. Se suman a los campus con inscripciones abiertas. */
export const PROMO_MESSAGES: { text: string; to?: string }[] = [
  { text: 'Pago seguro con tarjeta o en mano en el club' },
  { text: 'Equipaciones y merchandising oficial en la tienda', to: '/market' },
];

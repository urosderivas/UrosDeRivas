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
  /** ID del club en Clupik (importadores de la tienda y de campus del panel de admin). */
  clubId: '67',
  /** Nombre del club tal como aparece en Clupik (lugar de los campus importados). */
  clubName: 'Uros de Rivas',
  languageId: '709',
};

export const clubAddressLine = `${CLUB.address.street}, ${CLUB.address.postalCode} - ${CLUB.address.city}, ${CLUB.address.province}`;

/** Secciones que se pueden ocultar sin borrarlas. Para volver a enseñar una, se pone true y se publica. */
export const FEATURES = {
  /** Citas de fisioterapia (página /citas, menú y pestaña del panel). Ponlo a false para ocultarlas sin borrar nada. */
  appointments: true,
};

/** Avisos fijos de la barra superior. Se suman a los campus con inscripciones abiertas. */
export const PROMO_MESSAGES: { text: string; to?: string }[] = [
  { text: 'Tienda oficial: equipaciones y merchandising del club', to: '/market' },
  { text: 'Equipaciones y merchandising oficial en la tienda', to: '/market' },
];

// Datos del club en un solo sitio. Si cambia algo (CIF, dirección, email,
// club de Clupik), se edita aquí y se publica: no hace falta tocar nada más.
export const CLUB = {
  /** Nombre legal, el que sale en los textos legales y en las facturas. */
  legalName: 'C.B. Uros de Rivas',
  /** Nombre largo en mayúsculas para la cabecera de las facturas. */
  invoiceName: 'CLUB BALONCESTO UROS DE RIVAS',
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

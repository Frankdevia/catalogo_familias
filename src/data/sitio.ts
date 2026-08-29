/**
 * Datos de la Fundación que aparecen en cabecera y pie, tomados del diseño.
 * `signupUrl` y `contactEmail` eran props editables del canvas de Claude Design.
 */
export const SITIO = {
  nombre: 'Apoye a Nuestras Familias',
  organizacion: 'Fundación Liceo Inglés',
  descripcion:
    'Catálogo de negocios de las familias de la Fundación Liceo Inglés. Cuando les compras, fortaleces la economía de la familia FLI.',
  /** Formulario de postulación, en el propio sitio. */
  signupUrl: '/registrar',
  contactEmail: 'familiasfli@liceoingles.edu.co',
  direccion: ['Km 5 Vía Cerritos, Entrada 17', 'Pereira, Risaralda · Colombia'],
  telefonos: ['+57 606 349 7750', '+57 300 912 1109'],
  /** Indicativo de país que se antepone a los teléfonos de los negocios. */
  indicativo: '+57',
} as const;

/** Las cinco formas de apoyar, en el orden del diseño. */
export const FORMAS_DE_APOYAR = [
  {
    n: '01',
    titulo: 'Recomienda',
    cuerpo:
      'Cuéntale a un amigo sobre un negocio del catálogo y deja reseñas positivas en Google o redes.',
  },
  {
    n: '02',
    titulo: 'Comparte',
    cuerpo:
      'Sigue los negocios FLI en redes, etiqueta y comparte sus publicaciones con tu red.',
  },
  {
    n: '03',
    titulo: 'Prefiere FLI',
    cuerpo:
      'Para regalos, eventos y servicios, busca primero en el catálogo de la comunidad.',
  },
  {
    n: '04',
    titulo: 'Conecta',
    cuerpo:
      'Presenta a las familias emprendedoras con clientes o aliados que puedan necesitarlas.',
  },
  {
    n: '05',
    titulo: 'Invita',
    cuerpo: 'Invita a otras familias del colegio a inscribir su negocio en el catálogo.',
  },
] as const;

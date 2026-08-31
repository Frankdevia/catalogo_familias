/**
 * Datos de la Fundación que aparecen en cabecera y pie, tomados del diseño.
 * `signupUrl` y `contactEmail` eran props editables del canvas de Claude Design.
 */
export const SITIO = {
  /** Nombre corto: es lo que sale en la pestaña del navegador. */
  nombre: 'FLI FBC',
  /** Nombre completo, para donde haya sitio de sobra. */
  nombreLargo: 'Family Business Community',
  organizacion: 'Fundación Liceo Inglés',
  /** Lema que acompaña al logo en la cabecera. */
  lema: 'Still we rise!',
  descripcion:
    'Catálogo de negocios de las familias de la Fundación Liceo Inglés. Cuando les compras, fortaleces la economía de la familia FLI.',
  /** Formulario de postulación, en el propio sitio. */
  signupUrl: '/registrar',
  contactEmail: 'tecnologia@liceoingles.edu.co',
  direccion: ['Km 5 Vía Cerritos, Entrada 17', 'Pereira, Risaralda · Colombia'],
  telefonos: ['+57 606 349 7750', '+57 300 912 1109'],
  /** Indicativo de país que se antepone a los teléfonos de los negocios. */
  indicativo: '+57',
} as const;

/**
 * Retrouver le gouvernorat depuis la position du visiteur.
 *
 * Le navigateur donne des coordonnées, pas une adresse. Les traduire demande
 * normalement un service de géocodage — un compte, une clé, une facture, et un
 * appel réseau qui peut échouer. Pour vingt-quatre zones, le centre de chacune
 * suffit : on retient la plus proche.
 *
 * HONNÊTETÉ TECHNIQUE : c'est une approximation. À la frontière de deux
 * gouvernorats, elle peut se tromper d'une case — c'est pourquoi le résultat
 * est toujours proposé, jamais imposé, et reste modifiable d'un geste.
 */

/** Centre approximatif de chaque gouvernorat. */
export const CENTRES = {
  tunis: [36.80, 10.18], ariana: [36.87, 10.16], 'ben-arous': [36.75, 10.23],
  manouba: [36.81, 9.98], nabeul: [36.45, 10.74], zaghouan: [36.40, 10.14],
  bizerte: [37.27, 9.87], beja: [36.73, 9.18], jendouba: [36.50, 8.78],
  kef: [36.17, 8.70], siliana: [36.08, 9.37], sousse: [35.83, 10.64],
  monastir: [35.78, 10.83], mahdia: [35.50, 11.06], sfax: [34.74, 10.76],
  kairouan: [35.68, 10.10], kasserine: [35.17, 8.83], 'sidi-bouzid': [35.04, 9.48],
  gabes: [33.88, 10.10], medenine: [33.35, 10.50], tataouine: [32.93, 10.45],
  gafsa: [34.42, 8.78], tozeur: [33.92, 8.13], kebili: [33.70, 8.97],
};

/** Rectangle englobant la Tunisie, avec une marge côtière. */
export const TUNISIE = { latMin: 30.0, latMax: 37.8, lonMin: 7.3, lonMax: 11.8 };

/** Cette position est-elle en Tunisie ? */
export const enTunisie = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon)
  && lat >= TUNISIE.latMin && lat <= TUNISIE.latMax
  && lon >= TUNISIE.lonMin && lon <= TUNISIE.lonMax;

/**
 * Distance approchée entre deux points, en kilomètres.
 * Projection équirectangulaire : sur l'étendue de la Tunisie, l'erreur est
 * bien inférieure à la taille d'un gouvernorat, et c'est tout ce qui compte
 * pour désigner le plus proche.
 */
export function distance([latA, lonA], [latB, lonB]) {
  const R = 6371;
  const rad = Math.PI / 180;
  const x = (lonB - lonA) * rad * Math.cos(((latA + latB) / 2) * rad);
  const y = (latB - latA) * rad;
  return R * Math.hypot(x, y);
}

/**
 * Le gouvernorat dont le centre est le plus proche.
 * @returns {{id:string, km:number}|null} `null` hors de Tunisie — mieux vaut
 *   ne rien proposer qu'un gouvernorat absurde pour qui consulte d'ailleurs.
 */
export function gouvernoratLePlusProche(lat, lon) {
  if (!enTunisie(lat, lon)) return null;
  let meilleur = null;
  for (const [id, centre] of Object.entries(CENTRES)) {
    const km = distance([lat, lon], centre);
    if (!meilleur || km < meilleur.km) meilleur = { id, km };
  }
  return meilleur;
}

/** Ce que chaque échec de localisation signifie, en clair. */
export const REFUS = {
  indisponible: 'Votre navigateur ne sait pas vous localiser. Choisissez votre gouvernorat dans la liste.',
  refuse: 'Localisation refusée. Choisissez votre gouvernorat dans la liste.',
  echec: 'Position introuvable. Choisissez votre gouvernorat dans la liste.',
  horsTunisie: 'Vous semblez être hors de Tunisie. Choisissez le gouvernorat concerné dans la liste.',
};

/**
 * Demande la position au navigateur et en déduit le gouvernorat.
 *
 * CE QUI A CHANGÉ, ET POURQUOI. On ne retenait que la latitude, la longitude
 * et la précision. Il manquait tout ce qui permet de juger la mesure :
 * l'altitude — qui change la production de plusieurs pour cent en montagne —,
 * l'heure du relevé — une position d'il y a deux heures n'est pas celle d'un
 * client qui a changé de chantier —, et le fait de savoir si le terminal a
 * réellement sollicité son GPS ou s'est contenté du réseau.
 *
 * `haute` demande le GPS. C'est plus lent et plus coûteux en batterie ; on ne
 * le fait donc que lorsque l'utilisateur le demande explicitement, pas au
 * chargement de la page.
 *
 * @param {object} [opts]
 * @param {object} [opts.geo] injecté par les tests
 * @param {boolean} [opts.haute] solliciter le GPS plutôt que le réseau
 * @returns {Promise<{ok:true, id:string, km:number, latitude:number,
 *   longitude:number, precision:number|null, altitude:number|null,
 *   horodatage:number, origine:string}|{ok:false, raison:keyof REFUS}>}
 */
export function localiser({
  geo = globalThis.navigator?.geolocation,
  delai = 8000,
  haute = false,
} = {}) {
  return new Promise((resoudre) => {
    if (!geo?.getCurrentPosition) return resoudre({ ok: false, raison: 'indisponible' });
    geo.getCurrentPosition(
      (pos) => {
        const c = pos?.coords ?? {};
        const { latitude, longitude } = c;
        const trouve = gouvernoratLePlusProche(latitude, longitude);
        if (!trouve) return resoudre({ ok: false, raison: 'horsTunisie' });

        // Un nombre, ou rien. `Number(null)` vaut zéro : une altitude absente
        // deviendrait « au niveau de la mer », et une précision absente
        // deviendrait « zéro mètre », c'est-à-dire parfaite. Deux mensonges
        // pour une seule étourderie.
        const nb = (v) => {
          if (v === null || v === undefined || typeof v === 'boolean') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        const precision = nb(c.accuracy);
        resoudre({
          ok: true,
          ...trouve,
          latitude,
          longitude,
          precision,
          altitude: nb(c.altitude),
          precisionAltitude: nb(c.altitudeAccuracy),
          horodatage: nb(pos?.timestamp) ?? Date.now(),
          // On ne prétend pas savoir quel capteur a répondu : le navigateur ne
          // le dit pas. En revanche, une précision de quelques mètres ne
          // s'obtient que par satellite — c'est une déduction, pas une
          // déclaration, et le libellé reste prudent.
          origine: haute && precision !== null && precision <= 20 ? 'capteur-fin' : 'capteur',
        });
      },
      (err) => resoudre({
        ok: false,
        // 1 = permission refusée ; le reste est un échec technique.
        raison: err?.code === 1 ? 'refuse' : 'echec',
      }),
      {
        enableHighAccuracy: Boolean(haute),
        timeout: delai,
        // Une demande de précision ne doit pas être servie par un relevé
        // vieux de dix minutes : ce serait la même position, présentée comme
        // meilleure.
        maximumAge: haute ? 0 : 600000,
      },
    );
  });
}

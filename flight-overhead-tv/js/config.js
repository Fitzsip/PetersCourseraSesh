/*
 * Default settings. Everything here can also be changed on the TV from the
 * Settings screen (press OK); those changes are saved on the TV and win over
 * these defaults.
 */
var DEFAULT_CONFIG = {
  // Your house. Leave as null to be asked on first launch.
  // Tip: in Google Maps, right-click your roof and click the coordinates to copy them.
  homeLat: null,
  homeLon: null,
  homeName: 'Home',


  // Data source: 'adsb.lol' (free, no key), 'airplanes.live' (free, no key)
  // or 'opensky' (free, but anonymous use is limited to ~400 requests a day).
  provider: 'adsb.lol',

  alertRadiusKm: 2.5,      // a plane within this distance counts as "overhead"
  maxAltitudeFt: 20000,    // ignore planes higher than this
  watchRadiusKm: 30,       // range of the radar screen
  lookaheadSeconds: 30,    // alert early if a plane will be overhead within this time
  pollSeconds: 5,          // how often to ask the API for positions
  popupSeconds: 25,        // how long a popup stays on screen
  cooldownMinutes: 20,     // don't re-announce the same aircraft within this time

  units: 'metric',         // 'metric' (m, km/h, km) or 'imperial' (ft, mph, mi)
  sound: true,
  showRoutes: true,        // look up origin/destination (adsb.lol route API)
  showPhotos: true,        // look up an aircraft photo (planespotters.net)
  alertFilter: 'all',      // 'all' or 'private jets' (radar still shows everything)
  demo: false,             // simulated planes, handy for testing indoors

  // Optional FlightAware AeroAPI key. Adds where each plane took off, how long it has
  // been flying and which countries it has been to today. See README for setup.
  flightawareKey: ''
};

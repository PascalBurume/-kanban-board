// Nigeria: 36 states + the Federal Capital Territory, positioned at real
// coordinates so the hero map answers "does this work where I am?" honestly.
//
// DATA HONESTY (spec §5.8): `smallBusinesses`, `unregisteredShare` and
// `registered` are ILLUSTRATIVE. They are plausible shapes derived from state
// population weighting, not measured figures. They must be replaced with
// verified SMEDAN/NBS data before launch, and the "illustrative" label must
// stay visible in the same viewport as the numbers until they are.

export type Zone =
  | "North Central"
  | "North East"
  | "North West"
  | "South East"
  | "South South"
  | "South West";

export interface NgState {
  id: string;
  name: string;
  capital: string;
  zone: Zone;
  lat: number;
  lon: number;
  /** Illustrative. Estimated small businesses, in thousands. */
  smallBusinesses: number;
  /** Illustrative. Share not yet registered, 0-1. */
  unregisteredShare: number;
  /** Illustrative pilot figure. Registered through Rejista. */
  registered: number;
  hub?: boolean;
}

export const ZONE_COLOR: Record<Zone, string> = {
  "North West": "#E8A33D",
  "North East": "#C1521F",
  "North Central": "#E6C36A",
  "South West": "#4C9BE8",
  "South East": "#5FBF8B",
  "South South": "#7BD3C4",
};

export const STATES: NgState[] = [
  { id: "LA", name: "Lagos", capital: "Ikeja", zone: "South West", lat: 6.6, lon: 3.35, smallBusinesses: 3350, unregisteredShare: 0.86, registered: 6120, hub: true },
  { id: "FC", name: "Federal Capital Territory", capital: "Abuja", zone: "North Central", lat: 9.07, lon: 7.4, smallBusinesses: 980, unregisteredShare: 0.79, registered: 2410, hub: true },
  { id: "KN", name: "Kano", capital: "Kano", zone: "North West", lat: 12.0, lon: 8.52, smallBusinesses: 2480, unregisteredShare: 0.93, registered: 1870, hub: true },
  { id: "RI", name: "Rivers", capital: "Port Harcourt", zone: "South South", lat: 4.81, lon: 7.05, smallBusinesses: 1290, unregisteredShare: 0.88, registered: 1240, hub: true },
  { id: "KD", name: "Kaduna", capital: "Kaduna", zone: "North West", lat: 10.52, lon: 7.44, smallBusinesses: 1510, unregisteredShare: 0.91, registered: 940, hub: true },

  { id: "AB", name: "Abia", capital: "Umuahia", zone: "South East", lat: 5.53, lon: 7.49, smallBusinesses: 690, unregisteredShare: 0.87, registered: 312 },
  { id: "AD", name: "Adamawa", capital: "Yola", zone: "North East", lat: 9.2, lon: 12.48, smallBusinesses: 720, unregisteredShare: 0.94, registered: 148 },
  { id: "AK", name: "Akwa Ibom", capital: "Uyo", zone: "South South", lat: 5.04, lon: 7.91, smallBusinesses: 880, unregisteredShare: 0.89, registered: 264 },
  { id: "AN", name: "Anambra", capital: "Awka", zone: "South East", lat: 6.21, lon: 7.07, smallBusinesses: 1180, unregisteredShare: 0.84, registered: 596 },
  { id: "BA", name: "Bauchi", capital: "Bauchi", zone: "North East", lat: 10.31, lon: 9.84, smallBusinesses: 940, unregisteredShare: 0.94, registered: 176 },
  { id: "BY", name: "Bayelsa", capital: "Yenagoa", zone: "South South", lat: 4.92, lon: 6.26, smallBusinesses: 340, unregisteredShare: 0.9, registered: 108 },
  { id: "BE", name: "Benue", capital: "Makurdi", zone: "North Central", lat: 7.73, lon: 8.54, smallBusinesses: 880, unregisteredShare: 0.92, registered: 204 },
  { id: "BO", name: "Borno", capital: "Maiduguri", zone: "North East", lat: 11.83, lon: 13.15, smallBusinesses: 760, unregisteredShare: 0.95, registered: 96 },
  { id: "CR", name: "Cross River", capital: "Calabar", zone: "South South", lat: 4.98, lon: 8.34, smallBusinesses: 640, unregisteredShare: 0.89, registered: 218 },
  { id: "DE", name: "Delta", capital: "Asaba", zone: "South South", lat: 6.2, lon: 6.73, smallBusinesses: 1040, unregisteredShare: 0.87, registered: 402 },
  { id: "EB", name: "Ebonyi", capital: "Abakaliki", zone: "South East", lat: 6.32, lon: 8.11, smallBusinesses: 480, unregisteredShare: 0.91, registered: 142 },
  { id: "ED", name: "Edo", capital: "Benin City", zone: "South South", lat: 6.34, lon: 5.62, smallBusinesses: 830, unregisteredShare: 0.86, registered: 358 },
  { id: "EK", name: "Ekiti", capital: "Ado-Ekiti", zone: "South West", lat: 7.62, lon: 5.22, smallBusinesses: 470, unregisteredShare: 0.88, registered: 186 },
  { id: "EN", name: "Enugu", capital: "Enugu", zone: "South East", lat: 6.45, lon: 7.5, smallBusinesses: 760, unregisteredShare: 0.86, registered: 344 },
  { id: "GO", name: "Gombe", capital: "Gombe", zone: "North East", lat: 10.29, lon: 11.17, smallBusinesses: 520, unregisteredShare: 0.94, registered: 112 },
  { id: "IM", name: "Imo", capital: "Owerri", zone: "South East", lat: 5.48, lon: 7.03, smallBusinesses: 890, unregisteredShare: 0.86, registered: 366 },
  { id: "JI", name: "Jigawa", capital: "Dutse", zone: "North West", lat: 11.76, lon: 9.34, smallBusinesses: 780, unregisteredShare: 0.95, registered: 104 },
  { id: "KT", name: "Katsina", capital: "Katsina", zone: "North West", lat: 12.99, lon: 7.6, smallBusinesses: 1120, unregisteredShare: 0.94, registered: 188 },
  { id: "KE", name: "Kebbi", capital: "Birnin Kebbi", zone: "North West", lat: 12.45, lon: 4.2, smallBusinesses: 640, unregisteredShare: 0.95, registered: 92 },
  { id: "KO", name: "Kogi", capital: "Lokoja", zone: "North Central", lat: 7.8, lon: 6.74, smallBusinesses: 700, unregisteredShare: 0.9, registered: 214 },
  { id: "KW", name: "Kwara", capital: "Ilorin", zone: "North Central", lat: 8.5, lon: 4.55, smallBusinesses: 610, unregisteredShare: 0.88, registered: 246 },
  { id: "NA", name: "Nasarawa", capital: "Lafia", zone: "North Central", lat: 8.49, lon: 8.52, smallBusinesses: 450, unregisteredShare: 0.91, registered: 158 },
  { id: "NI", name: "Niger", capital: "Minna", zone: "North Central", lat: 9.61, lon: 6.55, smallBusinesses: 820, unregisteredShare: 0.92, registered: 176 },
  { id: "OG", name: "Ogun", capital: "Abeokuta", zone: "South West", lat: 7.16, lon: 3.35, smallBusinesses: 1130, unregisteredShare: 0.85, registered: 612 },
  { id: "ON", name: "Ondo", capital: "Akure", zone: "South West", lat: 7.25, lon: 5.19, smallBusinesses: 760, unregisteredShare: 0.87, registered: 288 },
  { id: "OS", name: "Osun", capital: "Osogbo", zone: "South West", lat: 7.77, lon: 4.56, smallBusinesses: 720, unregisteredShare: 0.87, registered: 274 },
  { id: "OY", name: "Oyo", capital: "Ibadan", zone: "South West", lat: 7.38, lon: 3.9, smallBusinesses: 1420, unregisteredShare: 0.86, registered: 736 },
  { id: "PL", name: "Plateau", capital: "Jos", zone: "North Central", lat: 9.9, lon: 8.86, smallBusinesses: 690, unregisteredShare: 0.91, registered: 192 },
  { id: "SO", name: "Sokoto", capital: "Sokoto", zone: "North West", lat: 13.06, lon: 5.24, smallBusinesses: 700, unregisteredShare: 0.95, registered: 98 },
  { id: "TA", name: "Taraba", capital: "Jalingo", zone: "North East", lat: 8.89, lon: 11.37, smallBusinesses: 480, unregisteredShare: 0.94, registered: 86 },
  { id: "YO", name: "Yobe", capital: "Damaturu", zone: "North East", lat: 11.75, lon: 11.97, smallBusinesses: 470, unregisteredShare: 0.95, registered: 74 },
  { id: "ZA", name: "Zamfara", capital: "Gusau", zone: "North West", lat: 12.16, lon: 6.66, smallBusinesses: 620, unregisteredShare: 0.95, registered: 88 },
];

/** Simplified national outline, [lon, lat]. Stylised, not survey-accurate. */
export const OUTLINE: [number, number][] = [
  [3.6, 13.72], [4.5, 13.88], [6.0, 13.62], [7.8, 13.32], [9.0, 12.98],
  [10.5, 13.28], [12.0, 13.32], [13.1, 13.7], [14.0, 13.08], [14.22, 12.32],
  [14.62, 12.02], [14.48, 11.5], [13.6, 10.9], [13.28, 10.12], [12.92, 9.4],
  [12.62, 8.6], [12.22, 7.9], [11.62, 7.02], [11.1, 6.62], [10.6, 6.9],
  [10.0, 6.72], [9.5, 6.42], [8.92, 5.82], [8.82, 5.18], [8.5, 4.78],
  [7.8, 4.52], [7.0, 4.42], [6.4, 4.32], [5.6, 4.62], [5.4, 5.42],
  [5.0, 5.62], [4.6, 6.22], [4.0, 6.38], [3.4, 6.4], [2.78, 6.42],
  [2.7, 7.5], [2.82, 8.42], [3.6, 9.6], [3.5, 10.5], [4.0, 11.42],
  [3.62, 12.5],
];

/** Arcs between hubs and their regional neighbours — the "national network". */
export const ARCS: [string, string][] = [
  ["LA", "OG"], ["LA", "OY"], ["LA", "FC"], ["LA", "RI"], ["LA", "ED"],
  ["FC", "KD"], ["FC", "PL"], ["FC", "BE"], ["FC", "NI"], ["FC", "KN"],
  ["KN", "KT"], ["KN", "JI"], ["KN", "BA"], ["KD", "ZA"], ["KD", "KN"],
  ["RI", "AK"], ["RI", "IM"], ["RI", "DE"], ["EN", "AN"], ["FC", "EN"],
  ["KN", "SO"], ["FC", "KW"], ["BA", "GO"], ["BO", "YO"], ["AD", "TA"],
  ["FC", "BO"], ["LA", "KN"],
];

export const TOTAL_REGISTERED = STATES.reduce((n, s) => n + s.registered, 0);

/**
 * Equirectangular projection with a cos(lat) width correction, so Nigeria is
 * not stretched horizontally the way a naive lon->x mapping stretches it.
 */
export function project(
  lon: number,
  lat: number,
  w: number,
  h: number,
  pad = 46,
): [number, number] {
  const LON0 = 2.6, LON1 = 14.8, LAT0 = 4.1, LAT1 = 14.0;
  const latMid = (LAT0 + LAT1) / 2;
  const k = Math.cos((latMid * Math.PI) / 180);
  const spanX = (LON1 - LON0) * k;
  const spanY = LAT1 - LAT0;
  const iw = w - pad * 2, ih = h - pad * 2;
  const scale = Math.min(iw / spanX, ih / spanY);
  const offX = pad + (iw - spanX * scale) / 2;
  const offY = pad + (ih - spanY * scale) / 2;
  return [
    offX + (lon - LON0) * k * scale,
    offY + (LAT1 - lat) * scale,
  ];
}

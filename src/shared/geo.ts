/**
 * Country geography lookup — ISO-3166-1 alpha-2 → display name, flag emoji, and
 * an approximate centroid (lat/lng) used to plot "shipping origin" markers on the
 * globe. Shared by the renderer (globe + country table) and the main process
 * (local-estimate synthesis). No runtime/Node/DOM dependencies.
 */

export interface CountryGeo {
  /** ISO-3166-1 alpha-2, uppercase. */
  code: string
  name: string
  /** Regional-indicator flag emoji. */
  flag: string
  /** Centroid latitude in degrees (−90..90). */
  lat: number
  /** Centroid longitude in degrees (−180..180). */
  lng: number
}

/** Centroid table for the countries we surface on the shipping globe. */
export const COUNTRY_GEO: Record<string, CountryGeo> = {
  US: { code: 'US', name: 'United States', flag: '🇺🇸', lat: 39.8, lng: -98.6 },
  IN: { code: 'IN', name: 'India', flag: '🇮🇳', lat: 22.0, lng: 79.0 },
  GB: { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', lat: 54.0, lng: -2.0 },
  DE: { code: 'DE', name: 'Germany', flag: '🇩🇪', lat: 51.0, lng: 10.0 },
  CA: { code: 'CA', name: 'Canada', flag: '🇨🇦', lat: 56.0, lng: -106.0 },
  BR: { code: 'BR', name: 'Brazil', flag: '🇧🇷', lat: -10.0, lng: -52.0 },
  JP: { code: 'JP', name: 'Japan', flag: '🇯🇵', lat: 36.0, lng: 138.0 },
  FR: { code: 'FR', name: 'France', flag: '🇫🇷', lat: 46.0, lng: 2.0 },
  AU: { code: 'AU', name: 'Australia', flag: '🇦🇺', lat: -25.0, lng: 133.0 },
  NG: { code: 'NG', name: 'Nigeria', flag: '🇳🇬', lat: 9.0, lng: 8.0 },
  CN: { code: 'CN', name: 'China', flag: '🇨🇳', lat: 35.0, lng: 103.0 },
  RU: { code: 'RU', name: 'Russia', flag: '🇷🇺', lat: 61.0, lng: 90.0 },
  SG: { code: 'SG', name: 'Singapore', flag: '🇸🇬', lat: 1.35, lng: 103.8 },
  NL: { code: 'NL', name: 'Netherlands', flag: '🇳🇱', lat: 52.2, lng: 5.3 },
  SE: { code: 'SE', name: 'Sweden', flag: '🇸🇪', lat: 62.0, lng: 15.0 },
  PL: { code: 'PL', name: 'Poland', flag: '🇵🇱', lat: 52.0, lng: 19.0 },
  UA: { code: 'UA', name: 'Ukraine', flag: '🇺🇦', lat: 49.0, lng: 32.0 },
  ES: { code: 'ES', name: 'Spain', flag: '🇪🇸', lat: 40.0, lng: -3.7 },
  IT: { code: 'IT', name: 'Italy', flag: '🇮🇹', lat: 42.8, lng: 12.8 },
  KR: { code: 'KR', name: 'South Korea', flag: '🇰🇷', lat: 36.5, lng: 127.8 },
  ID: { code: 'ID', name: 'Indonesia', flag: '🇮🇩', lat: -2.5, lng: 118.0 },
  PK: { code: 'PK', name: 'Pakistan', flag: '🇵🇰', lat: 30.0, lng: 70.0 },
  BD: { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', lat: 24.0, lng: 90.0 },
  VN: { code: 'VN', name: 'Vietnam', flag: '🇻🇳', lat: 16.0, lng: 108.0 },
  PH: { code: 'PH', name: 'Philippines', flag: '🇵🇭', lat: 13.0, lng: 122.0 },
  TR: { code: 'TR', name: 'Türkiye', flag: '🇹🇷', lat: 39.0, lng: 35.0 },
  MX: { code: 'MX', name: 'Mexico', flag: '🇲🇽', lat: 23.0, lng: -102.0 },
  AR: { code: 'AR', name: 'Argentina', flag: '🇦🇷', lat: -34.0, lng: -64.0 },
  CO: { code: 'CO', name: 'Colombia', flag: '🇨🇴', lat: 4.0, lng: -73.0 },
  CL: { code: 'CL', name: 'Chile', flag: '🇨🇱', lat: -33.0, lng: -71.0 },
  ZA: { code: 'ZA', name: 'South Africa', flag: '🇿🇦', lat: -29.0, lng: 24.0 },
  EG: { code: 'EG', name: 'Egypt', flag: '🇪🇬', lat: 27.0, lng: 30.0 },
  KE: { code: 'KE', name: 'Kenya', flag: '🇰🇪', lat: 0.0, lng: 38.0 },
  IL: { code: 'IL', name: 'Israel', flag: '🇮🇱', lat: 31.0, lng: 35.0 },
  AE: { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', lat: 24.0, lng: 54.0 },
  SA: { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', lat: 24.0, lng: 45.0 },
  IE: { code: 'IE', name: 'Ireland', flag: '🇮🇪', lat: 53.0, lng: -8.0 },
  CH: { code: 'CH', name: 'Switzerland', flag: '🇨🇭', lat: 47.0, lng: 8.0 },
  AT: { code: 'AT', name: 'Austria', flag: '🇦🇹', lat: 47.5, lng: 14.5 },
  BE: { code: 'BE', name: 'Belgium', flag: '🇧🇪', lat: 50.6, lng: 4.7 },
  PT: { code: 'PT', name: 'Portugal', flag: '🇵🇹', lat: 39.5, lng: -8.0 },
  NO: { code: 'NO', name: 'Norway', flag: '🇳🇴', lat: 62.0, lng: 10.0 },
  FI: { code: 'FI', name: 'Finland', flag: '🇫🇮', lat: 64.0, lng: 26.0 },
  DK: { code: 'DK', name: 'Denmark', flag: '🇩🇰', lat: 56.0, lng: 10.0 },
  CZ: { code: 'CZ', name: 'Czechia', flag: '🇨🇿', lat: 49.8, lng: 15.5 },
  RO: { code: 'RO', name: 'Romania', flag: '🇷🇴', lat: 46.0, lng: 25.0 },
  GR: { code: 'GR', name: 'Greece', flag: '🇬🇷', lat: 39.0, lng: 22.0 },
  NZ: { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', lat: -42.0, lng: 174.0 },
  TW: { code: 'TW', name: 'Taiwan', flag: '🇹🇼', lat: 23.7, lng: 121.0 },
  HK: { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', lat: 22.3, lng: 114.2 },
  TH: { code: 'TH', name: 'Thailand', flag: '🇹🇭', lat: 15.0, lng: 101.0 },
  MY: { code: 'MY', name: 'Malaysia', flag: '🇲🇾', lat: 4.2, lng: 102.0 }
}

const UNKNOWN: CountryGeo = { code: 'ZZ', name: 'Unknown', flag: '🏳️', lat: 0, lng: 0 }

/** Look up geo for a country code, falling back to a neutral "Unknown" entry. */
export function countryGeo(code: string | null | undefined): CountryGeo {
  if (!code) return UNKNOWN
  return COUNTRY_GEO[code.toUpperCase()] ?? { ...UNKNOWN, code: code.toUpperCase(), name: code.toUpperCase() }
}

/** Ordered list of supported country codes (stable for synthesis). */
export const COUNTRY_CODES: string[] = Object.keys(COUNTRY_GEO)

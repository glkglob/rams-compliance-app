/**
 * Met Office DataPoint weather integration.
 *
 * Fetches current-day observations for a UK location. Falls back gracefully
 * to a null result when:
 * - MET_OFFICE_DATAPOINT_KEY is not configured
 * - The API is unreachable
 * - The location cannot be resolved
 *
 * The caller (daily report route) treats weather data as optional enrichment —
 * the report can always be created without it.
 *
 * API docs: https://www.metoffice.gov.uk/services/data/datapoint
 */

import { logger } from '@/lib/logging';

const API_BASE = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0';

export interface WeatherData {
  temp_c: number | null;
  humidity: number | null;
  wind_mph: number | null;
  description: string;
  icon: string | null;
  source: 'met_office' | 'manual';
}

/**
 * Fetch current weather for a given latitude/longitude from the Met Office
 * Site Specific API. Returns null if the API key is missing or the call fails.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  const apiKey = process.env.MET_OFFICE_DATAPOINT_KEY;
  if (!apiKey) {
    logger.info('MET_OFFICE_DATAPOINT_KEY not configured — skipping weather fetch');
    return null;
  }

  try {
    const url = `${API_BASE}/point/hourly?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn('Met Office API returned non-OK status', {
        status: res.status,
        lat, lon,
      });
      return null;
    }

    const json = await res.json() as MetOfficeResponse;
    return parseMetOfficeResponse(json);
  } catch (err) {
    logger.warn('Met Office API call failed', {
      error: err instanceof Error ? err.message : String(err),
      lat, lon,
    });
    return null;
  }
}

/**
 * Look up weather by a UK postcode-like location string. Resolves the
 * postcode to lat/lon using a simple heuristic or the Postcodes.io API,
 * then fetches from Met Office.
 */
export async function fetchWeatherByLocation(
  location: string,
): Promise<WeatherData | null> {
  if (!process.env.MET_OFFICE_DATAPOINT_KEY) return null;
  if (!location.trim()) return null;

  try {
    // Try to resolve via postcodes.io (free, no key required)
    const clean = location.trim().replace(/\s+/g, '+');
    const geoRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (geoRes.ok) {
      const geoData = await geoRes.json() as {
        result?: { latitude: number; longitude: number };
      };
      if (geoData.result) {
        return fetchWeather(geoData.result.latitude, geoData.result.longitude);
      }
    }

    // Fallback: try as comma-separated lat,lon
    const parts = location.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return fetchWeather(parts[0], parts[1]);
    }

    logger.info('Could not resolve location for weather', { location });
    return null;
  } catch (err) {
    logger.warn('Weather location resolution failed', {
      location,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Build a manual weather entry (when the user types it in instead of
 * fetching from the API).
 */
export function manualWeather(summary: string): WeatherData {
  return {
    temp_c: null,
    humidity: null,
    wind_mph: null,
    description: summary,
    icon: null,
    source: 'manual',
  };
}

// ── Met Office response parsing ────────────────────────────────────────────────

interface MetOfficeResponse {
  features?: Array<{
    properties?: {
      timeSeries?: Array<{
        screenTemperature?: number;
        screenRelativeHumidity?: number;
        windSpeed10m?: number;
        significantWeatherCode?: number;
        time?: string;
      }>;
    };
  }>;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear night',
  1: 'Sunny day',
  2: 'Partly cloudy (night)',
  3: 'Partly cloudy (day)',
  5: 'Mist',
  6: 'Fog',
  7: 'Cloudy',
  8: 'Overcast',
  9: 'Light rain shower (night)',
  10: 'Light rain shower (day)',
  11: 'Drizzle',
  12: 'Light rain',
  13: 'Heavy rain shower (night)',
  14: 'Heavy rain shower (day)',
  15: 'Heavy rain',
  16: 'Sleet shower (night)',
  17: 'Sleet shower (day)',
  18: 'Sleet',
  19: 'Hail shower (night)',
  20: 'Hail shower (day)',
  21: 'Hail',
  22: 'Light snow shower (night)',
  23: 'Light snow shower (day)',
  24: 'Light snow',
  25: 'Heavy snow shower (night)',
  26: 'Heavy snow shower (day)',
  27: 'Heavy snow',
  28: 'Thunder shower (night)',
  29: 'Thunder shower (day)',
  30: 'Thunder',
};

function parseMetOfficeResponse(data: MetOfficeResponse): WeatherData | null {
  const timeSeries = data.features?.[0]?.properties?.timeSeries;
  if (!timeSeries?.length) return null;

  // Find the observation closest to the current hour
  const now = new Date();
  let closest = timeSeries[0];
  let bestDiff = Infinity;

  for (const entry of timeSeries) {
    if (!entry.time) continue;
    const diff = Math.abs(new Date(entry.time).getTime() - now.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = entry;
    }
  }

  const code = closest.significantWeatherCode ?? -1;
  const description = WEATHER_CODES[code] ?? 'Unknown';

  return {
    temp_c: closest.screenTemperature ?? null,
    humidity: closest.screenRelativeHumidity ?? null,
    wind_mph: closest.windSpeed10m != null
      ? Math.round(closest.windSpeed10m * 2.237) // m/s → mph
      : null,
    description,
    icon: null,
    source: 'met_office',
  };
}

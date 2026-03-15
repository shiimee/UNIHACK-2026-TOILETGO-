/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type { Review, Toilet };

import { Toilet, Review } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Generates a stable ID for a toilet based on its name and address.
 * This helps persist reviews even if the AI-generated ID changes.
 */
export function generateStableId(name: string, address: string): string {
  const str = `${name}-${address}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function fetchNearbyToilets(lat: number, lng: number): Promise<Toilet[]> {
  const prompt = `
    Act as a data scraper for the National Public Toilet Map (toiletmap.gov.au).
    Generate a list of 5 realistic public toilets near the coordinates: Latitude ${lat}, Longitude ${lng}.
    
    IMPORTANT: Be consistent. If you have generated toilets for these coordinates before, try to return the same ones with the same names and addresses.
    
    For each toilet, provide:
    1. Name of the toilet.
    2. Precise location (latitude and longitude).
    3. Access and usability details (e.g., wheelchair access, MLAK requirements).
    4. Opening hours and whether it's currently open (assume current time is Sat, 14 Mar 2026 08:22:11 GMT).
    5. Quality data (cleanliness, maintenance, safety scores).
    6. A final rating score out of 5 stars.
    7. Busyness data:
       - current: A percentage (0-100) representing how busy it is right now.
       - expectedWaitTime: Estimated wait time in minutes.
       - hourlyForecast: An array of 24 integers (0-100) representing expected busyness for each hour of the day (starting from midnight).
    8. A list of features/amenities as an array of strings. Use standard terms like: "Wheelchair Accessible", "Baby Change", "Shower", "MLAK Required", "Drinking Water", "Sanitary Disposal".
    
    Return the data in a structured JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              latitude: { type: Type.NUMBER },
              longitude: { type: Type.NUMBER },
              address: { type: Type.STRING },
              access: { type: Type.STRING },
              usability: { type: Type.STRING },
              openingHours: { type: Type.STRING },
              isOpenNow: { type: Type.BOOLEAN },
              quality: {
                type: Type.OBJECT,
                properties: {
                  cleanliness: { type: Type.NUMBER },
                  maintenance: { type: Type.NUMBER },
                  safety: { type: Type.NUMBER },
                },
                required: ["cleanliness", "maintenance", "safety"],
              },
              rating: { type: Type.NUMBER },
              busyness: {
                type: Type.OBJECT,
                properties: {
                  current: { type: Type.NUMBER },
                  expectedWaitTime: { type: Type.NUMBER },
                  hourlyForecast: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER }
                  }
                },
                required: ["current", "expectedWaitTime", "hourlyForecast"]
              },
              features: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["id", "name", "latitude", "longitude", "address", "access", "usability", "openingHours", "isOpenNow", "quality", "rating", "features", "busyness"],
          },
        },
      },
    });

    const toilets = JSON.parse(response.text || "[]") as Toilet[];
    
    // Calculate distance and generate stable IDs for each toilet
    const toiletsWithDistance = toilets.map(toilet => {
      const dist = calculateDistance(lat, lng, toilet.latitude, toilet.longitude);
      
      // Generate a stable ID based on name and address to ensure reviews persist
      // even if the AI generates a different random ID next time.
      const stableId = generateStableId(toilet.name, toilet.address);

      return {
        ...toilet,
        id: stableId,
        distance: dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`,
        distanceValue: dist // temporary property for sorting
      };
    });

    // Sort by distance
    return toiletsWithDistance
      .sort((a, b) => a.distanceValue - b.distanceValue)
      .map(({ distanceValue, ...rest }) => rest);
  } catch (error) {
    console.error("Error fetching toilets:", error);
    return [];
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

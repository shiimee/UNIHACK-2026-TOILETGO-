/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Review {
  id: string;
  rating: number;
  comment: string;
  isDirty: boolean;
  date: string;
  userName: string;
}

export interface Toilet {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  access: string; // e.g., "Public", "MLAK required"
  usability: string; // e.g., "Wheelchair accessible", "Ambulant"
  openingHours: string;
  isOpenNow: boolean;
  quality: {
    cleanliness: number; // 1-5
    maintenance: number; // 1-5
    safety: number; // 1-5
  };
  rating: number; // 1-5 stars
  distance?: string;
  features: string[]; // e.g., ["Wheelchair", "Baby Change", "Shower", "MLAK", "Drinking Water"]
  reviews?: Review[];
  busyness: {
    current: number; // 0-100
    expectedWaitTime: number; // minutes
    hourlyForecast: number[]; // 24 values for each hour
  };
}

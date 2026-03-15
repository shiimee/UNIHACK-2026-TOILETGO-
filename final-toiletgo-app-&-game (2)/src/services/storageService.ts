/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Review, Toilet } from '../types';

const REVIEWS_KEY = 'toiletgo_reviews_v1';
const TOILETS_KEY = 'toiletgo_toilets_v1';

interface StoredReviews {
  [toiletId: string]: Review[];
}

interface StoredToilets {
  [toiletId: string]: Toilet;
}

export function saveReview(toiletId: string, review: Review): void {
  const allReviews = getAllStoredReviews();
  if (!allReviews[toiletId]) {
    allReviews[toiletId] = [];
  }
  allReviews[toiletId].unshift(review);
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(allReviews));
  console.log(`Review saved for toilet ${toiletId}. Total reviews for this toilet: ${allReviews[toiletId].length}`);
}

export function saveToilet(toilet: Toilet): void {
  const allToilets = getAllStoredToilets();
  allToilets[toilet.id] = toilet;
  localStorage.setItem(TOILETS_KEY, JSON.stringify(allToilets));
}

export function getAllStoredToilets(): StoredToilets {
  const stored = localStorage.getItem(TOILETS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    return {};
  }
}

export function getReviewsForToilet(toiletId: string): Review[] {
  const allReviews = getAllStoredReviews();
  return allReviews[toiletId] || [];
}

export function getAllStoredReviews(): StoredReviews {
  const stored = localStorage.getItem(REVIEWS_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    console.log('Loaded stored reviews:', Object.keys(parsed).length, 'toilets have reviews');
    return parsed;
  } catch (e) {
    console.error('Failed to parse stored reviews', e);
    return {};
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, Star, User, Lock, ArrowRight, Droplets, 
  Navigation, Loader2, Clock, CheckCircle2, XCircle,
  Accessibility, Shield, Sparkles, ExternalLink, MessageSquare,
  AlertTriangle, Send, X, ThumbsUp, Moon, Sun, Camera, Play
} from 'lucide-react';
import { fetchNearbyToilets, Toilet, Review } from './services/toiletService';
import { analyzeCleanliness, CleanlinessAnalysis, rerateQualityFromReviews } from './services/geminiService';
import { saveReview, getAllStoredReviews, saveToilet, getAllStoredToilets } from './services/storageService';
import ToiletGoGame from '../toiletgo-game/src/App';

const DEFAULT_COORDS = { lat: -33.8688, lng: 151.2093 }; // Sydney CBD

export default function App() {
  const [view, setView] = useState<'APP' | 'GAME'>('APP');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('toiletgo-theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    console.log('Dark mode changed:', darkMode);
    localStorage.setItem('toiletgo-theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      console.log('Added dark class to html and body');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      console.log('Removed dark class from html and body');
    }
  }, [darkMode]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [toilets, setToilets] = useState<Toilet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);

  // Review Modal State
  const [selectedToiletForReview, setSelectedToiletForReview] = useState<Toilet | null>(null);
  const [viewingReviewsToilet, setViewingReviewsToilet] = useState<Toilet | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isDirtyFlag, setIsDirtyFlag] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CleanlinessAnalysis | null>(null);

  const filterOptions = [
    "Wheelchair Accessible",
    "Baby Change",
    "Shower",
    "MLAK Required",
    "Drinking Water",
    "Sanitary Disposal"
  ];

  const toggleFilter = (filter: string) => {
    setSelectedFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter) 
        : [...prev, filter]
    );
  };

  const filteredToilets = toilets.filter(toilet => {
    if (selectedFilters.length === 0) return true;
    return selectedFilters.every(filter => toilet.features.includes(filter));
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      setIsLoggedIn(true);
    }
  };

  const processToiletsWithReviews = async (toiletsList: Toilet[]) => {
    // Initial set to show data quickly
    setToilets(toiletsList);

    // Identify toilets that actually need rerating (have reviews)
    const needsRerating = toiletsList.filter(t => t.reviews && t.reviews.length > 0);
    
    if (needsRerating.length === 0) return;

    // Rerate in parallel
    const reratedToilets = await Promise.all(toiletsList.map(async (t) => {
      if (t.reviews && t.reviews.length > 0) {
        try {
          const newQuality = await rerateQualityFromReviews(t.reviews);
          const updated = { ...t, quality: newQuality };
          
          // Update viewing modal if it's open for this toilet
          if (viewingReviewsToilet?.id === t.id) {
            setViewingReviewsToilet(updated);
          }
          
          return updated;
        } catch (err) {
          console.error(`Failed to rerate quality for ${t.name}:`, err);
          return t;
        }
      }
      return t;
    }));

    setToilets(reratedToilets);
  };

  const handleLocationSuccess = async (latitude: number, longitude: number) => {
    setCurrentCoords({ lat: latitude, lng: longitude });
    
    try {
      // Fetch fresh results for the exact current location
      const data = await fetchNearbyToilets(latitude, longitude);
      const storedReviews = getAllStoredReviews();
      const storedToilets = getAllStoredToilets();
      
      const mergedToilets = data.map(t => {
        // Save newly fetched toilet to storage to keep it stable
        saveToilet(t);
        
        const localReviews = storedReviews[t.id] || [];
        const allReviews = [...localReviews];
        
        // Recalculate rating if there are local reviews
        let avgRating = t.rating;
        if (allReviews.length > 0) {
          const totalRating = allReviews.reduce((acc, r) => acc + r.rating, 0);
          avgRating = totalRating / allReviews.length;
        }

        return { ...t, reviews: allReviews, rating: avgRating };
      });

      // Also add any stored toilets that have reviews but weren't in the fresh fetch
      const fetchedIds = new Set(data.map(t => t.id));
      Object.values(storedToilets).forEach(st => {
        if (!fetchedIds.has(st.id) && storedReviews[st.id]) {
          const localReviews = storedReviews[st.id] || [];
          const totalRating = localReviews.reduce((acc, r) => acc + r.rating, 0);
          const avgRating = totalRating / localReviews.length;
          mergedToilets.push({ ...st, reviews: localReviews, rating: avgRating });
        }
      });

      await processToiletsWithReviews(mergedToilets);
    } catch (err) {
      setError("Failed to locate facilities. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const result = await analyzeCleanliness(base64, file.type);
          setAnalysisResult(result);
          
          if (!result.isRestroom) {
            setReviewComment("AI Warning: The uploaded image does not appear to be a restroom facility. Please upload a relevant photo.");
            setIsAnalyzing(false);
            return;
          }
          
          // Auto-fill form
          // Gemini score is 1-10, we want 1-5
          setReviewRating(Math.max(1, Math.min(5, Math.ceil(result.score / 2))));
          
          let comment = result.summary;
          if (result.issues.length > 0) {
            comment += "\n\nIssues observed: " + result.issues.join(", ");
          }
          if (result.positives.length > 0) {
            comment += "\n\nPositives: " + result.positives.join(", ");
          }
          comment += `\n\nRecommendation: ${result.recommendation}`;
          
          setReviewComment(comment);
          
          if (result.recommendation === 'avoid' || result.score < 4) {
            setIsDirtyFlag(true);
          }
        } catch (err) {
          console.error("Analysis failed:", err);
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File reading failed:", error);
      setIsAnalyzing(false);
    }
  };

  const submitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToiletForReview) return;

    const newReview: Review = {
      id: Math.random().toString(36).substr(2, 9),
      rating: reviewRating,
      comment: reviewComment,
      isDirty: isDirtyFlag,
      date: new Date().toLocaleDateString(),
      userName: email.split('@')[0] || 'User'
    };

    // Save to local storage
    saveReview(selectedToiletForReview.id, newReview);

    const updatedToilets = toilets.map(t => {
      if (t.id === selectedToiletForReview.id) {
        const updatedReviews = [newReview, ...(t.reviews || [])];
        // Recalculate average rating
        const totalRating = updatedReviews.reduce((acc, r) => acc + r.rating, 0);
        const newAvgRating = totalRating / updatedReviews.length;
        const updatedToilet = { ...t, reviews: updatedReviews, rating: newAvgRating };
        
        // Update viewing modal immediately
        if (viewingReviewsToilet?.id === t.id) {
          setViewingReviewsToilet(updatedToilet);
        }
        
        return updatedToilet;
      }
      return t;
    });

    // Process with quality rerating
    processToiletsWithReviews(updatedToilets);

    // Reset and close
    closeReviewModal();
  };

  const closeReviewModal = () => {
    setSelectedToiletForReview(null);
    setReviewRating(5);
    setReviewComment('');
    setIsDirtyFlag(false);
    setAnalysisResult(null);
    setIsAnalyzing(false);
  };

  const refreshLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationWarning(null);
        await handleLocationSuccess(latitude, longitude);
      },
      async (err) => {
        console.warn("Geolocation error, using fallback:", err);
        let msg = "Location access denied. Using default location (Sydney CBD).";
        if (err.code === err.TIMEOUT) {
          msg = "Location request timed out. Using default location (Sydney CBD).";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "Location information is unavailable. Using default location (Sydney CBD).";
        }
        setLocationWarning(msg);
        await handleLocationSuccess(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng);
      },
      options
    );
  };

  useEffect(() => {
    if (isLoggedIn) {
      refreshLocation();
    }
  }, [isLoggedIn]);

  if (view === 'GAME') {
    return (
      <div className="relative min-h-screen bg-slate-950">
        <button 
          onClick={() => setView('APP')}
          className="absolute top-6 left-6 z-[60] px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md border border-white/10 transition-all font-bold text-sm flex items-center gap-2"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Back to ToiletGo
        </button>
        <ToiletGoGame />
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors duration-300">
          {/* Header */}
          <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-6 h-6 text-emerald-600" />
                <span className="text-xl font-bold tracking-tight">ToiletGo</span>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('GAME')}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-slate-950 rounded-xl font-bold text-xs transition-all shadow-sm shadow-sky-500/20"
                >
                  <Play className="w-3 h-3 fill-current" />
                  PLAY GAME
                </button>
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center gap-2"
                  title="Toggle Dark Mode"
                >
                  {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  <span className="text-[10px] font-bold uppercase tracking-tighter opacity-50">{darkMode ? 'Dark' : 'Light'}</span>
                </button>
                <button 
                  onClick={() => setIsLoggedIn(false)}
                  className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight">Nearby Facilities</h1>
                <button 
                  onClick={refreshLocation}
                  disabled={loading}
                  className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all disabled:opacity-50"
                  title="Refresh Location"
                >
                  <Navigation className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-stone-500">Based on your current location • Data from National Public Toilet Map</p>
            </div>
          </div>

          {locationWarning && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-2xl flex items-center gap-3 text-amber-800 dark:text-amber-200 text-sm font-medium">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p>{locationWarning}</p>
              <button 
                onClick={() => setLocationWarning(null)}
                className="ml-auto p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filter Bar */}
          {!loading && !error && toilets.length > 0 && (
            <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex gap-2 min-w-max">
                <span className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-stone-400 uppercase tracking-widest">
                  Filter by:
                </span>
                {filterOptions.map(filter => (
                  <button
                    key={filter}
                    onClick={() => toggleFilter(filter)}
                    className={`
                      px-4 py-2 rounded-full text-xs font-bold transition-all border
                      ${selectedFilters.includes(filter) 
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20' 
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-700'}
                    `}
                  >
                    {filter}
                  </button>
                ))}
                {selectedFilters.length > 0 && (
                  <button
                    onClick={() => setSelectedFilters([])}
                    className="px-4 py-2 rounded-full text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
              <p className="text-stone-500 dark:text-stone-400 animate-pulse">Scanning for nearby comfort stations...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-2xl p-8 text-center max-w-md mx-auto">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">Access Denied</h3>
              <p className="text-red-700 dark:text-red-300 mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : toilets.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl">
              <MapPin className="w-12 h-12 text-stone-200 dark:text-stone-800 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-2">No facilities found nearby</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">We couldn't find any public restrooms in your immediate area.</p>
              <button 
                onClick={refreshLocation}
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-2 mx-auto"
              >
                <Navigation className="w-4 h-4" />
                Try refreshing location
              </button>
            </div>
          ) : filteredToilets.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl">
              <Sparkles className="w-12 h-12 text-stone-200 dark:text-stone-800 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-2">No facilities match your filters</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">Try removing some filters to see more results.</p>
              <button 
                onClick={() => setSelectedFilters([])}
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredToilets.map((toilet, index) => (
                <motion.div
                  key={toilet.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-stone-200/50 dark:hover:shadow-none transition-all group"
                >
                  <div className="p-6 md:p-8 grid md:grid-cols-[1fr_auto] gap-8">
                    <div className="space-y-6">
                      {/* Basic Info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold text-stone-900 dark:text-white">{toilet.name}</h2>
                          {toilet.isOpenNow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                              <CheckCircle2 className="w-3 h-3" /> Open Now
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 uppercase tracking-wider">
                              <XCircle className="w-3 h-3" /> Closed
                            </span>
                          )}
                        </div>
                        <p className="text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" /> {toilet.address}
                          {toilet.distance && (
                            <span className="ml-2 px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-md text-[10px] font-bold tracking-wide">
                              {toilet.distance} AWAY
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Features Badges */}
                      <div className="flex flex-wrap gap-2">
                        {toilet.features.map(feature => (
                          <span 
                            key={feature}
                            className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-100 dark:border-emerald-900/30"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>

                      {/* Details Grid */}
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                            <Accessibility className="w-3 h-3" /> Access & Usability
                          </label>
                          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{toilet.access} • {toilet.usability}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> Opening Hours
                          </label>
                          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{toilet.openingHours}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3" /> Quality Data
                          </label>
                          <div className="flex gap-4 text-xs font-medium text-stone-600 dark:text-stone-400">
                            <span title="Cleanliness">🧽 {toilet.quality.cleanliness}/5</span>
                            <span title="Maintenance">🔧 {toilet.quality.maintenance}/5</span>
                            <span title="Safety">🛡️ {toilet.quality.safety}/5</span>
                          </div>
                        </div>
                      </div>

                      {/* Reviews Section */}
                      {toilet.reviews && toilet.reviews.length > 0 && (
                        <div className="pt-6 border-t border-stone-100 dark:border-stone-800">
                          <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Recent Reviews
                          </h3>
                          <div className="space-y-4">
                            {toilet.reviews.slice(0, 2).map(review => (
                              <div key={review.id} className="bg-stone-50 dark:bg-stone-800/50 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                    <div className="flex text-yellow-500">
                                      {[...Array(5)].map((_, i) => (
                                        <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-stone-200 dark:text-stone-700'}`} />
                                      ))}
                                    </div>
                                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">{review.userName}</span>
                                  </div>
                                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">{review.date}</span>
                                </div>
                                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">{review.comment}</p>
                                {review.isDirty && (
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                                    <AlertTriangle className="w-3 h-3" /> Flagged as Dirty
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Rating & Actions */}
                    <div className="flex flex-col justify-between items-end gap-6 border-t md:border-t-0 md:border-l border-stone-100 dark:border-stone-800 pt-6 md:pt-0 md:pl-8">
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 text-yellow-500 mb-1">
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-5 h-5 ${i < Math.floor(toilet.rating) ? 'fill-current' : 'text-stone-200 dark:text-stone-700'}`} 
                            />
                          ))}
                        </div>
                        <p className="text-sm font-bold text-stone-900 dark:text-white">{toilet.rating.toFixed(1)} / 5.0 Rating</p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 font-medium mt-1">{toilet.reviews?.length || 0} reviews</p>
                      </div>
                      
                      <div className="flex flex-col gap-3 w-full md:w-auto">
                        <button 
                          onClick={() => setViewingReviewsToilet(toilet)}
                          className="inline-flex items-center justify-center gap-2 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 px-6 py-3 rounded-xl font-semibold hover:bg-stone-50 dark:hover:bg-stone-700 transition-all shadow-sm"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Show Reviews
                        </button>
                        <button 
                          onClick={() => setSelectedToiletForReview(toilet)}
                          className="inline-flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-6 py-3 rounded-xl font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all shadow-sm"
                        >
                          <Send className="w-4 h-4" />
                          Write Review
                        </button>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${toilet.name}, ${toilet.address}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 bg-stone-900 dark:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-600 dark:hover:bg-emerald-500 transition-all group shadow-lg shadow-stone-900/10"
                        >
                          Get Directions
                          <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}


        </main>

        {/* Review Modal */}
        <AnimatePresence>
          {selectedToiletForReview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-stone-900 dark:text-white">Review Facility</h2>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{selectedToiletForReview.name}</p>
                  </div>
                  <button 
                    onClick={closeReviewModal}
                    className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-stone-400" />
                  </button>
                </div>

                <form onSubmit={submitReview} className="p-6 space-y-6">
                  {/* AI Analysis Option */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 dark:bg-emerald-900/50 p-2 rounded-lg">
                          <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">AI Cleanliness Check</p>
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Take a photo for instant analysis.</p>
                        </div>
                      </div>
                      <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl transition-colors shadow-sm">
                        <Camera className="w-5 h-5" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment"
                          className="hidden" 
                          onChange={handleImageUpload}
                          disabled={isAnalyzing}
                        />
                      </label>
                    </div>

                    {isAnalyzing && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Analyzing restroom cleanliness...
                      </div>
                    )}

                    {analysisResult && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-2 border-t border-emerald-100 dark:border-emerald-900/50 space-y-2"
                      >
                        {!analysisResult.isRestroom ? (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertTriangle className="w-4 h-4" />
                            <p className="text-[11px] font-bold uppercase">Invalid Image Detected</p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">AI Score: {analysisResult.score}/10</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              analysisResult.recommendation === 'safe to use' ? 'bg-green-100 text-green-700' :
                              analysisResult.recommendation === 'use with caution' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {analysisResult.recommendation}
                            </span>
                          </div>
                        )}
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-200 italic">"{analysisResult.summary}"</p>
                      </motion.div>
                    )}
                  </div>

                  {/* Star Rating */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-stone-700 dark:text-stone-300">How clean was it?</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="focus:outline-none transition-transform active:scale-90"
                        >
                          <Star 
                            className={`w-8 h-8 ${star <= reviewRating ? 'fill-yellow-400 text-yellow-400' : 'text-stone-200 dark:text-stone-700'}`} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-stone-700 dark:text-stone-300">Your Experience</label>
                    <textarea
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Tell others about the cleanliness, accessibility, or any tips..."
                      className="w-full px-4 py-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all min-h-[120px] text-sm resize-none placeholder:text-stone-400"
                    />
                  </div>

                  {/* Dirty Flag */}
                  <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-100 dark:border-red-900/50">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-900 dark:text-red-100">Flag as Dirty?</p>
                        <p className="text-[10px] text-red-700 dark:text-red-400">This will alert other users immediately.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDirtyFlag(!isDirtyFlag)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${isDirtyFlag ? 'bg-red-600' : 'bg-stone-200 dark:bg-stone-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isDirtyFlag ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isAnalyzing || (analysisResult !== null && !analysisResult.isRestroom)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 group"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Submit Review
                        <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* All Reviews Modal */}
        <AnimatePresence>
          {viewingReviewsToilet && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-stone-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="text-xl font-bold text-stone-900 dark:text-white">All Reviews</h2>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{viewingReviewsToilet.name}</p>
                  </div>
                  <button 
                    onClick={() => setViewingReviewsToilet(null)}
                    className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-stone-400" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {viewingReviewsToilet.reviews && viewingReviewsToilet.reviews.length > 0 ? (
                    <div className="space-y-6">
                      {viewingReviewsToilet.reviews.map(review => (
                        <div key={review.id} className="bg-stone-50 dark:bg-stone-800/50 rounded-2xl p-6 space-y-3 border border-stone-100 dark:border-stone-800">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                                {review.userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-stone-900 dark:text-white">{review.userName}</p>
                                <div className="flex text-yellow-500 mt-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-stone-200 dark:text-stone-700'}`} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">{review.date}</span>
                          </div>
                          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed pl-13">{review.comment}</p>
                          {review.isDirty && (
                            <div className="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider pl-13">
                              <AlertTriangle className="w-3 h-3" /> Flagged as Dirty
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 text-stone-200 dark:text-stone-800 mx-auto mb-4" />
                      <p className="text-stone-500 dark:text-stone-400">No reviews yet for this facility.</p>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-stone-100 dark:border-stone-800 shrink-0">
                  <button
                    onClick={() => {
                      setViewingReviewsToilet(null);
                      setSelectedToiletForReview(viewingReviewsToilet);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Write a Review
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-stone-950 transition-colors duration-300 relative">
        <div className="absolute top-4 right-4 z-20">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm text-stone-600 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-2"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px] font-bold uppercase tracking-tighter opacity-50">{darkMode ? 'Dark' : 'Light'}</span>
          </button>
        </div>

        {/* Left Side: Branding & Visuals */}
        <div className="hidden lg:flex flex-col justify-between p-12 bg-emerald-600 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-12">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
              <Droplets className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight">ToiletGo</span>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-md"
          >
            <h2 className="text-5xl font-bold leading-tight mb-6">
              Find your comfort, anywhere.
            </h2>
            <p className="text-emerald-100 text-lg leading-relaxed">
              The world's most reliable community-driven guide to clean, accessible, and safe public restrooms.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-8">
          <div className="space-y-2">
            <div className="flex gap-1 text-yellow-400">
              <Star className="w-4 h-4 fill-current" />
              <Star className="w-4 h-4 fill-current" />
              <Star className="w-4 h-4 fill-current" />
              <Star className="w-4 h-4 fill-current" />
              <Star className="w-4 h-4 fill-current" />
            </div>
            <p className="text-sm text-emerald-100 italic">
              "Saved me during my trip to Tokyo! Cleanest spots only."
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
              — Sarah K.
            </p>
          </div>
        </div>

        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500 rounded-full -mr-48 -mt-48 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-700 rounded-full -ml-32 -mb-32 blur-3xl opacity-50" />
      </div>

      {/* Right Side: Login Form */}
      <div className="flex items-center justify-center p-8 lg:p-24">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-sm space-y-8"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Droplets className="w-6 h-6 text-emerald-600" />
            <span className="text-xl font-bold tracking-tight">ToiletGo</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">Sign In</h1>
            <p className="text-stone-500 dark:text-stone-400">Welcome back! Please enter your details.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-stone-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Password
                  </label>
                  <a href="#" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
                    Forgot?
                  </a>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-stone-400"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 group"
            >
              Sign In
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-100 dark:border-stone-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-stone-950 px-2 text-stone-400 font-medium">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-sm font-medium text-stone-700 dark:text-stone-300">
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Google
            </button>
            <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-sm font-medium text-stone-700 dark:text-stone-300">
              <img src="https://github.com/favicon.ico" className="w-4 h-4" alt="GitHub" />
              GitHub
            </button>
          </div>

          <p className="text-center text-sm text-stone-500">
            Don't have an account?{' '}
            <a href="#" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Sign up for free
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

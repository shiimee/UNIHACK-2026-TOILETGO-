import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface CleanlinessAnalysis {
  isRestroom: boolean;
  score: number;
  summary: string;
  issues: string[];
  positives: string[];
  recommendation: "safe to use" | "use with caution" | "avoid";
}

export interface QualityData {
  cleanliness: number;
  maintenance: number;
  safety: number;
}

const SYSTEM_PROMPT = `You are a restroom cleanliness inspector. When shown an image, first determine if it contains a restroom, toilet, urinal, sink area, or related facility.

If it IS a restroom-related image, evaluate its cleanliness and return a JSON response with:
- "isRestroom": true
- "score": integer from 1-10 (1 = filthy, 10 = spotless)
- "summary": one-sentence overall assessment
- "issues": list of specific cleanliness issues observed (empty if none)
- "positives": list of positive cleanliness observations
- "recommendation": "safe to use", "use with caution", or "avoid"

If it IS NOT a restroom-related image, return:
- "isRestroom": false
- "score": 0
- "summary": "This image does not appear to be a restroom or toilet facility."
- "issues": []
- "positives": []
- "recommendation": "avoid"

Be objective and focus on visible hygiene indicators: stains, debris, water marks, soap residue, toilet seat condition, floor cleanliness, and general maintenance.

Respond with ONLY valid JSON, no other text.`;

export async function analyzeCleanliness(base64Image: string, mimeType: string): Promise<CleanlinessAnalysis> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              data: base64Image.split(',')[1] || base64Image,
              mimeType: mimeType
            }
          },
          { text: "Analyze this image for restroom cleanliness." }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isRestroom: { type: Type.BOOLEAN },
          score: { type: Type.INTEGER },
          summary: { type: Type.STRING },
          issues: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          positives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommendation: {
            type: Type.STRING,
            enum: ["safe to use", "use with caution", "avoid"],
          },
        },
        required: ["isRestroom", "score", "summary", "issues", "positives", "recommendation"],
      },
    },
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text) as CleanlinessAnalysis;
}

export async function rerateQualityFromReviews(reviews: { comment: string, rating: number }[]): Promise<QualityData> {
  if (reviews.length === 0) return { cleanliness: 3, maintenance: 3, safety: 3 };

  const reviewText = reviews.map(r => `Rating: ${r.rating}/5, Comment: ${r.comment}`).join('\n---\n');
  
  const prompt = `
    Analyze the following user reviews for a public toilet and provide updated quality scores for Cleanliness, Maintenance, and Safety.
    Each score should be an integer from 1 to 5.
    
    Reviews:
    ${reviewText}
    
    If reviews are contradictory, use your best judgment based on the recency (if implied) or frequency of mentions.
    If a category isn't mentioned, provide a neutral score of 3 or base it on the overall sentiment of the reviews.
    
    Return ONLY valid JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cleanliness: { type: Type.INTEGER, description: "1-5 score for cleanliness" },
          maintenance: { type: Type.INTEGER, description: "1-5 score for maintenance" },
          safety: { type: Type.INTEGER, description: "1-5 score for safety" },
        },
        required: ["cleanliness", "maintenance", "safety"],
      },
    },
  });

  if (!response.text) {
    return { cleanliness: 3, maintenance: 3, safety: 3 };
  }

  return JSON.parse(response.text) as QualityData;
}

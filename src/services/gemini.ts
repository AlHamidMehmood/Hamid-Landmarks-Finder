import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface LandmarkInfo {
  name: string;
  location: string;
  history: string;
  interestingFacts: string[];
  narrationScript: string;
}

export async function processLandmark(base64Image: string): Promise<LandmarkInfo> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze this image to identify the city landmark. 
    Use Google Search to fetch accurate and detailed historical information, location, and interesting facts.
    Also, write a short, engaging 20-30 second narration script as if a tour guide is speaking.
    Return the response as a JSON object with the following structure:
    {
      "name": "Landmark Name",
      "location": "City, Country",
      "history": "Detailed history (Markdown allowed)",
      "interestingFacts": ["fact 1", "fact 2"],
      "narrationScript": "Tour guide script text"
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64Image } },
        { text: prompt }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          history: { type: Type.STRING },
          interestingFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          narrationScript: { type: Type.STRING }
        },
        required: ["name", "location", "history", "interestingFacts", "narrationScript"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Failed to get response from Gemini");
  }

  return JSON.parse(response.text.trim()) as LandmarkInfo;
}

export async function generateNarrationAudio(text: string): Promise<string> {
  const model = "gemini-3.1-flash-tts-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: `Say in a professional, warm city tour guide voice: ${text}` }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Puck" } // Friendly narrator
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("Failed to generate audio");
  }

  return `data:audio/wav;base64,${base64Audio}`;
}

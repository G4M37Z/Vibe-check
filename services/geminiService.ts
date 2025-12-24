
import { GoogleGenAI, Type } from "@google/genai";

// Guideline: Use process.env.API_KEY directly.
// Guideline: Create a new GoogleGenAI instance right before making an API call 
// to ensure it always uses the most up-to-date API key.

export async function analyzeMessageVibe(content: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following anonymous message and provide a 'vibe' (one emoji and one word) and a short 'insight' (max 20 words) about the sender's likely intent or mood. Format as JSON.
      Message: "${content}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emoji: { type: Type.STRING },
            mood: { type: Type.STRING },
            insight: { type: Type.STRING }
          },
          required: ["emoji", "mood", "insight"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Vibe Analysis Error:", error);
    return { emoji: "🤔", mood: "Unknown", insight: "Gemini couldn't read the room this time." };
  }
}

export async function generateWittyReplies(content: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The following is an anonymous question: "${content}". 
      Generate 3 short, witty, and engaging replies that I could post on my Instagram story.
      Keep them short and trendy. Format as JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Reply Generation Error:", error);
    return ["I have no words lol", "Mystery sender strikes again!", "Wait what? 😂"];
  }
}

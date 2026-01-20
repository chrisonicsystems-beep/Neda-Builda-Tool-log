
import { GoogleGenAI } from "@google/genai";
import { Tool } from "../types";

// Analyze tools using the text-focused model
export const analyzeTools = async (tools: Tool[], query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const toolSummary = tools.map(t => ({
    name: t.name,
    status: t.status,
    category: t.category,
    holder: t.currentHolderName || 'None',
    site: t.currentSite || 'Warehouse',
    lastAction: t.logs.length > 0 ? new Date(t.logs[t.logs.length-1].timestamp).toLocaleDateString() : 'N/A'
  }));

  const prompt = `
    You are Pulse, an intelligent construction equipment coordinator.
    
    Inventory Data:
    ${JSON.stringify(toolSummary, null, 2)}

    Current User Query: "${query}"

    Instructions:
    1. Be professional, concise, and helpful.
    2. STRICT RELEVANCE: Only provide information directly related to the items or equipment categories mentioned in the user query.
    3. NO UNRELATED ADVICE: If an item is unavailable, do NOT list unrelated available equipment (e.g., don't suggest drills if they asked for generators).
    4. ALTERNATIVES: You may suggest logical alternatives ONLY if they are within the same functional category (e.g., suggesting a different sized generator).
    5. MAINTENANCE INSIGHTS: If relevant to the specific item asked about, mention its health or repair status.
    6. Formulate your response as a direct answer followed by a brief "Maintenance Insight" or "Pulse Alert" if critical.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Sorry, I couldn't analyze the data right now.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "The AI assistant is currently unavailable.";
  }
};

// Search for addresses using Google Maps grounding
export const searchAddresses = async (query: string): Promise<string[]> => {
  if (!query || query.trim().length < 3) return [];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find 5 precise real-world street addresses or project locations in New Zealand (e.g. "123 Queen Street, Auckland") matching the prefix: "${query}". Return ONLY the list of addresses, one per line. Do not include any introductory text, numbers, or bullet points.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    // Robust cleaning: remove Markdown list markers, numbered list prefixes, and trim whitespace
    return text
      .split('\n')
      .map(line => line.replace(/^[\*\-\d\.]+\s*/, '').trim())
      .filter(line => line.length > 8); // Ensure it looks like a reasonably long address
  } catch (error) {
    console.error("Address Search Error:", error);
    return [];
  }
};
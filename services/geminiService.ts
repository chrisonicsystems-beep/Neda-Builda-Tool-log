
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
    3. NO UNRELATED ADVICE: If an item is unavailable, do NOT list unrelated available equipment.
    4. MAINTENANCE INSIGHTS: If relevant to the specific item asked about, mention its health or repair status.
    5. Formulate your response as a direct answer followed by a brief "Maintenance Insight" or "Pulse Alert" if critical.
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
export const searchAddresses = async (
  query: string, 
  coords?: { latitude: number; longitude: number }
): Promise<string[]> => {
  if (!query || query.trim().length < 2) return [];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Search Google Maps for current, real street addresses in New Zealand matching: "${query}".
      Focus on providing full street addresses with house numbers.
      Return exactly 5 unique full addresses as a simple list.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: coords ? {
          retrievalConfig: {
            latLng: {
              latitude: coords.latitude,
              longitude: coords.longitude
            }
          }
        } : undefined
      },
    });

    // Strategy 1: Extract from Grounding Metadata (Most reliable for Maps tool)
    const groundingAddresses: string[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[] | undefined;
    
    if (chunks && chunks.length > 0) {
      chunks.forEach(chunk => {
        const title = chunk.maps?.title || chunk.web?.title;
        const address = chunk.maps?.address;
        
        if (title && typeof title === 'string' && title.length > 5) {
          groundingAddresses.push(title);
        }
        if (address && typeof address === 'string' && address.length > 5) {
          groundingAddresses.push(address);
        }
      });
    }

    // Strategy 2: Parse text output
    const text = response.text || "";
    const lines = text.split('\n')
      .map(line => {
        // Strip common list markers but keep digits for house numbers
        let cleaned = line.replace(/^(\d+[\.\)]|[\*\-\•])\s+/, '').trim();
        cleaned = cleaned.replace(/[.,;]$/, '').trim();
        return cleaned;
      })
      .filter(line => line.length > 8 && line.includes(' '));

    // Combine and deduplicate
    const allFound = [...groundingAddresses, ...lines];
    const uniqueAddresses = Array.from(new Set(allFound));

    // Prioritize addresses that contain parts of the search query
    const queryParts = query.toLowerCase().split(' ').filter(p => p.length > 1);
    const sorted = uniqueAddresses.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aMatches = queryParts.filter(p => aLower.includes(p)).length;
      const bMatches = queryParts.filter(p => bLower.includes(p)).length;
      return bMatches - aMatches;
    });

    return sorted.slice(0, 5);
  } catch (error) {
    console.error("Address Search API Error:", error);
    return [];
  }
};

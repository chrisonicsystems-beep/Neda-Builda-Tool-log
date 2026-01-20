
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
export const searchAddresses = async (query: string): Promise<string[]> => {
  if (!query || query.trim().length < 3) return [];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    // We use gemini-2.5-flash as it supports googleMaps grounding
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Act as a high-precision New Zealand address locator. 
      Find real street addresses in New Zealand that strictly start with or are highly relevant to the prefix: "${query}".
      Focus on active construction sites, residential, or commercial areas.
      Return exactly 5 unique full addresses.
      Format: Plain text only, one address per line. No bullets, no numbers, no markdown formatting, no introductory text.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    
    // resilient parsing for lines
    const lines = text.split('\n');
    const addresses = lines
      .map(line => {
        // Strip out common list artifacts (dots, numbers, dashes, asterisks)
        let cleaned = line.replace(/^[\*\-\s\d\.\)]+/, '').trim();
        // Remove trailing punctuation
        cleaned = cleaned.replace(/[.,;]$/, '').trim();
        return cleaned;
      })
      .filter(line => {
        // Ensure it's a substantive string and looks like an address (usually has a space for number/street)
        return line.length > 8 && line.includes(' ');
      });

    if (addresses.length > 0) {
      // Return top 5, ensuring they are unique
      return Array.from(new Set(addresses)).slice(0, 5);
    }
    
    // Fallback: Check grounding metadata if direct text parsing yields nothing
    // Fix: Explicitly cast groundingChunks to any[] to avoid 'unknown[]' vs 'string[]' mismatch
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[] | undefined;
    if (chunks && chunks.length > 0) {
       const chunkAddresses = chunks
         .map((c: any) => c.maps?.title || c.web?.title)
         // Fix: Use type guard to ensure t is a string for the resulting array
         .filter((t: any): t is string => typeof t === 'string' && t.length > 8)
         .slice(0, 5);
       if (chunkAddresses.length > 0) return Array.from(new Set(chunkAddresses));
    }
    
    return [];
  } catch (error) {
    console.error("Address Search API Error:", error);
    return [];
  }
};

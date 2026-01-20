
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
      contents: `Search for real-world street addresses in New Zealand that start with or match: "${query}". 
      Return a plain list of the 5 most likely full addresses. 
      Important: Return ONLY the address strings, one per line. No bullets, no numbers, no explanations.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    
    // Improved parsing to handle markdown, numbers, or extra text
    const lines = text.split('\n');
    const addresses = lines
      .map(line => {
        // Remove markdown bullets (*, -) and numbered list patterns (1., 1) )
        let cleaned = line.replace(/^[\*\-\s\d\.\)]+/, '').trim();
        // Remove any trailing punctuation if it looks like a list
        cleaned = cleaned.replace(/[,;]$/, '').trim();
        return cleaned;
      })
      .filter(line => {
        // NZ addresses are usually at least "number street, suburb, city" length
        return line.length > 10 && (line.toLowerCase().includes('nz') || line.toLowerCase().includes('new zealand') || line.split(',').length >= 2);
      });

    if (addresses.length > 0) return addresses.slice(0, 5);
    
    // If text parsing failed but we have grounding metadata, let's try to extract from there
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
       const chunkAddresses = chunks
         .map((c: any) => c.maps?.title || c.web?.title)
         .filter((t: string) => t && t.length > 10)
         .slice(0, 5);
       if (chunkAddresses.length > 0) return chunkAddresses;
    }
    
    throw new Error("No addresses parsed from model output.");
  } catch (error) {
    console.error("Address Search Error, trying fallback:", error);
    // If Maps tool fails or doesn't return useful data, try a basic model call as fallback
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `List 5 real street addresses in New Zealand starting with "${query}". 
        Be very specific. Format: text only, one full address per line. No numbers or bullets.`
      });
      return (fallbackResponse.text || "")
        .split('\n')
        .map(l => l.replace(/^[\*\-\s\d\.\)]+/, '').trim())
        .filter(l => l.length > 10);
    } catch {
      return [];
    }
  }
};

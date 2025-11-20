// src/utils/ragRetriever.ts
import { pipeline } from "@xenova/transformers";
import tutorialIndex from "@/data/tutorial/tutorialIndex.json";
import { TutorialSection, RetrievalResult } from "@/types";

// use node src/components/Scripts/embedTutorial.js to generate embeddings

let embedder: any = null;

// Initialize the embedding model (lazy loading)
async function getEmbedder() {
  if (!embedder) {
    console.log("🔄 Initializing embedding model...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("✅ Embedding model loaded");
  }
  return embedder;
}

// Compute cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Retrieve relevant sections based on a query
export async function retrieveRelevantSections(
  query: string,
  topK: number = 3,
  category?: "tutorial" | "about",
): Promise<RetrievalResult[]> {
  try {
    // Get the embedding model
    const model = await getEmbedder();

    // Embed the query
    const output = await model(query, { pooling: "mean", normalize: true });
    const queryEmbedding = Array.from(output.data) as number[];

    // Filter sections by category if specified
    let sections = tutorialIndex.sections as TutorialSection[];

    if (category) {
      sections = sections.filter((s) => s.category === category);
      console.log(
        `🔍 Filtering by category '${category}': ${sections.length} sections found`,
      );
    }

    // Calculate similarity scores for filtered sections
    const results = sections.map((section) => ({
      id: section.id,
      title: section.title,
      content: section.content,
      category: section.category,
      score: cosineSimilarity(queryEmbedding, section.embedding),
    }));

    // Sort by score (descending) and take top K
    results.sort((a, b) => b.score - a.score);

    const topResults = results.slice(0, topK);

    if (topResults.length > 0) {
      console.log(`📊 Top ${topResults.length} results:`);
      topResults.forEach((r, i) => {
        console.log(
          `  ${i + 1}. ${r.title} (score: ${r.score.toFixed(3)}, category: ${r.category || "none"})`,
        );
      });
    }

    return topResults;
  } catch (error) {
    console.error("❌ Error in retrieveRelevantSections:", error);
    return [];
  }
}

// Build context string from retrieved sections
export function buildContextString(
  results: RetrievalResult[],
  contextType: "tutorial" | "about" = "tutorial",
): string {
  if (results.length === 0) {
    return "";
  }

  const contextLabel =
    contextType === "tutorial"
      ? "iCharm Tutorial"
      : "4DVD Platform Information";

  let context = `Context from ${contextLabel}:\n\n`;

  results.forEach((result, index) => {
    context += `${index + 1}. ${result.title}\n${result.content}\n\n`;
  });

  return context;
}

// Check if query is tutorial-related
export function isTutorialQuery(query: string): boolean {
  const tutorialKeywords = [
    "tutorial",
    "button",
    "menu",
    "controls",
    "ui",
    "interface",
    "open",
    "navigate",
    "select",
    "click",
    "drag",
    "zoom",
    "rotate",
    "fullscreen",
    "chat",
    "settings",
    "calendar",
    "download",
    "visualization",
    "change",
    "adjust",
    "interact",
    "display",
  ];

  const lowerQuery = query.toLowerCase();
  const hits = tutorialKeywords.filter((keyword) =>
    lowerQuery.includes(keyword),
  ).length;

  if (lowerQuery.includes("tutorial")) {
    return true;
  }

  return hits >= 2;
}

// Check if query is about-page related
export function isAboutQuery(query: string): boolean {
  const aboutKeywords = [
    "about",
    "4dvd",
    "who created",
    "who made",
    "who developed",
    "creator",
    "history",
    "origin",
    "background",
    "what is 4dvd",
    "license",
    "licensing",
    "citation",
    "cite",
    "reference",
    "paper",
    "data source",
    "noaa",
    "gpcp",
    "20cr",
    "reanalysis",
    "gpcc",
    "contact",
    "email",
    "phone",
    "address",
    "sdsu",
    "samuel shen",
    "julien pierret",
    "san diego state",
    "pierret",
    "gnu",
    "gpl",
    "open source",
    "github",
    "source code",
    "disclaimer",
    "warranty",
    "mission",
    "purpose",
    "developed at",
    "technology",
    "amazon",
    "aws",
    "cloud",
    "framework",
  ];

  const lowerQuery = query.toLowerCase();
  const hasAboutKeyword = aboutKeywords.some((keyword) =>
    lowerQuery.includes(keyword),
  );

  if (hasAboutKeyword) {
    console.log(
      `🎯 About query detected with keyword: ${aboutKeywords.find((k) => lowerQuery.includes(k))}`,
    );
  }

  return hasAboutKeyword;
}

// Determine query type and retrieve appropriate sections
export async function retrieveRelevantContext(
  query: string,
  topK: number = 3,
): Promise<{
  results: RetrievalResult[];
  contextType: "tutorial" | "about" | "general";
}> {
  console.log(`\n🔍 Query: "${query}"`);

  const isAbout = isAboutQuery(query);
  const isTutorial = isTutorialQuery(query);

  console.log(`📌 Detection: isAbout=${isAbout}, isTutorial=${isTutorial}`);

  // Prioritize about queries over tutorial if both match
  if (isAbout) {
    console.log("➜ Using ABOUT context");
    const results = await retrieveRelevantSections(query, topK, "about");
    return { results, contextType: "about" };
  } else if (isTutorial) {
    console.log("➜ Using TUTORIAL context");
    const results = await retrieveRelevantSections(query, topK, "tutorial");
    return { results, contextType: "tutorial" };
  } else {
    console.log("➜ Using GENERAL context (searching all sections)");
    // For general queries, search all sections
    const results = await retrieveRelevantSections(query, topK);
    return { results, contextType: "general" };
  }
}

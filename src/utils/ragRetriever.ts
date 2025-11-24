// src/utils/ragRetriever.ts
import { pipeline } from "@xenova/transformers";
import tutorialIndex from "@/data/tutorial/tutorialIndex.json";
import climateQuestionPlaybook from "@/data/playbooks/climateQuestionPlaybook";
import { TutorialSection, RetrievalResult } from "@/types";

// use node src/components/Scripts/embedTutorial.js to generate embeddings

let embedder: any = null;
let playbookSectionCache: TutorialSection[] | null = null;
let combinedSectionCache: TutorialSection[] | null = null;

// Initialize the embedding model (lazy loading)
async function getEmbedder() {
  if (!embedder) {
    console.log("🔄 Initializing embedding model...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("Embedding model loaded");
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

async function buildPlaybookSections(model: any): Promise<TutorialSection[]> {
  if (playbookSectionCache) {
    return playbookSectionCache;
  }

  const sections: TutorialSection[] = [];
  for (const entry of climateQuestionPlaybook) {
    const embeddingOutput = await model(entry.content, {
      pooling: "mean",
      normalize: true,
    });
    sections.push({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      category: entry.category ?? "analysis-playbook",
      embedding: Array.from(embeddingOutput.data) as number[],
    });
  }
  playbookSectionCache = sections;
  return sections;
}

async function getSectionPool(model: any): Promise<TutorialSection[]> {
  if (combinedSectionCache) {
    return combinedSectionCache;
  }
  const tutorialSections = tutorialIndex.sections as TutorialSection[];
  const playbookSections = await buildPlaybookSections(model);
  combinedSectionCache = [...tutorialSections, ...playbookSections];
  return combinedSectionCache;
}

// Retrieve relevant sections based on a query
export async function retrieveRelevantSections(
  query: string,
  topK: number = 3,
  category?: "tutorial" | "about" | "analysis-playbook",
): Promise<RetrievalResult[]> {
  try {
    // Get the embedding model
    const model = await getEmbedder();

    // Embed the query
    const output = await model(query, { pooling: "mean", normalize: true });
    const queryEmbedding = Array.from(output.data) as number[];

    // Load combined section pool (tutorial + playbook)
    let sections = await getSectionPool(model);

    // Filter sections by category if specified
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
  contextType: "tutorial" | "about" | "analysis" = "tutorial",
): string {
  if (results.length === 0) {
    return "";
  }

  const contextLabel =
    contextType === "tutorial"
      ? "iCharm Tutorial"
      : contextType === "about"
        ? "4DVD Platform Information"
        : "Climate Question Playbook";

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

function isAnalysisQuery(query: string): boolean {
  const analysisKeywords = [
    "temperature",
    "surface",
    "precipitation",
    "rain",
    "trend",
    "variance",
    "anomaly",
    "compare",
    "correlate",
    "lag",
    "forecast",
    "predict",
    "predictive",
    "drought",
    "heat wave",
    "heatwave",
    "cold snap",
    "marine heat",
    "enso",
    "monsoon",
    "itcz",
    "blocking",
    "extreme",
    "warming",
    "cooling",
    "climate change",
    "hemisphere",
    "arctic",
    "antarctica",
    "variance",
    "standard deviation",
    "percentile",
    "median",
  ];

  const lowerQuery = query.toLowerCase();
  let hits = 0;
  analysisKeywords.forEach((keyword) => {
    if (lowerQuery.includes(keyword)) {
      hits += keyword.includes(" ") ? 2 : 1;
    }
  });

  const mentionsCoordinates = /\b(lat|latitude|lon|longitude)\b/.test(
    lowerQuery,
  );
  return hits >= 2 || (hits >= 1 && mentionsCoordinates);
}

// Determine query type and retrieve appropriate sections
export async function retrieveRelevantContext(
  query: string,
  topK: number = 3,
): Promise<{
  results: RetrievalResult[];
  contextType: "tutorial" | "about" | "analysis" | "general";
}> {
  console.log(`\n🔍 Query: "${query}"`);

  const isAbout = isAboutQuery(query);
  const isTutorial = isTutorialQuery(query);
  const isAnalysis = isAnalysisQuery(query);

  console.log(
    `📌 Detection: isAbout=${isAbout}, isTutorial=${isTutorial}, isAnalysis=${isAnalysis}`,
  );

  // Prioritize about queries over tutorial if both match
  if (isAbout) {
    console.log("➜ Using ABOUT context");
    const results = await retrieveRelevantSections(query, topK, "about");
    return { results, contextType: "about" };
  } else if (isTutorial) {
    console.log("➜ Using TUTORIAL context");
    const results = await retrieveRelevantSections(query, topK, "tutorial");
    return { results, contextType: "tutorial" };
  } else if (isAnalysis) {
    console.log("➜ Using ANALYSIS context");
    const results = await retrieveRelevantSections(
      query,
      topK,
      "analysis-playbook",
    );
    return { results, contextType: "analysis" };
  } else {
    console.log("➜ Using GENERAL context (searching all sections)");
    // For general queries, search all sections
    const results = await retrieveRelevantSections(query, topK);
    return { results, contextType: "general" };
  }
}

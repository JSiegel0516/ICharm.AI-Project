// utils/ragRetriever.ts
import { pipeline } from '@xenova/transformers';
import tutorialIndex from '@/data/tutorial/tutorialIndex.json';

interface TutorialSection {
  id: string;
  title: string;
  content: string;
  embedding: number[];
}

interface RetrievalResult {
  id: string;
  title: string;
  content: string;
  score: number;
}

let embedder: any = null;

// Initialize the embedding model (lazy loading)
async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
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

// Retrieve relevant tutorial sections based on a query
export async function retrieveRelevantSections(
  query: string,
  topK: number = 3
): Promise<RetrievalResult[]> {
  try {
    // Get the embedding model
    const model = await getEmbedder();
    
    // Embed the query
    const output = await model(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data) as number[];
    
    // Calculate similarity scores for all sections
    const sections = tutorialIndex.sections as TutorialSection[];
    const results = sections.map(section => ({
      id: section.id,
      title: section.title,
      content: section.content,
      score: cosineSimilarity(queryEmbedding, section.embedding)
    }));
    
    // Sort by score (descending) and take top K
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, topK);
  } catch (error) {
    console.error('Error in retrieveRelevantSections:', error);
    return [];
  }
}

// Build context string from retrieved sections
export function buildContextString(results: RetrievalResult[]): string {
  if (results.length === 0) {
    return '';
  }
  
  let context = 'Context from iCharm Tutorial:\n\n';
  
  results.forEach((result, index) => {
    context += `${index + 1}. ${result.title}\n${result.content}\n\n`;
  });
  
  return context;
}

// Check if query is tutorial-related
export function isTutorialQuery(query: string): boolean {
  const tutorialKeywords = [
    'how to', 'how do i', 'what is', 'where is', 'tutorial', 'help',
    'show me', 'explain', 'guide', 'instructions', 'use', 'work',
    'globe', 'dataset', 'temperature', 'pressure', 'calendar', 'download',
    'time series', 'fullscreen', 'chat', 'settings', 'icharm'
  ];
  
  const lowerQuery = query.toLowerCase();
  return tutorialKeywords.some(keyword => lowerQuery.includes(keyword));
}
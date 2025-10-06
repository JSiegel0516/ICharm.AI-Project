// scripts/embedTutorial.js
// Run this once to generate embeddings for the tutorial content
// Usage: node scripts/embedTutorial.js

const fs = require('fs');
const path = require('path');

// Using Xenova's transformers.js for local embeddings
const { pipeline } = require('@xenova/transformers');

async function generateEmbeddings() {
  console.log('Loading embedding model...');
  
  // Load the sentence-transformers model
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  console.log('Reading tutorial sections...');
  
  // Read the tutorial sections
  const tutorialPath = path.join(__dirname, '../../data/tutorial/sections.json');

  const tutorialData = JSON.parse(fs.readFileSync(tutorialPath, 'utf8'));
  
  console.log(`Processing ${tutorialData.sections.length} sections...`);
  
  // Generate embeddings for each section
  const embeddedSections = [];
  
  for (const section of tutorialData.sections) {
    console.log(`Embedding section: ${section.id}`);
    
    // Combine title and content for better context
    const text = `${section.title}. ${section.content}`;
    
    // Generate embedding
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array
    const embedding = Array.from(output.data);
    
    embeddedSections.push({
      id: section.id,
      title: section.title,
      content: section.content,
      embedding: embedding
    });
  }
  
  console.log('Writing embeddings to file...');
  
  // Write to tutorialIndex.json
  const outputPath = path.join(__dirname, '../../data/tutorial/tutorialIndex.json');

  
  // Create directory if it doesn't exist
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ sections: embeddedSections }, null, 2),
    'utf8'
  );
  
  console.log(`✅ Successfully embedded ${embeddedSections.length} sections`);
  console.log(`📁 Output saved to: ${outputPath}`);
  console.log(`💾 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
}

// Run the script
generateEmbeddings().catch(console.error);
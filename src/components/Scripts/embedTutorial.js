// Generate embeddings for tutorial content and site identity context.
// Usage: node src/components/Scripts/embedTutorial.js

const fs = require("fs");
const path = require("path");
const { pipeline } = require("@xenova/transformers");

async function generateEmbeddings() {
  console.log("Loading embedding model...");
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
  );

  console.log("Reading tutorial sections...");
  const tutorialPath = path.join(
    __dirname,
    "../../data/tutorial/sections.json",
  );
  const tutorialData = JSON.parse(fs.readFileSync(tutorialPath, "utf8"));

  const siteIdentityEntries = [
    {
      id: "site-identity",
      title: "What Is This Website",
      content:
        'This website is the iCHARM climate intelligence platform (iCHARM.AI). When users ask about "this website" they are referring to iCHARM, a climate visualization and analysis experience operated by NOAA collaborators and SDSU researchers.',
      category: "site-meta",
    },
    {
      id: "site-purpose",
      title: "iCHARM Purpose and Capabilities",
      content:
        "iCHARM combines an interactive 3D globe, NOAA climate datasets, tutorial guidance, and a Retrieval-Augmented Generation chatbot to help people understand global climate patterns. The site emphasizes accessibility of scientific data and provides guided walkthroughs and explanations.",
      category: "site-meta",
    },
    {
      id: "site-identity-cues",
      title: "On-Site Identity Cues",
      content:
        'Visual and textual cues across the interface reference iCHARM, iCHARM.AI, NOAA datasets, tutorial tours, and the local RAG chatbot. When asked "tell me about this website", the correct answer is to describe iCHARM and the features available on the current site.',
      category: "site-meta",
    },
  ];

  const sectionsToEmbed = [...tutorialData.sections, ...siteIdentityEntries];
  console.log(
    `Processing ${sectionsToEmbed.length} sections (including ${siteIdentityEntries.length} site identity entries)...`,
  );

  const embeddedSections = [];

  for (const section of sectionsToEmbed) {
    console.log(
      `Embedding section: ${section.id} (${section.category || "uncategorized"})`,
    );

    const text = `${section.title}. ${section.content}`;
    const output = await embedder(text, { pooling: "mean", normalize: true });
    const embedding = Array.from(output.data);

    embeddedSections.push({
      id: section.id,
      title: section.title,
      content: section.content,
      category: section.category || null,
      embedding,
    });
  }

  console.log("\nWriting embeddings to file...");
  const outputPath = path.join(
    __dirname,
    "../../data/tutorial/tutorialIndex.json",
  );
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify({ sections: embeddedSections }, null, 2),
    "utf8",
  );

  console.log(
    `\nDone. Successfully embedded ${embeddedSections.length} sections.`,
  );

  const categoryCounts = embeddedSections.reduce((acc, section) => {
    const cat = section.category || "uncategorized";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  console.log("\nSections by category:");
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  console.log(`\nOutput saved to: ${outputPath}`);
  console.log(
    `File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`,
  );
}

generateEmbeddings().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

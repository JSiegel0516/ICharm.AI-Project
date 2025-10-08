// This script checks if tutorialIndex.json exists, and if not, runs embedTutorial.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tutorialIndexPath = path.join(__dirname, '../../data/tutorial/tutorialIndex.json');
const embedScriptPath = path.join(__dirname, 'embedTutorial.js');

if (!fs.existsSync(tutorialIndexPath)) {
  console.log('tutorialIndex.json not found. Generating tutorial embeddings...');
  execSync(`node ${embedScriptPath}`, { stdio: 'inherit' });
} else {
  console.log('tutorialIndex.json already exists. Skipping embedding generation.');
}

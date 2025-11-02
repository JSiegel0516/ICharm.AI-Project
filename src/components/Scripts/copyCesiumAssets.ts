// scripts/copy-cesium-assets.ts
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

// Promisify fs methods for async/await usage
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const copyFile = promisify(fs.copyFile);
const rmdir = promisify(fs.rmdir);
const rm = fs.promises.rm; // Available in Node 14+

interface CopyStats {
  filesCopied: number;
  directoriesCreated: number;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeDirectory(dirPath: string): Promise<void> {
  if (await pathExists(dirPath)) {
    try {
      // Use fs.promises.rm if available (Node 14+), otherwise use rmdir
      if (rm) {
        await rm(dirPath, { recursive: true, force: true });
      } else {
        await rmdir(dirPath, { recursive: true });
      }
    } catch (error) {
      console.warn(`Warning: Could not remove directory ${dirPath}:`, error);
    }
  }
}

async function copyDirectory(src: string, dest: string): Promise<CopyStats> {
  const stats: CopyStats = { filesCopied: 0, directoriesCreated: 0 };

  if (!(await pathExists(src))) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  if (!(await pathExists(dest))) {
    await mkdir(dest, { recursive: true });
    stats.directoriesCreated++;
  }

  const items = await readdir(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const itemStat = await stat(srcPath);

    if (itemStat.isDirectory()) {
      const subStats = await copyDirectory(srcPath, destPath);
      stats.filesCopied += subStats.filesCopied;
      stats.directoriesCreated += subStats.directoriesCreated;
    } else if (itemStat.isFile()) {
      // Skip copying the main Cesium.js file as it's handled by webpack
      const relativePath = path.relative(src, srcPath);
      if (!relativePath.startsWith("Cesium.js")) {
        await copyFile(srcPath, destPath);
        stats.filesCopied++;
      }
    }
  }

  return stats;
}

async function copyCesiumAssets(): Promise<void> {
  try {
    // Get the project root directory (go up from src/components/Scripts to project root)
    const projectRoot = path.resolve(__dirname, "..", "..", "..");
    const cesiumSource: string = path.join(
      projectRoot,
      "node_modules",
      "cesium",
      "Build",
      "Cesium",
    );
    const cesiumDest: string = path.join(projectRoot, "public", "cesium");

    console.log("Copying Cesium assets...");
    console.log(`Project root: ${projectRoot}`);
    console.log(`From: ${cesiumSource}`);
    console.log(`To: ${cesiumDest}`);

    // Check if source exists
    if (!(await pathExists(cesiumSource))) {
      throw new Error(`Cesium source directory not found: ${cesiumSource}`);
    }

    // Clean destination
    await removeDirectory(cesiumDest);

    // Copy assets
    const copyStats = await copyDirectory(cesiumSource, cesiumDest);
    console.log(
      `Copied ${copyStats.filesCopied} files and created ${copyStats.directoriesCreated} directories`,
    );

    // Verify critical directories exist
    const criticalDirs: string[] = [
      "Assets",
      "Workers",
      "ThirdParty",
      "Widgets",
    ];

    for (const dir of criticalDirs) {
      const dirPath: string = path.join(cesiumDest, dir);
      if (await pathExists(dirPath)) {
        console.log(`✓ ${dir} directory copied successfully`);
      } else {
        console.warn(`⚠ ${dir} directory not found after copy`);
      }
    }

    console.log("Cesium assets copied successfully!");
  } catch (error: unknown) {
    console.error("Failed to copy Cesium assets:", error);
    process.exit(1);
  }
}

// Execute the function if this file is run directly
if (require.main === module) {
  copyCesiumAssets();
}

export default copyCesiumAssets;

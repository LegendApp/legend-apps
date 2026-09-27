import { list, stat } from "@legendapp/spark/files";
export interface ReadDirResItemT {
  name: string; path: string; size: number; mtime?: Date; ctime?: Date;
  isDirectory(): boolean; isFile(): boolean;
}
async function readDir(path: string): Promise<ReadDirResItemT[]> {
  const entries = await Promise.all((await list(path)).map(async name => {
    const fullPath = `${path.replace(/\/$/, "")}/${name}`;
    let info;
    try {
      info = await stat(fullPath);
    } catch (error) {
      // Files can disappear between listing a directory and reading their metadata.
      console.warn(`Unable to read photo directory entry ${fullPath}:`, error);
      return null;
    }
    return {name, path: fullPath, size: info.size, mtime: new Date(info.modifiedAt), ctime: new Date(info.modifiedAt), isDirectory: () => info.type === "directory", isFile: () => info.type === "file"};
  }));
  return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

// Supported photo file extensions
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];

export interface PhotoInfo extends ReadDirResItemT {
  id: string;
}

/**
 * Extracts the folder name from a full path
 * @param path - The full path
 * @returns The folder name (last segment of the path)
 */
export function getFolderName(path: string): string {
  // Handle trailing slash
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  // Get the last segment after splitting by forward slash
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || path;
}

/**
 * Checks if a string ends with any of the supported photo extensions
 * @param str - The string to check
 * @returns boolean indicating if the string is a photo file
 */
function isPhotoFile(str: string): boolean {
  return PHOTO_EXTENSIONS.some((ext) => str.toLowerCase().endsWith(ext.toLowerCase()));
}

function sortFilesByName(a: ReadDirResItemT, b: ReadDirResItemT) {
  return a.name.localeCompare(b.name);
}

/**
 * Lists all photo files in a specified folder (non-recursive)
 * @param folderPath - Path to the folder
 * @returns Promise with an array of file names (without full path)
 */
export async function listPhotosInFolder(folderPath: string): Promise<PhotoInfo[]> {
  try {
    // Read the directory contents
    const files = await readDir(folderPath);

    files.sort(sortFilesByName);

    // Filter to only include photo files and extract just the filename
    return files
      .filter((file) => file.isFile() && isPhotoFile(file.name))
      .map((file) => ({
        ...file,
        id: `${folderPath}/${file.name}`,
      }));
  } catch (error) {
    console.error('Error listing photos:', error);
    return [];
  }
}

/**
 * Lists all folders that contain photo files in the configured library paths and their subfolders
 * @returns Promise with an array of absolute folder paths
 */
export async function listFoldersWithPhotosRecursive(libraryPaths: string[]): Promise<string[]> {
  try {
    // Process each configured library path in parallel
    const allFolders = await Promise.all(libraryPaths.map(scanFolderRecursive));

    return allFolders.flat().sort();
  } catch (error) {
    console.error('Error listing folders with photos:', error);
    return [];
  }
}

/**
 * Helper function to scan a folder recursively for photos
 * @param folderPath - Path to scan
 * @returns Promise with an array of absolute folder paths that contain photos
 */
export async function scanFolderRecursive(folderPath: string): Promise<string[]> {
  try {
    const folders: string[] = [];
    const items = await readDir(folderPath);

    // Check if the current folder has photos (in parallel with subfolder scanning)
    const hasPhotos = checkFolderForPhotos(items);

    // Process subdirectories in parallel
    const subDirectories = items.filter((item) => item.isDirectory());
    const subFolderPromises = subDirectories.map((dir) =>
      scanFolderRecursive(`${folderPath}/${dir.name}`)
    );

    // Wait for all subfolder scans to complete
    const subFolderResults = await Promise.all(subFolderPromises);

    // Add all subfolders to our results
    for (const result of subFolderResults) {
      folders.push(...result);
    }

    // Check if the current folder has photos
    if (hasPhotos) {
      folders.push(folderPath);
    }

    return folders;
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error);
    return [];
  }
}

/**
 * Helper function to check if a folder contains photo files
 * @param items - Directory items from readDir
 * @returns Promise resolving to boolean indicating if the folder has photos
 */
function checkFolderForPhotos(items: ReadDirResItemT[]): boolean {
  return items.some((item) => !item.isDirectory() && isPhotoFile(item.name));
}

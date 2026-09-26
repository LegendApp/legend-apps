let storageSubfolder = ".legendphotos";
let fixtureLibrary: string | undefined;
export function configurePhotosLaunch(args: string[]) {
  storageSubfolder = ".legendphotos";
  fixtureLibrary = undefined;
  const session = args.find(arg => arg.startsWith("--photos-test-session="))?.split("=")[1];
  if (session) {
    if (!/^[a-zA-Z0-9-]+$/.test(session)) throw new Error("Invalid Photos test session");
    storageSubfolder = `.legendphotos-tests/${session}`;
    fixtureLibrary = args.find(arg => arg.startsWith("--photos-test-library="))?.slice("--photos-test-library=".length);
  }
}
export const getPhotosStorageSubfolder = () => storageSubfolder;
export const getPhotosFixtureLibrary = () => fixtureLibrary;
export const isPhotosTestSession = () => storageSubfolder !== ".legendphotos";

export const getPhotosStorageRoot = () => isPhotosTestSession() ? "applicationSupport" as const : "document" as const;

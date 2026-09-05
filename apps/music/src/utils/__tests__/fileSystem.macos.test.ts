import { createStorage, pathExists, readTextFile, writeStorageBytes } from "@legend-apps/storage";
import { Directory, File, Paths } from "../fileSystem.macos";

const cacheStorage = jest.mocked(createStorage).mock.results[0].value;
const mockDelete = jest.mocked(cacheStorage.delete);
const mockEnsureDirectory = jest.mocked(cacheStorage.ensureDirectory);
const mockList = jest.mocked(cacheStorage.list);
const mockWrite = jest.mocked(cacheStorage.write);
const mockPathExists = jest.mocked(pathExists);
const mockReadTextFile = jest.mocked(readTextFile);
const mockWriteStorageBytes = jest.mocked(writeStorageBytes);

describe("macOS music filesystem adapter", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPathExists.mockReturnValue(true);
        mockReadTextFile.mockReturnValue("playlist");
        mockWriteStorageBytes.mockReturnValue(true);
    });

    it("maps cache directories to sandboxed storage operations", () => {
        const directory = new Directory(Paths.cache, "Legend Music");
        expect(directory.uri).toBe("file:///Users/test/Library/Caches/Legend%20Music");
        expect(directory.exists).toBe(true);
        expect(mockPathExists).toHaveBeenCalledWith(directory.uri, true);

        directory.create({ intermediates: true });
        expect(mockEnsureDirectory).toHaveBeenCalledWith("Legend Music");

        mockList.mockReturnValue([
            { isDirectory: false, name: "queue.m3u", uri: `${directory.uri}/queue.m3u` },
            { isDirectory: true, name: "art", uri: `${directory.uri}/art` },
        ]);
        const entries = directory.list();
        expect(entries[0]).toBeInstanceOf(File);
        expect(entries[1]).toBeInstanceOf(Directory);
    });

    it("reads arbitrary files but confines mutations to the app cache", async () => {
        const external = new File("/Users/test/Music/list.m3u");
        expect(external.exists).toBe(true);
        expect(external.textSync()).toBe("playlist");
        await expect(external.text()).resolves.toBe("playlist");
        expect(() => external.write("changed")).toThrow("outside the app cache");
        expect(() => external.delete()).toThrow("outside the app cache");
    });

    it("supports text and binary cache files", () => {
        const directory = new Directory(Paths.cache, "Legend Music");
        const textFile = new File(directory, "queue.m3u");
        textFile.write("#EXTM3U\n");
        expect(mockWrite).toHaveBeenCalledWith("Legend Music/queue.m3u", "#EXTM3U\n", { format: "text" });

        const imageFile = new File(directory, "cover.jpg");
        const bytes = new Uint8Array([1, 2, 255]);
        imageFile.write(bytes);
        expect(mockWriteStorageBytes).toHaveBeenCalledWith("cache", "Legend Music/cover.jpg", bytes);

        textFile.delete();
        expect(mockDelete).toHaveBeenCalledWith("Legend Music/queue.m3u");
        expect(textFile.parentDirectory.uri).toBe(directory.uri);
        expect(textFile.name).toBe("queue.m3u");
    });
});

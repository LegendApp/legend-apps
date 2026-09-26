import Foundation
import Photos
import React

@objc(PhotoLibraryCore)
class PhotoLibraryCore: NSObject {

    override init() {
        super.init()
    }

    // MARK: - Permission Methods

    @objc func requestPermissions(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        PHPhotoLibrary.requestAuthorization { status in
            resolve(self.permissionStatusToDictionary(status))
        }
    }

    @objc func getPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = PHPhotoLibrary.authorizationStatus()
        resolve(permissionStatusToDictionary(status))
    }

    private func permissionStatusToDictionary(_ status: PHAuthorizationStatus) -> [String: String] {
        var result = "notDetermined"

        switch status {
        case .authorized, .limited:
            result = "authorized"
        case .denied:
            result = "denied"
        case .restricted:
            result = "restricted"
        case .notDetermined:
            result = "notDetermined"
        @unknown default:
            result = "notDetermined"
        }

        return ["status": result]
    }

    // MARK: - Album Methods

    @objc func getAlbums(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            // Check permission
            let status = PHPhotoLibrary.authorizationStatus()
            if status != .authorized && status != .limited {
                DispatchQueue.main.async {
                    reject("PERMISSION_ERROR", "Photos permission not granted", nil)
                }
                return
            }

            // Fetch albums
            var albumsResult: [[String: Any]] = []

            // Fetch smart albums (like Camera Roll, Favorites, etc.)
            let smartAlbums = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil)
            self.processAlbums(smartAlbums, type: "smartAlbum", result: &albumsResult)

            // Fetch user-created albums
            let userAlbums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
            self.processAlbums(userAlbums, type: "userCreated", result: &albumsResult)

            DispatchQueue.main.async {
                resolve(albumsResult)
            }
        }
    }

    private func processAlbums(_ albums: PHFetchResult<PHAssetCollection>, type: String, result: inout [[String: Any]]) {
        // Create a local copy of the result array
        var localResults = result

        albums.enumerateObjects { (collection, index, stop) in
            // Get the asset count
            let fetchOptions = PHFetchOptions()
            fetchOptions.predicate = NSPredicate(format: "mediaType == %d || mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
            let assets = PHAsset.fetchAssets(in: collection, options: fetchOptions)

            if assets.count > 0 {
                let album: [String: Any] = [
                    "identifier": collection.localIdentifier,
                    "title": collection.localizedTitle ?? "Unknown",
                    "assetCount": assets.count,
                    "type": type
                ]
                localResults.append(album)
            }
        }

        // Assign the local copy back to the inout parameter
        result = localResults
    }

    // MARK: - Photo Methods

    @objc func getPhotosInAlbum(_ albumIdentifier: String, limit: NSInteger, offset: NSInteger, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            // Check permission
            let status = PHPhotoLibrary.authorizationStatus()
            if status != .authorized && status != .limited {
                DispatchQueue.main.async {
                    reject("PERMISSION_ERROR", "Photos permission not granted", nil)
                }
                return
            }

            // Find album by identifier
            guard let assetCollection = self.getAssetCollectionById(albumIdentifier) else {
                DispatchQueue.main.async {
                    reject("ALBUM_NOT_FOUND", "Album not found with provided identifier", nil)
                }
                return
            }

            // Fetch photos in album
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            fetchOptions.predicate = NSPredicate(format: "mediaType == %d || mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)

            let assets = PHAsset.fetchAssets(in: assetCollection, options: fetchOptions)

            // Apply pagination if limit > 0
            let actualLimit = limit > 0 ? limit : assets.count
            let actualOffset = offset >= 0 ? offset : 0
            let endIndex = min(actualOffset + actualLimit, assets.count)

            var photosResult: [[String: Any]] = []

            // Process each asset
            for i in min(actualOffset, endIndex)..<endIndex {
                let asset = assets[i]
                if let photoDict = self.assetToDictionary(asset) {
                    photosResult.append(photoDict)
                }
            }

            DispatchQueue.main.async {
                resolve(photosResult)
            }
        }
    }

    @objc func getPhotoAtIndex(_ albumIdentifier: String, index: NSInteger, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.global(qos: .userInitiated).async {
            // Check permission
            let status = PHPhotoLibrary.authorizationStatus()
            if status != .authorized && status != .limited {
                DispatchQueue.main.async {
                    reject("PERMISSION_ERROR", "Photos permission not granted", nil)
                }
                return
            }

            // Find album by identifier
            guard let assetCollection = self.getAssetCollectionById(albumIdentifier) else {
                DispatchQueue.main.async {
                    reject("ALBUM_NOT_FOUND", "Album not found with provided identifier", nil)
                }
                return
            }

            // Fetch photos in album
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            let assets = PHAsset.fetchAssets(in: assetCollection, options: fetchOptions)

            if index < 0 || index >= assets.count {
                DispatchQueue.main.async {
                    resolve(nil)
                }
                return
            }

            let asset = assets[index]
            if let photoDict = self.assetToDictionary(asset) {
                DispatchQueue.main.async {
                    resolve(photoDict)
                }
            } else {
                DispatchQueue.main.async {
                    resolve(nil)
                }
            }
        }
    }

    // MARK: - Helper Methods

    private func getAssetCollectionById(_ identifier: String) -> PHAssetCollection? {
        let collections = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [identifier], options: nil)
        return collections.firstObject
    }

    private func assetToDictionary(_ asset: PHAsset) -> [String: Any]? {
        let semaphore = DispatchSemaphore(value: 0)
        var result: [String: Any]? = nil
        let options = PHImageRequestOptions()
        options.isSynchronous = false
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { (data, uti, orientation, info) in
            var imageURL: URL?

            if let fileURL = info?["PHImageFileURLKey"] as? URL {
                imageURL = fileURL
            }

            // If we don't have a file URL (e.g., for iCloud photos), we need to save the data to a temp file
            if imageURL == nil && data != nil {
                let tempDir = FileManager.default.temporaryDirectory
                let filename = "\(asset.localIdentifier.replacingOccurrences(of: "/", with: "_")).jpg"
                imageURL = tempDir.appendingPathComponent(filename)

                do {
                    try data?.write(to: imageURL!)
                } catch {
                }
            }

            if let url = imageURL {
                let mediaType = asset.mediaType == .video ? "video" : "image"

                result = [
                    "identifier": asset.localIdentifier,
                    "uri": url.path,
                    "filename": url.lastPathComponent,
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "creationDate": self.formatDate(asset.creationDate),
                    "modificationDate": self.formatDate(asset.modificationDate),
                    "mediaType": mediaType,
                    "isFavorite": asset.isFavorite
                ]
            }

            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 10.0)
        return result
    }

    private func formatDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = ISO8601DateFormatter()
        return formatter.string(from: date)
    }

    // This method must be static (class-level) for RCT to correctly find it
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

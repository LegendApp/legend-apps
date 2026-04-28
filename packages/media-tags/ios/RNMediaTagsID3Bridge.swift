import Foundation
import ID3TagEditor

#if os(macOS)
import AppKit
private typealias RNMediaTagsImage = NSImage
#else
import UIKit
private typealias RNMediaTagsImage = UIImage
#endif

@objc(RNMediaTagsID3Result)
@objcMembers
public final class RNMediaTagsID3Result: NSObject {
    public let title: String?
    public let artist: String?
    public let album: String?
    public let durationSeconds: NSNumber?
    public let artworkData: NSData?

    @objc
    public init(title: String?, artist: String?, album: String?, durationSeconds: NSNumber?, artworkData: NSData?) {
        self.title = title
        self.artist = artist
        self.album = album
        self.durationSeconds = durationSeconds
        self.artworkData = artworkData
    }
}

@objc(RNMediaTagsID3Bridge)
@objcMembers
public final class RNMediaTagsID3Bridge: NSObject {
    @objc(readTagsForURL:error:)
    public static func readTags(for url: NSURL, error: NSErrorPointer) -> RNMediaTagsID3Result? {
        guard url.isFileURL, let path = url.path, path.lowercased().hasSuffix(".mp3") else {
            return nil
        }

        do {
            let editor = ID3TagEditor()
            guard let tag = try editor.read(from: path) else {
                return nil
            }

            let title = (tag.frames[.title] as? ID3FrameWithStringContent)?.content
            let artist = (tag.frames[.artist] as? ID3FrameWithStringContent)?.content
            let album = (tag.frames[.album] as? ID3FrameWithStringContent)?.content
            let durationMs = (tag.frames[.lengthInMilliseconds] as? ID3FrameWithIntegerContent)?.value
            let durationNumber = durationMs.map { NSNumber(value: Double($0) / 1000.0) }
            let artworkData = preferredArtwork(from: tag)?.picture as NSData?

            return RNMediaTagsID3Result(
                title: title,
                artist: artist,
                album: album,
                durationSeconds: durationNumber,
                artworkData: artworkData
            )
        } catch let readError as NSError {
            error?.pointee = readError
            return nil
        }
    }

    @objc(writeTagsForURL:fields:error:)
    public static func writeTags(for url: NSURL, fields: NSDictionary, error errorPointer: NSErrorPointer) -> NSNumber? {
        do {
            guard url.isFileURL, let path = url.path else {
                throw writerError(code: 1000, message: "Invalid file path")
            }

            guard path.lowercased().hasSuffix(".mp3") else {
                throw writerError(code: 1001, message: "ID3 tag writing is only supported for MP3 files")
            }

            guard FileManager.default.fileExists(atPath: path) else {
                throw writerError(code: 1004, message: "File not found")
            }

            let titleField = parsedStringField(named: "title", in: fields)
            let artistField = parsedStringField(named: "artist", in: fields)
            let albumField = parsedStringField(named: "album", in: fields)
            let artworkField = try parsedArtwork(in: fields)

            guard titleField.present || artistField.present || albumField.present || artworkField.present else {
                throw writerError(code: 1002, message: "No fields provided to write")
            }

            let editor = ID3TagEditor()
            if let existingTag = try editor.read(from: path) {
                apply(field: titleField, to: existingTag, frame: .title)
                apply(field: artistField, to: existingTag, frame: .artist)
                apply(field: albumField, to: existingTag, frame: .album)

                if artworkField.present {
                    if let picture = artworkField.picture {
                        existingTag.frames[.attachedPicture(.frontCover)] = picture
                    } else {
                        existingTag.frames.removeValue(forKey: .attachedPicture(.frontCover))
                    }
                }

                try write(tag: existingTag, editor: editor, path: path)
            } else {
                let newTag = try buildNewTag(
                    title: titleField,
                    artist: artistField,
                    album: albumField,
                    artwork: artworkField
                )
                try write(tag: newTag, editor: editor, path: path)
            }

            return NSNumber(value: true)
        } catch let writeError as NSError {
            errorPointer?.pointee = writeError
            return nil
        } catch {
            errorPointer?.pointee = writerError(code: 1999, message: "Unknown ID3 write error")
            return nil
        }
    }

    private static func preferredArtwork(from tag: ID3Tag) -> ID3FrameAttachedPicture? {
        let pictures = tag.frames.compactMap { (name, frame) -> ID3FrameAttachedPicture? in
            guard case .attachedPicture = name else {
                return nil
            }
            return frame as? ID3FrameAttachedPicture
        }

        if let frontCover = pictures.first(where: { $0.type == .frontCover }) {
            return frontCover
        }
        if let other = pictures.first(where: { $0.type == .other }) {
            return other
        }
        return pictures.first
    }

    private static func parsedStringField(named key: String, in fields: NSDictionary) -> (present: Bool, value: String?) {
        guard fields.object(forKey: key) != nil else {
            return (false, nil)
        }

        if fields[key] is NSNull {
            return (true, nil)
        }

        if let raw = fields[key] as? String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return (true, trimmed.isEmpty ? nil : trimmed)
        }

        return (true, nil)
    }

    private static func parsedArtwork(in fields: NSDictionary) throws -> (present: Bool, picture: ID3FrameAttachedPicture?) {
        guard fields.object(forKey: "artworkBase64") != nil else {
            return (false, nil)
        }

        let mime = (fields["artworkMime"] as? String)?.lowercased()
        guard let base64 = fields["artworkBase64"] as? String, !base64.isEmpty else {
            return (true, nil)
        }

        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            throw writerError(code: 1100, message: "Artwork data is not valid base64")
        }

        guard data.count > 0, data.count <= maxArtworkBytes else {
            throw writerError(code: 1101, message: "Artwork payload is too large")
        }

        guard let format = artworkFormat(from: data, mime: mime) else {
            throw writerError(code: 1102, message: "Unsupported artwork type")
        }

        guard isValidImage(data: data) else {
            throw writerError(code: 1103, message: "Artwork data could not be decoded")
        }

        return (true, ID3FrameAttachedPicture(picture: data, type: .frontCover, format: format))
    }

    private static func artworkFormat(from data: Data, mime: String?) -> ID3PictureFormat? {
        if let mime {
            if mime.contains("png") {
                return .png
            }
            if mime.contains("jpeg") || mime.contains("jpg") {
                return .jpeg
            }
        }

        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            return .png
        }
        if data.starts(with: [0xFF, 0xD8, 0xFF]) {
            return .jpeg
        }
        return nil
    }

    private static func isValidImage(data: Data) -> Bool {
        guard let image = RNMediaTagsImage(data: data) else {
            return false
        }

        #if os(macOS)
        if let rep = image.representations.first {
            return rep.pixelsWide > 0 && rep.pixelsHigh > 0
        }
        return false
        #else
        return image.size.width > 0 && image.size.height > 0
        #endif
    }

    private static func apply(field: (present: Bool, value: String?), to tag: ID3Tag, frame: FrameName) {
        guard field.present else {
            return
        }

        if let value = field.value {
            tag.frames[frame] = ID3FrameWithStringContent(content: value)
        } else {
            tag.frames.removeValue(forKey: frame)
        }
    }

    private static func buildNewTag(
        title: (present: Bool, value: String?),
        artist: (present: Bool, value: String?),
        album: (present: Bool, value: String?),
        artwork: (present: Bool, picture: ID3FrameAttachedPicture?)
    ) throws -> ID3Tag {
        let builder = ID32v3TagBuilder()
        var hasContent = false

        if let value = title.value {
            _ = builder.title(frame: ID3FrameWithStringContent(content: value))
            hasContent = true
        }
        if let value = artist.value {
            _ = builder.artist(frame: ID3FrameWithStringContent(content: value))
            hasContent = true
        }
        if let value = album.value {
            _ = builder.album(frame: ID3FrameWithStringContent(content: value))
            hasContent = true
        }
        if let picture = artwork.picture {
            _ = builder.attachedPicture(pictureType: .frontCover, frame: picture)
            hasContent = true
        }

        guard hasContent else {
            throw writerError(code: 1200, message: "No tag data provided for a new file")
        }

        return builder.build()
    }

    private static func write(tag: ID3Tag, editor: ID3TagEditor, path: String) throws {
        let originalURL = URL(fileURLWithPath: path)
        let tempURL = originalURL.appendingPathExtension("id3write.tmp")

        if FileManager.default.fileExists(atPath: tempURL.path) {
            try? FileManager.default.removeItem(at: tempURL)
        }

        try editor.write(tag: tag, to: path, andSaveTo: tempURL.path)
        do {
            _ = try FileManager.default.replaceItemAt(
                originalURL,
                withItemAt: tempURL,
                backupItemName: nil,
                options: .usingNewMetadataOnly
            )
        } catch {
            try? FileManager.default.removeItem(at: tempURL)
            throw error
        }
    }

    private static func writerError(code: Int, message: String) -> NSError {
        NSError(domain: writerErrorDomain, code: code, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static let writerErrorDomain = "LegendDesktop.MediaTags.ID3Writer"
    private static let maxArtworkBytes = 10 * 1024 * 1024
}

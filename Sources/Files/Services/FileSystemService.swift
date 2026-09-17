import Foundation

enum FileServiceError: LocalizedError {
    case alreadyExists(String)

    var errorDescription: String? {
        switch self {
        case .alreadyExists(let name):
            return "\"\(name)\" already exists."
        }
    }
}

enum FileSystemService {
    private static let fm = FileManager.default

    static func statEntry(_ path: String) throws -> FileEntry {
        let url = URL(fileURLWithPath: path)
        let name = url.lastPathComponent
        let isSymlink = (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) ?? false

        var isDirectory = false
        var size: Int64 = 0
        var modified = Date(timeIntervalSince1970: 0)
        var created = Date(timeIntervalSince1970: 0)

        if let values = try? url.resourceValues(forKeys: [
            .isDirectoryKey, .fileSizeKey, .contentModificationDateKey, .creationDateKey,
        ]) {
            isDirectory = values.isDirectory ?? false
            size = Int64(values.fileSize ?? 0)
            modified = values.contentModificationDate ?? modified
            created = values.creationDate ?? created
        }

        let ext = isDirectory ? "" : url.pathExtension.lowercased()
        return FileEntry(
            path: path, name: name, isDirectory: isDirectory, isSymlink: isSymlink,
            size: size, modified: modified, created: created, extensionName: ext
        )
    }

    static func listDirectory(_ path: String) throws -> [FileEntry] {
        let names = try fm.contentsOfDirectory(atPath: path)
        return names.compactMap { name in
            try? statEntry((path as NSString).appendingPathComponent(name))
        }
    }

    static func quickAccessItems() -> [QuickAccessItem] {
        let home = NSHomeDirectory()
        let candidates = [
            QuickAccessItem(name: "Home", path: home, systemImage: "house"),
            QuickAccessItem(name: "Desktop", path: home + "/Desktop", systemImage: "menubar.dock.rectangle"),
            QuickAccessItem(name: "Documents", path: home + "/Documents", systemImage: "doc"),
            QuickAccessItem(name: "Downloads", path: home + "/Downloads", systemImage: "arrow.down.circle"),
            QuickAccessItem(name: "Pictures", path: home + "/Pictures", systemImage: "photo"),
            QuickAccessItem(name: "Music", path: home + "/Music", systemImage: "music.note"),
            QuickAccessItem(name: "Movies", path: home + "/Movies", systemImage: "film"),
            QuickAccessItem(name: "Applications", path: "/Applications", systemImage: "square.grid.2x2"),
        ]
        return candidates.filter { fm.fileExists(atPath: $0.path) }
    }

    static func volumes() -> [VolumeInfo] {
        var result = [VolumeInfo(name: "Macintosh HD", path: "/", isRoot: true)]
        if let names = try? fm.contentsOfDirectory(atPath: "/Volumes") {
            for name in names.sorted() {
                let volPath = "/Volumes/" + name
                if let real = try? fm.destinationOfSymbolicLink(atPath: volPath), real == "/" {
                    continue
                }
                var isDir: ObjCBool = false
                if fm.fileExists(atPath: volPath, isDirectory: &isDir), isDir.boolValue {
                    result.append(VolumeInfo(name: name, path: volPath, isRoot: false))
                }
            }
        }
        return result
    }

    private static func uniqueDestination(in dir: String, name: String) -> String {
        let ext = (name as NSString).pathExtension
        let base = (name as NSString).deletingPathExtension
        var candidate = (dir as NSString).appendingPathComponent(name)
        var n = 2
        while fm.fileExists(atPath: candidate) {
            let newName = ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)"
            candidate = (dir as NSString).appendingPathComponent(newName)
            n += 1
        }
        return candidate
    }

    static func createFolder(in dir: String, baseName: String = "untitled folder") throws -> FileEntry {
        let target = uniqueDestination(in: dir, name: baseName)
        try fm.createDirectory(atPath: target, withIntermediateDirectories: false)
        return try statEntry(target)
    }

    static func createFile(in dir: String, baseName: String = "untitled.txt") throws -> FileEntry {
        let target = uniqueDestination(in: dir, name: baseName)
        fm.createFile(atPath: target, contents: Data())
        return try statEntry(target)
    }

    static func rename(_ path: String, to newName: String) throws -> FileEntry {
        let dir = (path as NSString).deletingLastPathComponent
        let dest = (dir as NSString).appendingPathComponent(newName)
        if dest != path && fm.fileExists(atPath: dest) {
            throw FileServiceError.alreadyExists(newName)
        }
        try fm.moveItem(atPath: path, toPath: dest)
        return try statEntry(dest)
    }

    static func copy(_ paths: [String], to destDir: String) throws {
        for src in paths {
            let name = (src as NSString).lastPathComponent
            let dest = uniqueDestination(in: destDir, name: name)
            try fm.copyItem(atPath: src, toPath: dest)
        }
    }

    static func move(_ paths: [String], to destDir: String) throws {
        for src in paths {
            let srcDir = (src as NSString).deletingLastPathComponent
            if srcDir == destDir { continue }
            let name = (src as NSString).lastPathComponent
            let dest = uniqueDestination(in: destDir, name: name)
            try fm.moveItem(atPath: src, toPath: dest)
        }
    }

    static func delete(_ paths: [String]) throws {
        for p in paths {
            try fm.trashItem(at: URL(fileURLWithPath: p), resultingItemURL: nil)
        }
    }

    static func readTextPreview(_ path: String, maxBytes: Int = 64 * 1024) -> (text: String, truncated: Bool)? {
        guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
        defer { try? handle.close() }
        let data = handle.readData(ofLength: maxBytes)
        let fullSize: Int64 = (try? fm.attributesOfItem(atPath: path)[.size] as? Int64) ?? Int64(data.count)
        let text = String(data: data, encoding: .utf8) ?? ""
        let truncated = fullSize > Int64(maxBytes)
        return (text, truncated)
    }

    static func search(root: String, query: String, limit: Int = 500, onResult: (FileEntry) -> Void, isCancelled: () -> Bool) {
        let needle = query.lowercased()
        guard let enumerator = fm.enumerator(atPath: root) else { return }
        var found = 0
        for case let relativePath as String in enumerator {
            if isCancelled() || found >= limit { break }
            let full = (root as NSString).appendingPathComponent(relativePath)
            guard let entry = try? statEntry(full) else { continue }
            if entry.isHidden {
                if entry.isDirectory { enumerator.skipDescendants() }
                continue
            }
            if entry.name.lowercased().contains(needle) {
                found += 1
                onResult(entry)
            }
        }
    }
}

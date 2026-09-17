import Foundation

struct FileEntry: Identifiable, Equatable, Hashable {
    let path: String
    let name: String
    let isDirectory: Bool
    let isSymlink: Bool
    let size: Int64
    let modified: Date
    let created: Date
    let extensionName: String

    var id: String { path }

    var isHidden: Bool { name.hasPrefix(".") }

    var kindLabel: String {
        if isDirectory { return "Folder" }
        if extensionName.isEmpty { return "Document" }
        return "\(extensionName.uppercased()) File"
    }

    var url: URL { URL(fileURLWithPath: path) }
}

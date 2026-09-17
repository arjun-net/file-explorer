import Foundation

struct QuickAccessItem: Identifiable, Hashable {
    let name: String
    let path: String
    let systemImage: String

    var id: String { path }
}

struct VolumeInfo: Identifiable, Hashable {
    let name: String
    let path: String
    let isRoot: Bool

    var id: String { path }
}

import SwiftUI

struct FileContextMenuContent: View {
    @ObservedObject var vm: FileExplorerViewModel
    let targetPaths: [String]
    let source: [FileEntry]

    var body: some View {
        let entries = targetPaths.compactMap { path in source.first { $0.path == path } }
        let clip = vm.clipboard

        if targetPaths.isEmpty {
            Button("New Folder") { vm.createFolder() }
            Button("New File") { vm.createFile() }
            if let clip, !clip.paths.isEmpty {
                Divider()
                Button("Paste \(clip.paths.count) Item\(clip.paths.count == 1 ? "" : "s")") { vm.paste() }
            }
        } else {
            if targetPaths.count == 1, let entry = entries.first {
                Button("Open") { vm.open(entry) }
                Divider()
                Button("Rename") { vm.renamingPath = entry.path }
            }
            Divider()
            Button("Cut") { vm.cutSelectionToClipboard(targetPaths) }
            Button("Copy") { vm.copySelectionToClipboard(targetPaths) }
            if let clip, !clip.paths.isEmpty {
                Button("Paste \(clip.paths.count) Item\(clip.paths.count == 1 ? "" : "s")") { vm.paste() }
            }
            Divider()
            Button("Move to Trash", role: .destructive) { vm.deleteEntries(targetPaths) }
            Divider()
            Button("Reveal in Finder") {
                if let first = targetPaths.first { vm.revealInFinder(first) }
            }
        }
    }
}

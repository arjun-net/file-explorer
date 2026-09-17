import SwiftUI

struct FileTableView: View {
    @ObservedObject var vm: FileExplorerViewModel

    var body: some View {
        Table(vm.displayedEntries, selection: $vm.selection, sortOrder: $vm.sortOrder) {
            TableColumn("Name", value: \.name) { entry in
                nameCell(entry)
            }
            .width(min: 200, ideal: 320)

            TableColumn("Date Modified", value: \.modified) { entry in
                Text(Formatting.date(entry.modified))
                    .foregroundStyle(.secondary)
            }
            .width(min: 120, ideal: 160)

            TableColumn("Size", value: \.size) { entry in
                Text(entry.isDirectory ? "--" : Formatting.bytes(entry.size))
                    .foregroundStyle(.secondary)
            }
            .width(min: 70, ideal: 90)

            TableColumn("Kind", value: \.kindLabel) { entry in
                Text(entry.kindLabel)
                    .foregroundStyle(.secondary)
            }
            .width(min: 90, ideal: 130)
        }
        .contextMenu(forSelectionType: String.self) { paths in
            FileContextMenuContent(vm: vm, targetPaths: Array(paths), source: vm.displayedEntries)
        } primaryAction: { paths in
            guard let path = paths.first, let entry = vm.displayedEntries.first(where: { $0.path == path }) else { return }
            // Deferred: opening can synchronously replace the table's data source
            // (navigating a folder, or launching an external app), which must not
            // happen while AppKit is still inside the row's click delegate callback.
            DispatchQueue.main.async {
                vm.open(entry)
            }
        }
        .onDeleteCommand {
            vm.deleteEntries(Array(vm.selection))
        }
    }

    @ViewBuilder
    private func nameCell(_ entry: FileEntry) -> some View {
        if vm.renamingPath == entry.path {
            HStack {
                Image(systemName: Icons.systemImage(for: entry))
                    .foregroundStyle(Icons.color(for: entry))
                RenameField(
                    initial: entry.name,
                    onCommit: { vm.commitRename(entry, to: $0) },
                    onCancel: { vm.renamingPath = nil }
                )
            }
        } else {
            HStack {
                Image(systemName: Icons.systemImage(for: entry))
                    .foregroundStyle(Icons.color(for: entry))
                Text(entry.name)
                    .lineLimit(1)
            }
            .draggable(entry.url)
            .dropDestination(for: URL.self) { urls, _ in
                guard entry.isDirectory else { return false }
                vm.moveItems(urls.map(\.path), to: entry.path)
                return true
            }
        }
    }
}

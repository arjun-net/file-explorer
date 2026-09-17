import AppKit
import SwiftUI

struct FileGridView: View {
    @ObservedObject var vm: FileExplorerViewModel
    @State private var lastIndex: Int?

    private let columns = [GridItem(.adaptive(minimum: 92, maximum: 120), spacing: 4)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(Array(vm.displayedEntries.enumerated()), id: \.element.id) { index, entry in
                    gridItem(entry, index: index)
                }
            }
            .padding(14)
        }
        .background(backgroundTapCatcher)
        .onDeleteCommand { vm.deleteEntries(Array(vm.selection)) }
    }

    private var backgroundTapCatcher: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { vm.selection = [] }
    }

    @ViewBuilder
    private func gridItem(_ entry: FileEntry, index: Int) -> some View {
        VStack(spacing: 6) {
            Image(systemName: Icons.systemImage(for: entry))
                .font(.system(size: 34))
                .foregroundStyle(Icons.color(for: entry))
                .frame(height: 40)
            if vm.renamingPath == entry.path {
                RenameField(
                    initial: entry.name,
                    onCommit: { vm.commitRename(entry, to: $0) },
                    onCancel: { vm.renamingPath = nil }
                )
                .frame(width: 96)
            } else {
                Text(entry.name)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .background(vm.selection.contains(entry.path) ? Color.accentColor.opacity(0.25) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .draggable(entry.url)
        .dropDestination(for: URL.self) { urls, _ in
            guard entry.isDirectory else { return false }
            vm.moveItems(urls.map(\.path), to: entry.path)
            return true
        }
        .onTapGesture(count: 2) { vm.open(entry) }
        .onTapGesture(count: 1) { handleSelect(entry: entry, index: index) }
        .contextMenu {
            let paths = (vm.selection.contains(entry.path) && vm.selection.count > 1)
                ? Array(vm.selection) : [entry.path]
            FileContextMenuContent(vm: vm, targetPaths: paths, source: vm.displayedEntries)
        }
    }

    private func handleSelect(entry: FileEntry, index: Int) {
        let flags = NSEvent.modifierFlags
        if flags.contains(.shift), let last = lastIndex {
            let lo = min(last, index), hi = max(last, index)
            vm.selection = Set(vm.displayedEntries[lo...hi].map(\.path))
        } else if flags.contains(.command) {
            if vm.selection.contains(entry.path) {
                vm.selection.remove(entry.path)
            } else {
                vm.selection.insert(entry.path)
            }
            lastIndex = index
        } else {
            vm.selection = [entry.path]
            lastIndex = index
        }
    }
}

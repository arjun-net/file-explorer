import SwiftUI

struct ContentView: View {
    @StateObject private var vm = FileExplorerViewModel()

    var body: some View {
        NavigationSplitView {
            SidebarView(vm: vm)
                .navigationSplitViewColumnWidth(min: 180, ideal: 210)
        } detail: {
            VStack(spacing: 0) {
                if vm.isLoading && vm.displayedEntries.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = vm.errorMessage {
                    ContentUnavailableView(error, systemImage: "exclamationmark.triangle")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.displayedEntries.isEmpty {
                    ContentUnavailableView(
                        vm.searchActive ? "No Results" : "This Folder Is Empty",
                        systemImage: vm.searchActive ? "magnifyingglass" : "folder"
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.viewMode == .list {
                    FileTableView(vm: vm)
                } else {
                    FileGridView(vm: vm)
                }

                if let banner = vm.errorBanner {
                    Text(banner)
                        .font(.caption)
                        .padding(8)
                        .frame(maxWidth: .infinity)
                        .background(Color.red.opacity(0.85))
                        .foregroundStyle(.white)
                }

                StatusBarView(vm: vm)
            }
            .navigationTitle(currentFolderName)
            .toolbar { toolbarContent }
        }
        .inspector(isPresented: $vm.previewVisible) {
            PreviewPanelView(vm: vm)
        }
        .searchable(text: $vm.searchQuery, placement: .toolbar, prompt: "Search")
        .onSubmit(of: .search) { vm.startDeepSearch() }
        .onChange(of: vm.searchQuery) { _, newValue in
            if vm.searchActive && newValue.isEmpty { vm.clearSearch() }
        }
        .background(hiddenShortcuts)
        .task { await vm.bootstrap() }
    }

    private var currentFolderName: String {
        vm.currentPath == "/" ? "Macintosh HD" : (vm.currentPath as NSString).lastPathComponent
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { vm.goBack() } label: { Image(systemName: "chevron.left") }
                .disabled(!vm.canGoBack)
            Button { vm.goForward() } label: { Image(systemName: "chevron.right") }
                .disabled(!vm.canGoForward)
            Button { vm.goUp() } label: { Image(systemName: "chevron.up") }
        }
        ToolbarItem(placement: .principal) {
            if vm.searchActive {
                Text("Search Results")
                    .font(.headline)
            } else {
                BreadcrumbsView(path: vm.currentPath) { vm.navigate(to: $0) }
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button { vm.createFolder() } label: { Image(systemName: "folder.badge.plus") }
                .help("New Folder")
            Button { vm.createFile() } label: { Image(systemName: "doc.badge.plus") }
                .help("New File")

            Picker("View", selection: $vm.viewMode) {
                Image(systemName: "list.bullet").tag(ViewMode.list)
                Image(systemName: "square.grid.2x2").tag(ViewMode.grid)
            }
            .pickerStyle(.segmented)
            .fixedSize()

            if vm.viewMode == .grid {
                Menu {
                    ForEach(sortOptions, id: \.0) { label, comparator in
                        Button(label) { vm.sortOrder = [comparator] }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
                .help("Sort by")
            }

            Toggle(isOn: $vm.showHidden) {
                Image(systemName: vm.showHidden ? "eye" : "eye.slash")
            }
            .help("Toggle Hidden Files")

            Toggle(isOn: $vm.previewVisible) {
                Image(systemName: "sidebar.right")
            }
            .help("Toggle Preview")
        }
    }

    private var sortOptions: [(String, KeyPathComparator<FileEntry>)] {
        [
            ("Name (A–Z)", KeyPathComparator(\FileEntry.name, order: .forward)),
            ("Name (Z–A)", KeyPathComparator(\FileEntry.name, order: .reverse)),
            ("Date Modified (Newest)", KeyPathComparator(\FileEntry.modified, order: .reverse)),
            ("Date Modified (Oldest)", KeyPathComparator(\FileEntry.modified, order: .forward)),
            ("Size (Largest)", KeyPathComparator(\FileEntry.size, order: .reverse)),
            ("Size (Smallest)", KeyPathComparator(\FileEntry.size, order: .forward)),
            ("Kind", KeyPathComparator(\FileEntry.kindLabel, order: .forward)),
        ]
    }

    private var hiddenShortcuts: some View {
        Group {
            Button("") { vm.copySelectionToClipboard(Array(vm.selection)) }
                .keyboardShortcut("c", modifiers: .command)
            Button("") { vm.cutSelectionToClipboard(Array(vm.selection)) }
                .keyboardShortcut("x", modifiers: .command)
            Button("") { vm.paste() }
                .keyboardShortcut("v", modifiers: .command)
            Button("") { vm.selection = Set(vm.displayedEntries.map(\.path)) }
                .keyboardShortcut("a", modifiers: .command)
            Button("") { vm.createFolder() }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("") { vm.goBack() }
                .keyboardShortcut("[", modifiers: .command)
            Button("") { vm.goForward() }
                .keyboardShortcut("]", modifiers: .command)
            Button("") { vm.goUp() }
                .keyboardShortcut(.upArrow, modifiers: .command)
        }
        .frame(width: 0, height: 0)
        .opacity(0)
        .accessibilityHidden(true)
    }
}

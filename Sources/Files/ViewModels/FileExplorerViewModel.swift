import AppKit
import Foundation

@MainActor
final class FileExplorerViewModel: ObservableObject {
    @Published var currentPath: String = ""
    @Published var entries: [FileEntry] = []
    @Published var isLoading = true
    @Published var errorMessage: String?

    @Published var selection: Set<String> = []
    @Published var sortOrder: [KeyPathComparator<FileEntry>] = [KeyPathComparator(\FileEntry.name)]
    @Published var viewMode: ViewMode = .list
    @Published var showHidden = false
    @Published var clipboard: ClipboardState?
    @Published var renamingPath: String?

    @Published var searchQuery: String = ""
    @Published var searchActive = false
    @Published var searchResults: [FileEntry] = []
    @Published var isSearching = false

    @Published var quickAccess: [QuickAccessItem] = []
    @Published var volumes: [VolumeInfo] = []
    @Published var previewVisible = true
    @Published var errorBanner: String?

    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false

    private var backStack: [String] = []
    private var forwardStack: [String] = []
    private let watcher = DirectoryWatcher()
    private var searchTask: Task<Void, Never>?
    private var bannerTask: Task<Void, Never>?

    var selectedEntries: [FileEntry] {
        displayedEntries.filter { selection.contains($0.path) }
    }

    var selectedSize: Int64 {
        selectedEntries.reduce(0) { $0 + $1.size }
    }

    var displayedEntries: [FileEntry] {
        var source = searchActive ? searchResults : entries
        if !searchActive {
            let q = searchQuery.trimmingCharacters(in: .whitespaces).lowercased()
            if !q.isEmpty {
                source = source.filter { $0.name.lowercased().contains(q) }
            }
        }
        let filtered = showHidden ? source : source.filter { !$0.isHidden }
        let sorted = filtered.sorted(using: sortOrder)
        return sorted.sorted { a, b in
            a.isDirectory != b.isDirectory && a.isDirectory
        }
    }

    func bootstrap() async {
        quickAccess = FileSystemService.quickAccessItems()
        volumes = FileSystemService.volumes()
        currentPath = NSHomeDirectory()
        loadCurrentDirectory()
    }

    func navigate(to path: String, recordHistory: Bool = true) {
        guard path != currentPath else { return }
        if searchActive { clearSearch() }
        if recordHistory {
            backStack.append(currentPath)
            forwardStack.removeAll()
        }
        currentPath = path
        selection = []
        canGoBack = !backStack.isEmpty
        canGoForward = !forwardStack.isEmpty
        loadCurrentDirectory()
    }

    func goBack() {
        guard let prev = backStack.popLast() else { return }
        forwardStack.append(currentPath)
        currentPath = prev
        selection = []
        canGoBack = !backStack.isEmpty
        canGoForward = !forwardStack.isEmpty
        loadCurrentDirectory()
    }

    func goForward() {
        guard let next = forwardStack.popLast() else { return }
        backStack.append(currentPath)
        currentPath = next
        selection = []
        canGoBack = !backStack.isEmpty
        canGoForward = !forwardStack.isEmpty
        loadCurrentDirectory()
    }

    func goUp() {
        let parent = (currentPath as NSString).deletingLastPathComponent
        guard !parent.isEmpty, parent != currentPath else { return }
        navigate(to: parent)
    }

    func loadCurrentDirectory() {
        let path = currentPath
        isLoading = true
        errorMessage = nil
        Task { [weak self] in
            do {
                let list = try await Task.detached(priority: .userInitiated) {
                    try FileSystemService.listDirectory(path)
                }.value
                // Hop through a real run-loop turn: applying a fresh data set to the
                // Table must not land inside whatever AppKit callback is currently
                // on the stack (e.g. the click that triggered this navigation), or
                // NSTableView flags it as a reentrant delegate call.
                DispatchQueue.main.async {
                    guard let self, self.currentPath == path else { return }
                    self.entries = list
                    self.isLoading = false
                }
            } catch {
                DispatchQueue.main.async {
                    guard let self, self.currentPath == path else { return }
                    self.errorMessage = error.localizedDescription
                    self.entries = []
                    self.isLoading = false
                }
            }
        }
        watcher.watch(path: path) { [weak self] in
            self?.loadCurrentDirectory()
        }
    }

    func reload() {
        loadCurrentDirectory()
    }

    private func showError(_ error: Error) {
        errorBanner = error.localizedDescription
        bannerTask?.cancel()
        bannerTask = Task {
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { errorBanner = nil }
        }
    }

    func createFolder() {
        do {
            let entry = try FileSystemService.createFolder(in: currentPath)
            reload()
            selection = [entry.path]
            renamingPath = entry.path
        } catch { showError(error) }
    }

    func createFile() {
        do {
            let entry = try FileSystemService.createFile(in: currentPath)
            reload()
            selection = [entry.path]
            renamingPath = entry.path
        } catch { showError(error) }
    }

    func commitRename(_ entry: FileEntry, to newName: String) {
        do {
            let updated = try FileSystemService.rename(entry.path, to: newName)
            renamingPath = nil
            selection = [updated.path]
            if searchActive {
                searchResults = searchResults.map { $0.path == entry.path ? updated : $0 }
            }
            reload()
        } catch {
            renamingPath = nil
            showError(error)
        }
    }

    func deleteEntries(_ paths: [String]) {
        guard !paths.isEmpty else { return }
        do {
            try FileSystemService.delete(paths)
            selection = []
            if searchActive {
                let set = Set(paths)
                searchResults.removeAll { set.contains($0.path) }
            }
            reload()
        } catch { showError(error) }
    }

    func copySelectionToClipboard(_ paths: [String]) {
        guard !paths.isEmpty else { return }
        clipboard = ClipboardState(paths: paths, mode: .copy)
    }

    func cutSelectionToClipboard(_ paths: [String]) {
        guard !paths.isEmpty else { return }
        clipboard = ClipboardState(paths: paths, mode: .cut)
    }

    func paste() {
        guard let clipboard else { return }
        do {
            switch clipboard.mode {
            case .copy:
                try FileSystemService.copy(clipboard.paths, to: currentPath)
            case .cut:
                try FileSystemService.move(clipboard.paths, to: currentPath)
                if searchActive {
                    let set = Set(clipboard.paths)
                    searchResults.removeAll { set.contains($0.path) }
                }
                self.clipboard = nil
            }
            reload()
        } catch { showError(error) }
    }

    func moveItems(_ paths: [String], to destDir: String) {
        guard !paths.contains(destDir) else { return }
        do {
            try FileSystemService.move(paths, to: destDir)
            if searchActive {
                let set = Set(paths)
                searchResults.removeAll { set.contains($0.path) }
            }
            reload()
        } catch { showError(error) }
    }

    func open(_ entry: FileEntry) {
        if entry.isDirectory {
            navigate(to: entry.path)
        } else {
            NSWorkspace.shared.open(entry.url)
        }
    }

    func revealInFinder(_ path: String) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    func startDeepSearch() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        searchTask?.cancel()
        searchResults = []
        isSearching = true
        searchActive = true
        let root = currentPath
        searchTask = Task.detached(priority: .userInitiated) { [weak self] in
            FileSystemService.search(
                root: root,
                query: query,
                onResult: { entry in
                    Task { @MainActor [weak self] in
                        self?.searchResults.append(entry)
                    }
                },
                isCancelled: { Task.isCancelled }
            )
            await MainActor.run { [weak self] in
                self?.isSearching = false
            }
        }
    }

    func clearSearch() {
        searchTask?.cancel()
        searchTask = nil
        searchActive = false
        searchQuery = ""
        searchResults = []
        isSearching = false
    }
}

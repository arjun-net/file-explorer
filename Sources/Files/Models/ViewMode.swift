enum ViewMode: String, CaseIterable {
    case list
    case grid
}

enum ClipboardMode {
    case copy
    case cut
}

struct ClipboardState {
    let paths: [String]
    let mode: ClipboardMode
}

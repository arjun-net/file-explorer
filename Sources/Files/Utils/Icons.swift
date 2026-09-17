import SwiftUI

enum Icons {
    private static let codeExtensions: Set<String> = [
        "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp",
        "cs", "swift", "kt", "php", "sh", "zsh", "bash", "html", "css", "scss", "sass",
        "vue", "svelte", "sql", "yml", "yaml", "toml", "lua", "r", "m", "pl",
    ]
    private static let imageExtensions: Set<String> = [
        "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "heic", "ico", "avif", "tiff",
    ]
    private static let audioExtensions: Set<String> = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"]
    private static let videoExtensions: Set<String> = ["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv"]
    private static let archiveExtensions: Set<String> = ["zip", "tar", "gz", "rar", "7z", "bz2", "xz", "dmg", "pkg"]
    private static let sheetExtensions: Set<String> = ["xlsx", "xls", "csv", "numbers"]
    private static let docExtensions: Set<String> = ["doc", "docx", "pdf", "pages", "rtf", "txt", "md"]

    static let textPreviewExtensions: Set<String> = codeExtensions.union(["txt", "md", "json", "log", "csv", "xml", "env"])
    static let imagePreviewExtensions: Set<String> = imageExtensions.subtracting(["heic"])

    static func systemImage(for entry: FileEntry) -> String {
        if entry.isDirectory { return "folder.fill" }
        let ext = entry.extensionName
        if ext == "json" { return "curlybraces" }
        if codeExtensions.contains(ext) { return "chevron.left.forwardslash.chevron.right" }
        if imageExtensions.contains(ext) { return "photo" }
        if audioExtensions.contains(ext) { return "music.note" }
        if videoExtensions.contains(ext) { return "film" }
        if archiveExtensions.contains(ext) { return "archivebox" }
        if sheetExtensions.contains(ext) { return "tablecells" }
        if ext == "pdf" { return "doc.richtext" }
        if docExtensions.contains(ext) { return "doc.text" }
        return "doc"
    }

    static func color(for entry: FileEntry) -> Color {
        entry.isDirectory ? .accentColor : .secondary
    }
}

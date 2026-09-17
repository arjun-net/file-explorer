import Foundation

enum Formatting {
    private static let byteFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter()
        f.countStyle = .file
        return f
    }()

    static func bytes(_ count: Int64) -> String {
        byteFormatter.string(fromByteCount: count)
    }

    private static let absoluteFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    static func date(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            let time = DateFormatter()
            time.timeStyle = .short
            return "Today, \(time.string(from: date))"
        }
        if Calendar.current.isDateInYesterday(date) {
            let time = DateFormatter()
            time.timeStyle = .short
            return "Yesterday, \(time.string(from: date))"
        }
        return absoluteFormatter.string(from: date)
    }
}

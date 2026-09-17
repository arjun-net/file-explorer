import SwiftUI

struct BreadcrumbsView: View {
    let path: String
    let onNavigate: (String) -> Void

    private struct Segment: Identifiable {
        let id: String
        let label: String
        let path: String
    }

    private var segments: [Segment] {
        let parts = path.split(separator: "/").map(String.init)
        var acc = ""
        var result = [Segment(id: "/", label: "Macintosh HD", path: "/")]
        for part in parts {
            acc += "/" + part
            result.append(Segment(id: acc, label: part, path: acc))
        }
        return result
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                if index > 0 {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
                Button(segment.label) { onNavigate(segment.path) }
                    .buttonStyle(.plain)
                    .foregroundStyle(index == segments.count - 1 ? .primary : .secondary)
                    .lineLimit(1)
            }
        }
        .font(.system(size: 13))
    }
}

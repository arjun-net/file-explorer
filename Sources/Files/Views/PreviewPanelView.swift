import SwiftUI

struct PreviewPanelView: View {
    @ObservedObject var vm: FileExplorerViewModel

    private var singleSelection: FileEntry? {
        vm.selectedEntries.count == 1 ? vm.selectedEntries.first : nil
    }

    var body: some View {
        VStack(spacing: 0) {
            if vm.selectedEntries.count > 1 {
                Spacer()
                VStack(spacing: 4) {
                    Text("\(vm.selectedEntries.count)")
                        .font(.system(size: 32, weight: .light))
                    Text("items selected")
                        .foregroundStyle(.secondary)
                    Text(Formatting.bytes(vm.selectedSize))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else if let entry = singleSelection {
                QuickLookPreview(url: entry.url)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding([.horizontal, .top])

                Text(entry.name)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal)
                    .padding(.top, 10)

                Divider().padding(.top, 12)

                VStack(spacing: 8) {
                    metaRow("Kind", entry.kindLabel)
                    if !entry.isDirectory {
                        metaRow("Size", Formatting.bytes(entry.size))
                    }
                    metaRow("Modified", Formatting.date(entry.modified))
                    metaRow("Created", Formatting.date(entry.created))
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Path").font(.caption).foregroundStyle(.secondary)
                        Text(entry.path)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding()

                Spacer()
            } else {
                Spacer()
                Text("No Selection")
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .frame(minWidth: 240, idealWidth: 260)
    }

    private func metaRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.callout)
    }
}

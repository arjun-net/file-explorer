import SwiftUI

struct StatusBarView: View {
    @ObservedObject var vm: FileExplorerViewModel

    var body: some View {
        HStack(spacing: 4) {
            let count = vm.displayedEntries.count
            Text("\(count) item\(count == 1 ? "" : "s")")
            if !vm.selection.isEmpty {
                Text("· \(vm.selection.count) selected\(vm.selectedSize > 0 ? " (\(Formatting.bytes(vm.selectedSize)))" : "")")
            }
            Spacer()
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 5)
        .overlay(Divider(), alignment: .top)
    }
}

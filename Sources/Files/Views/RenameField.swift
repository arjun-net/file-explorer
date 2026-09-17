import SwiftUI

struct RenameField: View {
    let initial: String
    let onCommit: (String) -> Void
    let onCancel: () -> Void

    @State private var text: String
    @State private var resolved = false
    @FocusState private var focused: Bool

    init(initial: String, onCommit: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.initial = initial
        self.onCommit = onCommit
        self.onCancel = onCancel
        _text = State(initialValue: initial)
    }

    private func resolve() {
        guard !resolved else { return }
        resolved = true
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty && trimmed != initial {
            onCommit(trimmed)
        } else {
            onCancel()
        }
    }

    var body: some View {
        TextField("Name", text: $text)
            .textFieldStyle(.roundedBorder)
            .focused($focused)
            .onAppear { focused = true }
            .onSubmit { resolve() }
            .onExitCommand { resolved = true; onCancel() }
            .onChange(of: focused) { _, isFocused in
                if !isFocused { resolve() }
            }
    }
}

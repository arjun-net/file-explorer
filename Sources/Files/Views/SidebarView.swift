import SwiftUI

struct SidebarView: View {
    @ObservedObject var vm: FileExplorerViewModel

    var body: some View {
        List(selection: Binding(
            get: { vm.currentPath },
            set: { if let path = $0 { vm.navigate(to: path) } }
        )) {
            Section("Favorites") {
                ForEach(vm.quickAccess) { item in
                    Label(item.name, systemImage: item.systemImage)
                        .tag(item.path)
                        .dropDestination(for: URL.self) { urls, _ in
                            vm.moveItems(urls.map(\.path), to: item.path)
                            return true
                        }
                }
            }
            Section("Locations") {
                ForEach(vm.volumes) { volume in
                    Label(volume.name, systemImage: volume.isRoot ? "internaldrive" : "externaldrive")
                        .tag(volume.path)
                        .dropDestination(for: URL.self) { urls, _ in
                            vm.moveItems(urls.map(\.path), to: volume.path)
                            return true
                        }
                }
            }
        }
        .listStyle(.sidebar)
    }
}

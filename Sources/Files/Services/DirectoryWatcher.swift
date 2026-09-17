import Foundation

final class DirectoryWatcher {
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: CInt = -1
    private var debounceWorkItem: DispatchWorkItem?

    func watch(path: String, onChange: @escaping () -> Void) {
        stop()
        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return }
        fileDescriptor = fd

        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .delete],
            queue: DispatchQueue.global(qos: .utility)
        )
        src.setEventHandler { [weak self] in
            self?.debounceWorkItem?.cancel()
            let work = DispatchWorkItem(block: onChange)
            self?.debounceWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
        }
        src.setCancelHandler { [weak self] in
            if let fd = self?.fileDescriptor, fd >= 0 { close(fd) }
        }
        src.resume()
        source = src
    }

    func stop() {
        debounceWorkItem?.cancel()
        source?.cancel()
        source = nil
        fileDescriptor = -1
    }

    deinit { stop() }
}

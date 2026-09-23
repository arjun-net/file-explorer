import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.fileAPI.settingsHasApiKey().then(setHasKey);
  }, []);

  async function save() {
    if (!input.trim()) return;
    await window.fileAPI.settingsSetApiKey(input.trim());
    setInput("");
    setHasKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clear() {
    await window.fileAPI.settingsClearApiKey();
    setHasKey(false);
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Settings</span>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-field-label">Anthropic API Key</div>
          <p className="modal-help-text">
            Powers the search agent (the "Ask" tab in Indexed Search) — a separate credential from any Claude
            subscription. Stored encrypted on this device only, never sent anywhere except directly to Anthropic's
            API.
          </p>

          <div className="modal-key-status">
            {hasKey === null ? null : hasKey ? (
              <span className="modal-key-status-set">● Key configured</span>
            ) : (
              <span className="modal-key-status-unset">● No key set</span>
            )}
          </div>

          <div className="modal-field-row">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button className="modal-save-btn" onClick={save} disabled={!input.trim()}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>

          {hasKey && (
            <button className="modal-clear-btn" onClick={clear}>
              Remove key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

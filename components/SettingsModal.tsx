import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { ElevenLabsConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ElevenLabsConfig | null;
  onSave: (config: ElevenLabsConfig | null) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [apiKey, setApiKey] = useState(config?.apiKey || '');
  const [voiceId, setVoiceId] = useState(config?.voiceId || '');

  if (!isOpen) return null;

  const handleSave = () => {
    if (apiKey && voiceId) {
      onSave({ apiKey, voiceId });
    } else {
      onSave(null);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a120b] border border-[#3d291a] rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-900 hover:text-amber-500"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-mono text-amber-500 mb-6 uppercase tracking-wider border-b border-amber-900/30 pb-2">
          Engineering Panel
        </h2>

        <div className="space-y-4">
          <p className="text-amber-500/60 text-xs mb-4">
            Integrate ElevenLabs to customize the host's voice. 
            <br/><span className="text-red-400">Note: This adds some latency to the broadcast.</span>
          </p>

          <div>
            <label className="block text-amber-700 text-xs font-bold uppercase mb-1">
              ElevenLabs API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-black border border-amber-900/50 rounded p-2 text-amber-500 text-sm focus:border-amber-500 outline-none"
              placeholder="xi-..."
            />
          </div>

          <div>
            <label className="block text-amber-700 text-xs font-bold uppercase mb-1">
              Voice ID
            </label>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full bg-black border border-amber-900/50 rounded p-2 text-amber-500 text-sm focus:border-amber-500 outline-none"
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-amber-900/20 hover:bg-amber-900/40 text-amber-500 px-4 py-2 rounded text-sm font-bold uppercase tracking-wide border border-amber-900/50 transition-colors"
          >
            <Save size={14} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
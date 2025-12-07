import React from 'react';
import { X, MessageSquare, Music, Brain, Newspaper } from 'lucide-react';

interface TopicSuggestionsProps {
  isOpen: boolean;
  onClose: () => void;
}

const TopicSuggestions: React.FC<TopicSuggestionsProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const categories = [
    {
      icon: <Music size={16} />,
      title: "Music Requests",
      prompts: [
        "Play something upbeat like rock.",
        "Can we switch to classical music?",
        "I need intense techno for focus.",
        "Make it super chill and ambient."
      ]
    },
    {
      icon: <Brain size={16} />,
      title: "Focus Help",
      prompts: [
        "I'm procrastinating, give me a pep talk.",
        "Start a 25 minute focus timer.",
        "I'm stuck on a bug, can I explain it to you?",
        "Help me break down my task list."
      ]
    },
    {
      icon: <Newspaper size={16} />,
      title: "Updates",
      prompts: [
        "What's the latest tech news?",
        "Give me a quick world news summary.",
        "What time is it in London?",
        "Check the weather in Tokyo."
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a120b] border border-[#3d291a] rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-900 hover:text-amber-500"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-mono text-amber-500 mb-6 uppercase tracking-wider border-b border-amber-900/30 pb-2 flex items-center gap-2">
          <MessageSquare size={20} />
          Transmission Ideas
        </h2>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
          {categories.map((cat, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase mb-2">
                {cat.icon}
                {cat.title}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {cat.prompts.map((prompt, j) => (
                  <div key={j} className="bg-black/40 border border-amber-900/20 p-2 rounded text-amber-500/80 text-sm hover:bg-amber-900/10 cursor-default">
                    "{prompt}"
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 text-center text-[10px] text-amber-900/50">
            Tap the call button to speak these to the host.
        </div>
      </div>
    </div>
  );
};

export default TopicSuggestions;
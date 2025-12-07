import React from 'react';
import { MusicGenre } from '../types';
import { Music, Disc } from 'lucide-react';

interface MusicPlayerProps {
  genre: MusicGenre;
  isPlaying: boolean;
}

const GENRE_LABELS: Record<MusicGenre, string> = {
  [MusicGenre.LOFI]: 'Lofi Hip Hop Radio',
  [MusicGenre.CLASSICAL]: 'Classical Focus',
  [MusicGenre.JAZZ]: 'Smooth Jazz Cafe',
  [MusicGenre.AMBIENT]: 'Deep Space Ambient',
  [MusicGenre.NONE]: 'Silence',
};

// Embedding simple YouTube live streams (unlisted or popular public ones)
// Note: In a real production app, we'd use a more robust player.
// These are standard IDs for popular 24/7 radios.
const YOUTUBE_IDS: Record<MusicGenre, string> = {
  [MusicGenre.LOFI]: 'jfKfPfyJRdk', // Lofi Girl
  [MusicGenre.CLASSICAL]: 'M8n68Q8g7x0', // Halidon Music
  [MusicGenre.JAZZ]: 'Dx5qFachd3A', // Jazz BGM
  [MusicGenre.AMBIENT]: 'tNkZsRW7h2c', // Space Ambient
  [MusicGenre.NONE]: '',
};

const MusicPlayer: React.FC<MusicPlayerProps> = ({ genre, isPlaying }) => {
  if (genre === MusicGenre.NONE || !isPlaying) {
    return (
      <div className="flex items-center space-x-3 p-4 bg-studio-800 rounded-xl border border-studio-700 opacity-50">
        <div className="w-10 h-10 rounded-full bg-studio-700 flex items-center justify-center">
          <Music className="w-5 h-5 text-gray-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-400">Music Off</p>
          <p className="text-xs text-gray-600">Waiting for request...</p>
        </div>
      </div>
    );
  }

  const videoId = YOUTUBE_IDS[genre];

  return (
    <div className="relative overflow-hidden rounded-xl border border-accent/20 bg-studio-800 p-4 transition-all duration-500">
      {/* Hidden Player */}
      <div className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none">
        <iframe 
            width="100" 
            height="100" 
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1`} 
            title="Radio" 
            frameBorder="0" 
            allow="autoplay; encrypted-media" 
            allowFullScreen
        />
      </div>

      <div className="flex items-center space-x-4 relative z-10">
        <div className="relative">
             <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center animate-spin-slow">
                <Disc className="w-6 h-6 text-accent animate-spin" style={{ animationDuration: '3s' }} />
             </div>
             <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-studio-800 animate-pulse"></div>
        </div>
       
        <div className="flex-1">
          <p className="text-sm font-bold text-accent tracking-wide uppercase text-xs mb-0.5">Now Playing</p>
          <p className="text-sm text-white font-medium truncate">{GENRE_LABELS[genre]}</p>
        </div>
        
        <div className="flex space-x-1 items-end h-4">
            <div className="w-1 bg-accent/50 h-full animate-sound-wave" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1 bg-accent/50 h-2/3 animate-sound-wave" style={{ animationDelay: '100ms' }}></div>
            <div className="w-1 bg-accent/50 h-1/2 animate-sound-wave" style={{ animationDelay: '200ms' }}></div>
        </div>
      </div>
    </div>
  );
};

export default MusicPlayer;
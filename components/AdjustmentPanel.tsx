/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef } from 'react';
import { PaperclipIcon, SendIcon, XIcon } from './icons'; // Assuming these icons exist

interface AdjustmentPanelProps {
  onAdjustImage: (prompt: string, sceneImage: File | null) => void;
  isLoading: boolean;
}

const LIGHTING_PRESETS = [
  { name: 'Brighter', prompt: 'Make the lighting brighter and more vibrant.' },
  { name: 'Softer', prompt: 'Use a softer, more diffused lighting setup.' },
  { name: 'Dramatic', prompt: 'Apply dramatic lighting with high contrast and shadows.' },
  { name: 'Golden Hour', prompt: 'Change the lighting to resemble the golden hour at sunset.' },
  { name: 'Cool Tone', prompt: 'Adjust the lighting to have a cooler, blueish tone.' },
];

const SCENE_PRESETS = [
  { name: 'Sydney Office', prompt: 'Place the person in a modern Sydney office with a city view. Adapt their current pose to fit the new environment naturally. For example, if they are leaning, have them lean against a desk, a window frame, or a stylish office wall.' },
  { name: 'Outdoor Cafe', prompt: 'Place the person at a bright, outdoor cafe in Sydney, perhaps in The Rocks with a view of the harbour. Adapt their pose to the scene, maybe holding a coffee cup or smiling.' },
  { name: 'Sydney Park', prompt: 'Set the scene in a beautiful park overlooking Sydney Harbour, with lush greenery and the bridge or Opera House in the background. The person should look relaxed and fit naturally into the environment.' },
  { name: 'Neutral Studio', prompt: 'Use a clean, neutral gray studio backdrop.' },
  { name: 'City Skyline', prompt: 'Place the person on a balcony overlooking a blurred Sydney city skyline at dusk, with iconic landmarks subtly visible.' },
];

const PresetButton: React.FC<{onClick: () => void, disabled: boolean, children: React.ReactNode}> = ({ onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-200/80 rounded-full hover:bg-gray-300/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);


const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onAdjustImage, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [sceneImage, setSceneImage] = useState<File | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSceneImage(file);
      setSceneImageUrl(URL.createObjectURL(file));
    }
  };

  const clearSceneImage = () => {
    setSceneImage(null);
    setSceneImageUrl(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onAdjustImage(prompt, sceneImage);
    setPrompt('');
    clearSceneImage();
  };

  const handlePresetClick = (presetPrompt: string) => {
    onAdjustImage(presetPrompt, null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-serif tracking-wider text-gray-800">Adjust Image</h2>
        <p className="text-sm text-gray-600 mt-1 mb-3">
          Use instructions to make changes, change pose, or set a scene (e.g., "add a blue tie", "sitting at a desk"). You can also upload a scene image below.
        </p>
        
        {sceneImageUrl && (
          <div className="relative mb-3 animate-fade-in">
            <img src={sceneImageUrl} alt="Scene preview" className="w-full h-auto max-h-32 object-cover rounded-lg" />
            <button 
              onClick={clearSceneImage}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
              aria-label="Remove scene image"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., change background"
              disabled={isLoading}
              className="w-full pl-3 pr-20 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-shadow text-sm"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <input
                id="scene-upload"
                type="file"
                className="hidden"
                accept="image/png, image/jpeg, image/webp, image/avif, image/heic, image/heif"
                onChange={handleFileChange}
                ref={fileInputRef}
                disabled={isLoading}
              />
              <label
                htmlFor="scene-upload"
                className={`p-2 rounded-full transition-colors ${isLoading ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-500 hover:bg-gray-100'}`}
                aria-label="Attach scene image"
              >
                <PaperclipIcon className="w-5 h-5" />
              </label>
              <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="p-2 rounded-full transition-colors text-gray-500 disabled:text-gray-400 disabled:cursor-not-allowed enabled:hover:bg-gray-100"
                aria-label="Submit adjustment"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>
      </div>
      
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Quick Adjustments: Lighting</h3>
          <div className="flex flex-wrap gap-2">
            {LIGHTING_PRESETS.map(preset => (
              <PresetButton key={preset.name} onClick={() => handlePresetClick(preset.prompt)} disabled={isLoading}>
                {preset.name}
              </PresetButton>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Quick Adjustments: Scene</h3>
          <p className="text-xs text-gray-500 mb-2 -mt-1">The AI will adapt the current pose to fit the new scene.</p>
          <div className="flex flex-wrap gap-2">
            {SCENE_PRESETS.map(preset => (
              <PresetButton key={preset.name} onClick={() => handlePresetClick(preset.prompt)} disabled={isLoading}>
                {preset.name}
              </PresetButton>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdjustmentPanel;
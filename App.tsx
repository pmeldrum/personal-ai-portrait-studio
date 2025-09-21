/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StartScreen from './components/StartScreen';
import Canvas from './components/Canvas';
import WardrobePanel from './components/WardrobeModal';
import AdjustmentPanel from './components/AdjustmentPanel';
import { generateVirtualTryOnImage, generatePoseVariation, adjustImage } from './services/geminiService';
import { OutfitLayer, WardrobeItem } from './types';
import { ChevronDownIcon, ChevronUpIcon } from './components/icons';
import { defaultWardrobe } from './wardrobe';
import Footer from './components/Footer';
import { getFriendlyErrorMessage } from './lib/utils';
import Spinner from './components/Spinner';

const POSE_INSTRUCTIONS = [
  "Classic headshot, looking at camera",
  "3/4 view, smiling",
  "Side profile, looking thoughtful",
  "Arms crossed, professional look",
  "Leaning forward, confident expression",
  "Looking over shoulder towards camera",
  "Walking towards camera, casual",
  "Full-length portrait, leaning against a wall, relaxed",
  "Candid laughing shot",
  "Sitting on a stool, professional",
  "Power pose, hands on hips",
  "Hands in pockets, relaxed stance",
];


const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    // DEPRECATED: mediaQueryList.addListener(listener);
    mediaQueryList.addEventListener('change', listener);
    
    // Check again on mount in case it changed between initial state and effect runs
    if (mediaQueryList.matches !== matches) {
      setMatches(mediaQueryList.matches);
    }

    return () => {
      // DEPRECATED: mediaQueryList.removeListener(listener);
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query, matches]);

  return matches;
};


const App: React.FC = () => {
  const [modelImageUrl, setModelImageUrl] = useState<string | null>(null);
  const [outfitHistory, setOutfitHistory] = useState<OutfitLayer[]>([]);
  const [currentOutfitIndex, setCurrentOutfitIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(defaultWardrobe);
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  const activeGarmentIds = useMemo(() => 
    outfitHistory.slice(0, currentOutfitIndex + 1).map(layer => layer.garment?.id).filter(Boolean) as string[], 
    [outfitHistory, currentOutfitIndex]
  );
  
  const displayImageUrl = useMemo(() => {
    if (outfitHistory.length === 0) return modelImageUrl;
    const currentLayer = outfitHistory[currentOutfitIndex];
    if (!currentLayer) return modelImageUrl;

    const poseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
    // Return the image for the current pose, or fallback to the first available image for the current layer.
    // This ensures an image is shown even while a new pose is generating.
    return currentLayer.poseImages[poseInstruction] ?? Object.values(currentLayer.poseImages)[0];
  }, [outfitHistory, currentOutfitIndex, currentPoseIndex, modelImageUrl]);

  const availablePoseKeys = useMemo(() => {
    if (outfitHistory.length === 0) return [];
    const currentLayer = outfitHistory[currentOutfitIndex];
    return currentLayer ? Object.keys(currentLayer.poseImages) : [];
  }, [outfitHistory, currentOutfitIndex]);

  const handleModelFinalized = (url: string) => {
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [POSE_INSTRUCTIONS[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
  };

  const handleStartOver = () => {
    setModelImageUrl(null);
    setOutfitHistory([]);
    setCurrentOutfitIndex(0);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
    setCurrentPoseIndex(0);
    setIsSheetCollapsed(false);
    setWardrobe(defaultWardrobe);
  };

  const handleGarmentSelect = useCallback(async (garmentFile: File, garmentInfo: WardrobeItem) => {
    if (!displayImageUrl || isLoading) return;

    const nextLayer = outfitHistory[currentOutfitIndex + 1];
    if (nextLayer && nextLayer.garment?.id === garmentInfo.id) {
        setCurrentOutfitIndex(prev => prev + 1);
        setCurrentPoseIndex(0);
        return;
    }

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Applying ${garmentInfo.name} style...`);

    try {
      const newImageUrl = await generateVirtualTryOnImage(displayImageUrl, garmentFile);
      const currentPoseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
      
      const newLayer: OutfitLayer = { 
        garment: garmentInfo, 
        poseImages: { [currentPoseInstruction]: newImageUrl } 
      };

      setOutfitHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, currentOutfitIndex + 1);
        return [...newHistory, newLayer];
      });
      setCurrentOutfitIndex(prev => prev + 1);
      
      setWardrobe(prev => {
        if (prev.find(item => item.id === garmentInfo.id)) {
            return prev;
        }
        return [...prev, garmentInfo];
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to apply style'));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentPoseIndex, outfitHistory, currentOutfitIndex]);
  
  const handlePoseSelect = useCallback(async (newIndex: number) => {
    if (isLoading || outfitHistory.length === 0 || newIndex === currentPoseIndex) return;
    
    const poseInstruction = POSE_INSTRUCTIONS[newIndex];
    const currentLayer = outfitHistory[currentOutfitIndex];

    if (currentLayer.poseImages[poseInstruction]) {
      setCurrentPoseIndex(newIndex);
      return;
    }

    const baseImageForPoseChange = Object.values(currentLayer.poseImages)[0];
    if (!baseImageForPoseChange) return;

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Changing pose...`);
    
    const prevPoseIndex = currentPoseIndex;
    setCurrentPoseIndex(newIndex);

    try {
      const newImageUrl = await generatePoseVariation(baseImageForPoseChange, poseInstruction);
      setOutfitHistory(prevHistory => {
        const newHistory = [...prevHistory];
        const updatedLayer = newHistory[currentOutfitIndex];
        updatedLayer.poseImages[poseInstruction] = newImageUrl;
        return newHistory;
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to change pose'));
      setCurrentPoseIndex(prevPoseIndex);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex]);

  const handleImageAdjustment = useCallback(async (prompt: string, sceneImage: File | null) => {
    if (!displayImageUrl || isLoading) return;

    setError(null);
    setIsLoading(true);
    setLoadingMessage('Adjusting image...');

    try {
        const newImageUrl = await adjustImage(displayImageUrl, prompt, sceneImage);
        const currentPoseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
        const currentLayer = outfitHistory[currentOutfitIndex];

        // Create a new layer for the adjustment to make it undoable
        const newLayer: OutfitLayer = {
            garment: currentLayer.garment, // Inherit garment from the previous layer
            poseImages: { [currentPoseInstruction]: newImageUrl }
        };

        setOutfitHistory(prevHistory => {
            const newHistory = prevHistory.slice(0, currentOutfitIndex + 1);
            return [...newHistory, newLayer];
        });
        setCurrentOutfitIndex(prev => prev + 1);

    } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Failed to adjust image'));
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentOutfitIndex, outfitHistory, currentPoseIndex]);

  const handleRegenerate = useCallback(async () => {
    if (isLoading || outfitHistory.length === 0) return;

    const currentLayer = outfitHistory[currentOutfitIndex];
    if (!currentLayer) return;

    // Use the first available image in the current layer as the base for regeneration
    const baseImageForRegen = Object.values(currentLayer.poseImages)[0];
    if (!baseImageForRegen) {
        setError("No base image available to regenerate from.");
        return;
    }

    const poseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
    
    setError(null);
    setIsLoading(true);
    setLoadingMessage('Regenerating portrait...');
    
    try {
        // We call generatePoseVariation to get a new version of the current pose
        const newImageUrl = await generatePoseVariation(baseImageForRegen, poseInstruction);
        setOutfitHistory(prevHistory => {
            const newHistory = [...prevHistory];
            const updatedLayer = newHistory[currentOutfitIndex];
            // Overwrite the image for the current pose with the newly generated one
            updatedLayer.poseImages[poseInstruction] = newImageUrl;
            return newHistory;
        });
    } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Failed to regenerate portrait'));
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex]);

  const handleUndo = () => {
    if (currentOutfitIndex > 0) {
        setCurrentOutfitIndex(prev => prev - 1);
    }
  };

  const handleRedo = () => {
    if (currentOutfitIndex < outfitHistory.length - 1) {
        setCurrentOutfitIndex(prev => prev + 1);
    }
  };

  const canUndo = currentOutfitIndex > 0;
  const canRedo = currentOutfitIndex < outfitHistory.length - 1;

  const viewVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
  };

  return (
    <div className="font-sans">
      <AnimatePresence mode="wait">
        {!modelImageUrl ? (
          <motion.div
            key="start-screen"
            className="w-screen min-h-screen flex items-start sm:items-center justify-center bg-gray-50 p-4 pb-20"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartScreen onModelFinalized={handleModelFinalized} />
          </motion.div>
        ) : (
          <motion.div
            key="main-app"
            className="relative flex flex-col h-screen bg-white overflow-hidden"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <main className="flex-grow relative flex flex-col md:flex-row overflow-hidden">
              <div className="w-full h-full flex-grow flex items-center justify-center bg-white pb-16 relative">
                <Canvas 
                  displayImageUrl={displayImageUrl}
                  onStartOver={handleStartOver}
                  onRegenerate={handleRegenerate}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  allPoseImages={outfitHistory[currentOutfitIndex]?.poseImages ?? {}}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  onSelectPose={handlePoseSelect}
                  poseInstructions={POSE_INSTRUCTIONS}
                  currentPoseIndex={currentPoseIndex}
                  availablePoseKeys={availablePoseKeys}
                />
              </div>

              <aside 
                className={`absolute md:relative md:flex-shrink-0 bottom-0 right-0 h-auto md:h-full w-full md:w-1/3 md:max-w-sm bg-white/80 backdrop-blur-md flex flex-col border-t md:border-t-0 md:border-l border-gray-200/60 transition-transform duration-500 ease-in-out ${isSheetCollapsed ? 'translate-y-[calc(100%-4.5rem)]' : 'translate-y-0'} md:translate-y-0`}
                style={{ transitionProperty: 'transform' }}
              >
                  <button 
                    onClick={() => setIsSheetCollapsed(!isSheetCollapsed)} 
                    className="md:hidden w-full h-8 flex items-center justify-center bg-gray-100/50"
                    aria-label={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
                  >
                    {isSheetCollapsed ? <ChevronUpIcon className="w-6 h-6 text-gray-500" /> : <ChevronDownIcon className="w-6 h-6 text-gray-500" />}
                  </button>
                  <div className="p-4 md:p-6 pb-20 overflow-y-auto flex-grow flex flex-col gap-8">
                    {error && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                      </div>
                    )}
                    <AdjustmentPanel onAdjustImage={handleImageAdjustment} isLoading={isLoading} />
                    <WardrobePanel
                      onGarmentSelect={handleGarmentSelect}
                      activeGarmentIds={activeGarmentIds}
                      isLoading={isLoading}
                      wardrobe={wardrobe}
                    />
                  </div>
              </aside>
            </main>
            <AnimatePresence>
              {isLoading && isMobile && (
                <motion.div
                  className="fixed inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Spinner />
                  {loadingMessage && (
                    <p className="text-lg font-serif text-gray-700 mt-4 text-center px-4">{loadingMessage}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer isOnDressingScreen={!!modelImageUrl} />
    </div>
  );
};

export default App;
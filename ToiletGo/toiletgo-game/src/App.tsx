/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Trash2, Trophy, RotateCcw, Play, ShieldCheck, Droplets, Brush, User, Check, Globe, School, Building2, Palmtree, Tractor, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Constants
const LANES = 3;
const LANE_WIDTH = 120;
const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;
const HORIZON_Y = 200; // Vanishing point Y
const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.001;

type EntityType = 'CLEANING_TOOL' | 'POO' | 'DECORATION';

interface Entity {
  id: number;
  type: EntityType;
  lane: number; // -1 to 3 for decorations
  z: number; // Distance from player (0 to 1000)
  vx?: number; 
  subType?: string;
  emoji?: string;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  opacity: number;
  color: string;
}

interface WorldConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  floorColor: string;
  sideColor: string;
  lineColor: string;
  difficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';
  speedMultiplier: number;
  spawnRateMultiplier: number;
  specialEffect?: 'PROJECTILES';
  description: string;
  decorations: string[];
  animals?: string[];
  rating: number;
}

const WORLDS: WorldConfig[] = [
  {
    id: 'rural',
    name: 'Rural Area',
    icon: <Tractor className="w-5 h-5" />,
    floorColor: '#fef3c7', // amber-50
    sideColor: '#166534', // green-800 (grass)
    lineColor: '#d97706', 
    difficulty: 'EASY',
    speedMultiplier: 0.8,
    spawnRateMultiplier: 0.7,
    description: 'Dodge farm animals and stay clean in the countryside.',
    decorations: ['🌳', '🌲', '🌻', '🚜'],
    animals: ['🐄', '🐖', '🐑', '🐓'],
    rating: 1
  },
  {
    id: 'school',
    name: 'School Hallway',
    icon: <School className="w-5 h-5" />,
    floorColor: '#f1f5f9', 
    sideColor: '#cbd5e1', // slate-300 (walls)
    lineColor: '#3b82f6', 
    difficulty: 'NORMAL',
    speedMultiplier: 1.0,
    spawnRateMultiplier: 1.0,
    description: 'The lockers are watching. Don\'t slip in the corridor!',
    decorations: ['🗄️', '🎒', '📚', '🏫'],
    rating: 2
  },
  {
    id: 'city',
    name: 'Dirty City',
    icon: <Building2 className="w-5 h-5" />,
    floorColor: '#334155', 
    sideColor: '#1e293b', // slate-900 (buildings)
    lineColor: '#94a3b8', 
    difficulty: 'HARD',
    speedMultiplier: 1.3,
    spawnRateMultiplier: 1.2,
    description: 'Skyscrapers and smog. The city never sleeps, and it\'s messy.',
    decorations: ['🏢', '🏬', '🚦', '🚕'],
    rating: 3
  },
  {
    id: 'poo_island',
    name: 'Poo Island',
    icon: <Palmtree className="w-5 h-5" />,
    floorColor: '#451a03', 
    sideColor: '#78350f', // amber-900 (mud)
    lineColor: '#854d0e', 
    difficulty: 'EXTREME',
    speedMultiplier: 1.5,
    spawnRateMultiplier: 1.5,
    specialEffect: 'PROJECTILES',
    description: 'Tropical terror. The locals are not friendly with their 💩.',
    decorations: ['🌴', '🥥', '🌋', '🛶'],
    rating: 5
  }
];

const HAIR_OPTIONS = ['👱‍♂️', '👨‍🦰', '👨‍🦳', '👨‍🦲', '🧔', '👩‍🦰', '👩‍🦳', '👩‍🦱'];
const CLOTHES_OPTIONS = ['👕', '👔', '🧥', '👘', '👗', '🎽'];
const SHOES_OPTIONS = ['👟', '👞', '👢', '👠', '🥿', '🩴'];

const SKIN_TONE_OPTIONS = [
  { name: 'Default', color: '#FFD200', code: '' },
  { name: 'Light', color: '#F7D0BB', code: '🏻' },
  { name: 'Medium-Light', color: '#E2B98F', code: '🏼' },
  { name: 'Medium', color: '#D3A17E', code: '🏽' },
  { name: 'Medium-Dark', color: '#B37652', code: '🏾' },
  { name: 'Dark', color: '#5C3823', code: '🏿' },
];

const applySkinTone = (emoji: string, toneCode: string) => {
  if (!toneCode) return emoji;
  const chars = Array.from(emoji);
  const base = chars[0];
  const rest = chars.slice(1).join('');
  return base + toneCode + rest;
};

const POO_WORDS = ['DIRTY!', 'STINKY!', 'EW!', 'MESSY!', 'YUCK!', 'POOED!'];
const CLEAN_WORDS = ['SPARKLING!', 'FRESH!', 'SHINY!', 'CLEAN!', 'SQUEAKY!', 'PURE!'];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'CUSTOMIZE' | 'WORLD_SELECT' | 'MODE_SELECT' | 'LOADING' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');
  const [isZooming, setIsZooming] = useState(false);
  const [score, setScore] = useState(0);
  const [cleanliness, setCleanliness] = useState(100);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [highScore, setHighScore] = useState(0);
  const [selectedWorld, setSelectedWorld] = useState<WorldConfig>(WORLDS[1]);
  const [gameMode, setGameMode] = useState<'LONG' | 'SHORT'>('LONG');
  
  // Character State
  const [character, setCharacter] = useState({
    hair: HAIR_OPTIONS[0],
    clothes: CLOTHES_OPTIONS[0],
    shoes: SHOES_OPTIONS[0],
    skinTone: SKIN_TONE_OPTIONS[0].code
  });

  // Game Loop Refs
  const requestRef = useRef<number>(null);
  const stateRef = useRef({
    lane: 1, // Target lane (0, 1, 2)
    currentLane: 1, // Current interpolated lane
    entities: [] as Entity[],
    floatingTexts: [] as FloatingText[],
    speed: INITIAL_SPEED,
    score: 0,
    distance: 0,
    cleanliness: 100,
    frame: 0,
    lastSpawn: 0,
    lastDecoSpawn: 0,
    shake: 0,
    timeLeft: null as number | null, // in seconds
  });

  const startGame = () => {
    setIsZooming(true);
    
    // Transition to loading screen after zoom animation
    setTimeout(() => {
      setGameState('LOADING');
      setIsZooming(false);
      
      // Actual game starts after loading
      setTimeout(() => {
        stateRef.current = {
          lane: 1,
          currentLane: 1,
          entities: [],
          floatingTexts: [],
          speed: INITIAL_SPEED * selectedWorld.speedMultiplier,
          score: 0,
          distance: 0,
          cleanliness: 100,
          frame: 0,
          lastSpawn: 0,
          lastDecoSpawn: 0,
          shake: 0,
          timeLeft: gameMode === 'SHORT' ? 180 : null,
        };
        setScore(0);
        setCleanliness(100);
        setTimeLeft(stateRef.current.timeLeft);
        setGameState('PLAYING');
      }, 3000);
    }, 1500);
  };

  const handleGameOver = useCallback(() => {
    setGameState('GAMEOVER');
    if (stateRef.current.score > highScore) {
      setHighScore(Math.floor(stateRef.current.score));
    }
  }, [highScore]);

  const addFloatingText = (text: string, x: number, y: number, color: string) => {
    stateRef.current.floatingTexts.push({
      id: Date.now() + Math.random(),
      text,
      x,
      y,
      opacity: 1,
      color
    });
  };

  const project = (lane: number, z: number) => {
    // 2D linear mapping
    // z is distance from top (0) to bottom (1000)
    const xBase = GAME_WIDTH / 2;
    const laneOffset = (lane - 1) * LANE_WIDTH;
    
    const x = xBase + laneOffset;
    const y = (z / 1000) * GAME_HEIGHT;
    const scale = 1.0;
    
    return { x, y, scale };
  };

  const update = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    const state = stateRef.current;
    state.frame++;
    state.speed += SPEED_INCREMENT * selectedWorld.speedMultiplier;
    state.distance += state.speed;
    state.score += state.speed / 10;
    setScore(Math.floor(state.score));

    // Handle Timer
    if (state.timeLeft !== null) {
      state.timeLeft -= 1/60; // Assuming 60fps
      if (state.frame % 60 === 0) {
        setTimeLeft(Math.ceil(state.timeLeft));
      }
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        handleGameOver();
        return;
      }
    }

    // Smooth lane switching
    state.currentLane += (state.lane - state.currentLane) * 0.2;

    // Move entities (they are static in the world, we move past them)
    state.entities.forEach(entity => {
      entity.z += state.speed; 
      if (entity.vx) {
        entity.lane += entity.vx / 50;
      }
    });

    // Move floating texts
    state.floatingTexts.forEach(ft => {
      ft.y -= 2;
      ft.opacity -= 0.02;
    });
    state.floatingTexts = state.floatingTexts.filter(ft => ft.opacity > 0);

    // Remove passed entities
    state.entities = state.entities.filter(e => e.z < 1200);

    // Collision detection
    state.entities.forEach(entity => {
      // Player is at z ~ 900
      if (entity.z > 880 && entity.z < 950 && Math.abs(entity.lane - state.currentLane) < 0.5) {
        if (entity.type === 'POO') {
          state.cleanliness -= 20;
          state.shake = 15;
          const word = POO_WORDS[Math.floor(Math.random() * POO_WORDS.length)];
          const { x, y } = project(state.currentLane, 900);
          addFloatingText(word, x, y - 50, '#f43f5e');
          entity.z = 2000; 
        } else if (entity.type === 'CLEANING_TOOL') {
          state.cleanliness = Math.min(100, state.cleanliness + 10);
          state.score += 50;
          const word = CLEAN_WORDS[Math.floor(Math.random() * CLEAN_WORDS.length)];
          const { x, y } = project(state.currentLane, 900);
          addFloatingText(word, x, y - 50, '#38bdf8');
          entity.z = 2000;
        }
      }
    });

    if (state.shake > 0) state.shake *= 0.9;

    setCleanliness(state.cleanliness);
    if (state.cleanliness <= 0) {
      handleGameOver();
    }

    // Spawn gameplay entities
    const spawnInterval = (40 / (state.speed / 5)) / selectedWorld.spawnRateMultiplier;
    if (state.frame - state.lastSpawn > spawnInterval) {
      const type: EntityType = Math.random() > 0.3 ? 'POO' : 'CLEANING_TOOL';
      let vx = 0;
      let lane = Math.floor(Math.random() * LANES);
      let z = 0; // Start at horizon

      if (selectedWorld.specialEffect === 'PROJECTILES' && type === 'POO' && Math.random() > 0.5) {
        const fromLeft = Math.random() > 0.5;
        lane = fromLeft ? -1 : LANES;
        vx = fromLeft ? 0.05 : -0.05;
        z = 400; 
      }

      // Rural specific: Animals that poo
      let emoji = undefined;
      if (selectedWorld.id === 'rural' && type === 'POO' && Math.random() > 0.4) {
        emoji = selectedWorld.animals![Math.floor(Math.random() * selectedWorld.animals!.length)];
      }

      state.entities.push({
        id: Date.now() + Math.random(),
        type,
        lane,
        z,
        vx,
        emoji,
        subType: type === 'CLEANING_TOOL' ? (Math.random() > 0.5 ? 'brush' : 'soap') : undefined
      });
      state.lastSpawn = state.frame;
    }

    // Spawn Decorations
    if (state.frame - state.lastDecoSpawn > 10 / (state.speed / 5)) {
      const side = Math.random() > 0.5 ? -1.5 : 3.5;
      state.entities.push({
        id: Date.now() + Math.random(),
        type: 'DECORATION',
        lane: side + (Math.random() - 0.5) * 2,
        z: 0,
        emoji: selectedWorld.decorations[Math.floor(Math.random() * selectedWorld.decorations.length)]
      });
      state.lastDecoSpawn = state.frame;
    }

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState, handleGameOver, selectedWorld]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;

    // Camera Shake
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background (Sides)
    ctx.fillStyle = selectedWorld.sideColor;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Road (Lanes)
    const roadWidth = LANES * LANE_WIDTH;
    const roadX = (GAME_WIDTH - roadWidth) / 2;
    ctx.fillStyle = selectedWorld.floorColor;
    ctx.fillRect(roadX, 0, roadWidth, GAME_HEIGHT);

    // Scrolling Floor Lines (Horizontal)
    const tileSpacing = 100;
    const tileOffset = state.distance % tileSpacing;
    ctx.strokeStyle = selectedWorld.lineColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    
    for (let y = tileOffset; y <= GAME_HEIGHT; y += tileSpacing) {
      ctx.beginPath();
      ctx.moveTo(roadX, y);
      ctx.lineTo(roadX + roadWidth, y);
      ctx.stroke();
    }

    // Vertical Lane Lines
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i <= LANES; i++) {
      const x = roadX + i * LANE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME_HEIGHT);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Speed Particles (Wind lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const seed = (state.frame * 10 + i * 200) % GAME_HEIGHT;
      const x = (i * 77) % GAME_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, seed);
      ctx.lineTo(x, seed + 40);
      ctx.stroke();
    }

    // Sort entities by Z for correct depth rendering
    const sortedEntities = [...state.entities].sort((a, b) => a.z - b.z);

    sortedEntities.forEach(entity => {
      const { x, y, scale } = project(entity.lane, entity.z);
      const size = 60 * scale;
      
      ctx.font = `${size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (entity.type === 'POO') {
        if (entity.emoji) {
          ctx.fillText(entity.emoji, x, y - size/3);
          ctx.fillText('💩', x, y + size/3);
        } else {
          ctx.fillText('💩', x, y);
        }
      } else if (entity.type === 'CLEANING_TOOL') {
        ctx.fillText(entity.subType === 'brush' ? '🪥' : '🧼', x, y);
      } else if (entity.type === 'DECORATION') {
        ctx.fillText(entity.emoji!, x, y);
      }
    });

    // Draw Player (From the back)
    const bob = Math.sin(state.frame * 0.2) * 5; 
    const legSwing = Math.sin(state.frame * 0.2) * 10;
    const { x: px, y: py, scale: ps } = project(state.currentLane, 850);
    const pSize = 64 * ps; // Reduced from 80
    const playerY = py + bob * ps;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px, py + 20 * ps, 24 * ps, 8 * ps, 0, 0, Math.PI * 2); // Scaled down by 0.8
    ctx.fill();

    // Solid Character Base (to make it non-transparent)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4 * ps; // Scaled down by 0.8
    ctx.beginPath();
    ctx.arc(px, playerY, 36 * ps, 0, Math.PI * 2); // Scaled down by 0.8
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Character parts
    const shoeSize = pSize * 0.7; // 30% smaller than current pSize
    ctx.font = `${shoeSize}px serif`;
    ctx.fillText(character.shoes, px - legSwing * ps, playerY + 16 * ps);
    ctx.fillText(character.shoes, px + legSwing * ps, playerY + 16 * ps);

    ctx.font = `${pSize}px serif`;
    ctx.fillText(character.clothes, px, playerY);
    ctx.fillText(applySkinTone(character.hair, character.skinTone), px, playerY - 16 * ps);

    // Effects
    if (state.cleanliness > 70) {
      ctx.font = `${24 * ps}px serif`; // Scaled down by 0.8
      ctx.fillText('✨', px - 32 * ps, playerY - 24 * ps); // Scaled down by 0.8
      ctx.fillText('✨', px + 32 * ps, playerY - 12 * ps); // Scaled down by 0.8
    } else if (state.cleanliness < 30) {
      ctx.font = `${24 * ps}px serif`; // Scaled down by 0.8
      ctx.fillText('🤢', px - 32 * ps, playerY - 24 * ps); // Scaled down by 0.8
      ctx.fillText('💨', px + 32 * ps, playerY + 12 * ps); // Scaled down by 0.8
    }

    // Floating Texts
    state.floatingTexts.forEach(ft => {
      ctx.globalAlpha = ft.opacity;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      if (e.key === 'ArrowLeft' && stateRef.current.lane > 0) {
        stateRef.current.lane--;
      } else if (e.key === 'ArrowRight' && stateRef.current.lane < LANES - 1) {
        stateRef.current.lane++;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, update]);

  const getFeedback = () => {
    if (gameMode === 'SHORT' && timeLeft === 0) {
      if (cleanliness > 80) return "Squeaky Clean Legend! ✨";
      if (cleanliness > 50) return "A bit dusty, but decent. 👍";
      if (cleanliness > 20) return "You need a little wash, dirty runner! 🧼";
      return "Stinky survivor! 🤢";
    } else {
      // Endless or failed sprint
      if (score > 5000) return "Epic run, but the smell caught up! 💩";
      if (score > 2000) return "Decent effort, go take a shower. 🚿";
      if (score > 500) return "A little dirty, you need a wash! 🧽";
      return "Total mess! Better luck next time. 🗑️";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100 overflow-hidden">
      
      {/* Game Stage */}
      <div className="relative rounded-[3rem] overflow-hidden border-[8px] border-slate-900 shadow-[0_0_80px_rgba(0,0,0,0.6)] bg-white shrink-0">
        <canvas 
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="block"
        />

        {/* Game Overlays */}
        {gameState === 'PLAYING' && (
          <>
            {/* Best Score (Top Left) */}
            <div className="absolute top-6 left-6 flex flex-col items-start z-10 pointer-events-none">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold drop-shadow-sm">Best</span>
              <span className="text-xl font-black text-amber-400 font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {highScore.toString().padStart(6, '0')}
              </span>
            </div>

            {/* Current Score (Top Right) */}
            <div className="absolute top-6 right-6 flex flex-col items-end z-10 pointer-events-none">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold drop-shadow-sm">Score</span>
              <span className="text-2xl font-black text-emerald-400 font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {score.toString().padStart(6, '0')}
              </span>
            </div>

            {/* Timer (Top Center) */}
            {timeLeft !== null && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none">
                <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold drop-shadow-sm">Time</span>
                <span className={`text-2xl font-black font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] ${timeLeft < 30 ? 'text-rose-500 animate-pulse' : 'text-sky-400'}`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            {/* Cleanliness (Vertical Left) */}
            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-48 bg-black/40 rounded-full border border-white/10 p-1 backdrop-blur-sm z-10 flex flex-col justify-end">
              <motion.div 
                className={`w-full rounded-full ${
                  cleanliness > 60 ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]' : 
                  cleanliness > 30 ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 
                  'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                }`}
                initial={{ height: '100%' }}
                animate={{ height: `${cleanliness}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                <Sparkles className="w-3 h-3 text-sky-400" />
              </div>
            </div>

            {/* Pause Button (Bottom Right) */}
            <button 
              onClick={() => setGameState('PAUSED')}
              className="absolute bottom-6 right-6 p-3 bg-black/20 hover:bg-sky-500/80 text-white/70 hover:text-white rounded-2xl backdrop-blur-md transition-all z-10 group"
              title="Pause Game"
            >
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </>
        )}

        {/* Overlays */}

        <AnimatePresence>
          {gameState === 'PAUSED' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-8 z-50"
            >
              <h2 className="text-4xl font-black mb-8 text-white tracking-tight italic uppercase">PAUSED</h2>
              <div className="flex flex-col w-full max-w-[240px] gap-4">
                <button 
                  onClick={() => setGameState('PLAYING')}
                  className="w-full py-5 bg-sky-500 text-slate-950 font-black rounded-2xl hover:bg-sky-400 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg"
                >
                  <Play className="w-6 h-6 fill-current" />
                  RESUME
                </button>
                <button 
                  onClick={startGame}
                  className="w-full py-5 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg"
                >
                  <RotateCcw className="w-6 h-6" />
                  RESTART
                </button>
                <button 
                  onClick={() => setGameState('WORLD_SELECT')}
                  className="w-full py-4 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 transition-all active:scale-95"
                >
                  QUIT TO MENU
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center overflow-hidden"
            >
              <div className="relative mb-8 flex flex-col items-center">
                {/* Jumping Toilet Animation */}
                <div className="absolute w-full h-full pointer-events-none" style={{ top: '-65px' }}>
                  <motion.div
                    initial={{ x: -250, y: 15 }}
                    animate={{ 
                      x: [ -250, -215, -180, -155, -130, -105, -80, -55, -30, -5, 20, 45, 70, 115, 160, 185, 210, 450 ],
                      y: [ 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 79, 29, 79, 79 ],
                      rotate: [ 0, -10, 0, 10, 0, -10, 0, 10, 0, -10, 0, 10, 0, -10, 0, 10, 0, 0 ],
                      scaleY: [ 1, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1 ] 
                    }}
                    transition={{ 
                      duration: 5, 
                      repeat: Infinity,
                      ease: "linear",
                      times: [ 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9, 1 ]
                    }}
                    className="text-6xl absolute left-1/2 -ml-[30px]"
                  >
                    🚽
                    {/* Ejected Particles */}
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={`sheet-${i}`}
                        animate={{ 
                          x: [0, -200 - (i * 20)], 
                          y: [0, 20 + (i * 20)],
                          opacity: [0, 1, 1, 0],
                          rotate: [0, -360 * (i + 1)],
                          scale: [0.5, 1, 1, 0.5]
                        }}
                        transition={{ 
                          duration: 1.5 + (i * 0.2), 
                          repeat: Infinity, 
                          repeatDelay: 0.1 + (i * 0.3),
                          times: [0, 0.2, 0.8, 1]
                        }}
                        className="absolute w-4 h-5 bg-white rounded-sm border border-slate-200 -left-4 top-4"
                      />
                    ))}
                    <motion.span
                      animate={{ 
                        x: [0, -180], 
                        y: [0, 60],
                        opacity: [0, 1, 1, 0],
                        rotate: [0, 360],
                        scale: [0.5, 1, 1, 0.5]
                      }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity, 
                        repeatDelay: 0.8,
                        times: [0, 0.2, 0.8, 1]
                      }}
                      className="absolute text-2xl -left-2 top-8"
                    >
                      💩
                    </motion.span>
                  </motion.div>

                  {/* Chasing Person Animation */}
                  <motion.div
                    animate={{ 
                      x: [ -310, -275, -240, -215, -190, -165, -140, -115, -90, -65, -40, -15, 10, 55, 100, 125, 150, 390 ],
                      y: [ 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 79, 29, 79, 79 ],
                      rotate: [ 0, -5, 0, 5, 0, -5, 0, 5, 0, -5, 0, 5, 0, -5, 0, 5, 0, 0 ],
                    }}
                    initial={{ scaleX: -1 }}
                    transition={{ 
                      duration: 6, 
                      repeat: Infinity,
                      ease: "linear",
                      times: [ 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9, 1 ]
                    }}
                    className="text-4xl absolute left-1/2 -ml-[20px]"
                  >
                    🏃
                  </motion.div>
                </div>

                <motion.div 
                  animate={{ 
                    y: [0, -10, 0],
                    rotate: [-0.5, 0.5, -0.5],
                    opacity: isZooming ? 0 : 1,
                    scale: isZooming ? 0.8 : 1
                  }}
                  transition={{ 
                    y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
                    rotate: { repeat: Infinity, duration: 0.3, ease: "linear" },
                    opacity: { duration: 0.5 },
                    scale: { duration: 0.5 }
                  }}
                  className="relative"
                >
                  <h1 className="text-7xl font-bubble tracking-tight text-white drop-shadow-[0_5px_15px_rgba(14,165,233,0.5)] whitespace-nowrap flex items-center justify-center">
                    <span>TOILET&nbsp;</span>
                    <motion.span
                      animate={{ 
                        y: [0, 0, 0, 0, 0, 0, 0, 0, 64, 64],
                        rotate: [0, 0, 0, 0, 0, 0, 0, 0, 5, 0]
                      }}
                      transition={{ 
                        duration: 5, 
                        repeat: Infinity, 
                        times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
                        ease: "easeInOut"
                      }}
                    >
                      GO
                    </motion.span>
                  </h1>
                </motion.div>
              </div>

              <motion.p 
                animate={{ opacity: isZooming ? 0 : 1 }}
                className="text-slate-400 mt-4 mb-10 max-w-[260px] text-sm leading-relaxed font-medium"
              >
                Survive the messiest worlds in classic 2D!
              </motion.p>
              <motion.button 
                animate={{ opacity: isZooming ? 0 : 1, pointerEvents: isZooming ? 'none' : 'auto' }}
                onClick={() => setGameState('CUSTOMIZE')}
                className="group relative px-16 py-5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-2xl transition-all active:scale-95 flex items-center gap-3 shadow-[0_10px_20px_rgba(14,165,233,0.3)]"
              >
                <Play className="w-6 h-6 fill-current" />
                GO
              </motion.button>
            </motion.div>
          )}

          {gameState === 'CUSTOMIZE' && (
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col p-6 overflow-hidden"
            >
              <h2 className="text-2xl font-black mb-4 text-center tracking-tight text-white">WARDROBE</h2>
              
              <div className="flex-1 flex gap-4 min-h-0">
                {/* Mirror / Dressing Area */}
                <div className="w-1/3 flex flex-col items-center justify-center bg-sky-900/20 rounded-3xl border-4 border-slate-800 relative overflow-hidden shadow-inner">
                  {/* Mirror Reflection Effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
                  <div className="absolute top-0 left-0 w-full h-1 bg-white/20" />
                  
                  <div className="relative flex flex-col items-center scale-[2.5] z-10">
                    <motion.div
                      key={character.hair + character.skinTone}
                      initial={{ y: -5, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-4xl leading-none"
                    >
                      {applySkinTone(character.hair, character.skinTone)}
                    </motion.div>
                    <motion.div
                      key={character.clothes}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl leading-none -mt-1"
                    >
                      {character.clothes}
                    </motion.div>
                    <motion.div
                      key={character.shoes}
                      initial={{ y: 5, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-4xl leading-none -mt-1"
                    >
                      {character.shoes}
                    </motion.div>
                  </div>
                  
                  <div className="absolute bottom-4 text-[10px] font-bold text-sky-400/60 tracking-widest uppercase">Mirror</div>
                </div>

                {/* The Wardrobe */}
                <div className="flex-1 bg-orange-950/40 rounded-3xl border-4 border-amber-900/50 p-4 flex flex-col gap-4 overflow-y-auto no-scrollbar shadow-2xl relative">
                  {/* Wardrobe Texture/Detail */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle,transparent_20%,#000_100%)]" />
                  
                  {/* Skin Tone Shelf */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-amber-900/50" />
                      <span className="text-[10px] uppercase tracking-widest text-amber-500 font-black">Top Shelf: Skin Tone</span>
                      <div className="h-px flex-1 bg-amber-900/50" />
                    </div>
                    <div className="flex justify-between gap-1 bg-slate-900/50 p-2 rounded-xl border border-amber-900/30">
                      {SKIN_TONE_OPTIONS.map(tone => (
                        <button 
                          key={tone.name}
                          onClick={() => setCharacter(prev => ({ ...prev, skinTone: tone.code }))}
                          className={`w-8 h-8 rounded-full transition-all relative ${
                            character.skinTone === tone.code 
                              ? 'ring-2 ring-sky-500 ring-offset-2 ring-offset-slate-950 scale-110' 
                              : 'hover:scale-110 opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: tone.color }}
                          title={tone.name}
                        >
                          {character.skinTone === tone.code && (
                            <Check className="w-4 h-4 text-slate-950 absolute inset-0 m-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hair Shelf */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-amber-900/50" />
                      <span className="text-[10px] uppercase tracking-widest text-amber-500 font-black">Shelf: Hair Style</span>
                      <div className="h-px flex-1 bg-amber-900/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {HAIR_OPTIONS.map(h => (
                        <button 
                          key={h}
                          onClick={() => setCharacter(prev => ({ ...prev, hair: h }))}
                          className={`h-14 rounded-xl flex items-center justify-center text-3xl transition-all relative group ${
                            character.hair === h 
                              ? 'bg-amber-600 shadow-[0_0_15px_rgba(217,119,6,0.5)] border-2 border-amber-400' 
                              : 'bg-slate-900/80 hover:bg-slate-800 border-2 border-transparent'
                          }`}
                        >
                          <span className="group-hover:scale-125 transition-transform">{h}</span>
                          {character.hair === h && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-sky-500 rounded-full border-2 border-slate-950" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Clothes Hanger Area */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-amber-900/50" />
                      <span className="text-[10px] uppercase tracking-widest text-amber-500 font-black">Hangers: Outfits</span>
                      <div className="h-px flex-1 bg-amber-900/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {CLOTHES_OPTIONS.map(c => (
                        <button 
                          key={c}
                          onClick={() => setCharacter(prev => ({ ...prev, clothes: c }))}
                          className={`h-14 rounded-xl flex items-center justify-center text-3xl transition-all relative group ${
                            character.clothes === c 
                              ? 'bg-amber-600 shadow-[0_0_15px_rgba(217,119,6,0.5)] border-2 border-amber-400' 
                              : 'bg-slate-900/80 hover:bg-slate-800 border-2 border-transparent'
                          }`}
                        >
                          <span className="group-hover:scale-125 transition-transform">{c}</span>
                          {character.clothes === c && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-sky-500 rounded-full border-2 border-slate-950" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shoe Rack */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-amber-900/50" />
                      <span className="text-[10px] uppercase tracking-widest text-amber-500 font-black">Shoe Rack: Footwear</span>
                      <div className="h-px flex-1 bg-amber-900/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {SHOES_OPTIONS.map(s => (
                        <button 
                          key={s}
                          onClick={() => setCharacter(prev => ({ ...prev, shoes: s }))}
                          className={`h-14 rounded-xl flex items-center justify-center text-3xl transition-all relative group ${
                            character.shoes === s 
                              ? 'bg-amber-600 shadow-[0_0_15px_rgba(217,119,6,0.5)] border-2 border-amber-400' 
                              : 'bg-slate-900/80 hover:bg-slate-800 border-2 border-transparent'
                          }`}
                        >
                          <span className="group-hover:scale-125 transition-transform">{s}</span>
                          {character.shoes === s && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-sky-500 rounded-full border-2 border-slate-950" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button 
                  onClick={() => setGameState('START')}
                  className="px-6 py-5 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 transition-all"
                >
                  BACK
                </button>
                <button 
                  onClick={() => setGameState('WORLD_SELECT')}
                  className="flex-1 py-5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(14,165,233,0.2)]"
                >
                  <Globe className="w-6 h-6" />
                  CHOOSE WORLD
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'WORLD_SELECT' && (
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col p-6"
            >
              <h2 className="text-2xl font-black mb-6 text-center tracking-tight">SELECT DESTINATION</h2>
              
              <div className="flex-1 flex items-center overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 px-4 py-2">
                {WORLDS.map(w => (
                  <button 
                    key={w.id}
                    onClick={() => setSelectedWorld(w)}
                    className={`flex-shrink-0 w-[260px] h-[320px] p-6 rounded-[2.5rem] border-4 transition-all flex flex-col items-center text-center snap-center relative overflow-hidden ${
                      selectedWorld.id === w.id 
                        ? 'bg-sky-500/20 border-sky-500 shadow-[0_0_30px_rgba(14,165,233,0.3)]' 
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Background Decoration */}
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl rotate-12">
                      {w.decorations[0]}
                    </div>

                    <div className={`p-5 rounded-3xl mb-6 ${selectedWorld.id === w.id ? 'bg-sky-500 text-slate-950 scale-110' : 'bg-slate-800 text-slate-400'} transition-transform duration-500`}>
                      {React.cloneElement(w.icon as React.ReactElement, { className: "w-10 h-10" })}
                    </div>

                    <div className="flex-1 flex flex-col items-center">
                      <span className="font-black text-2xl mb-1 block tracking-tight">{w.name}</span>
                      
                      <div className="flex gap-0.5 mb-3">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`w-3 h-3 ${i < w.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} 
                          />
                        ))}
                      </div>
                      
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full mb-4 inline-block ${
                        w.difficulty === 'EASY' ? 'bg-emerald-500/20 text-emerald-400' :
                        w.difficulty === 'NORMAL' ? 'bg-sky-500/20 text-sky-400' :
                        w.difficulty === 'HARD' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {w.difficulty}
                      </span>

                      <p className="text-sm text-slate-400 leading-relaxed px-2">{w.description}</p>
                    </div>

                    {selectedWorld.id === w.id && (
                      <motion.div 
                        layoutId="active-world"
                        className="absolute bottom-4 w-2 h-2 bg-sky-500 rounded-full"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button 
                  onClick={() => setGameState('CUSTOMIZE')}
                  className="px-6 py-5 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 transition-all"
                >
                  BACK
                </button>
                <button 
                  onClick={() => setGameState('MODE_SELECT')}
                  className="flex-1 py-5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(14,165,233,0.2)]"
                >
                  NEXT
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'MODE_SELECT' && (
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col p-6"
            >
              <h2 className="text-2xl font-black mb-6 text-center tracking-tight">CHOOSE CHALLENGE</h2>
              
              <div className="flex-1 flex flex-col gap-4 justify-center">
                <button 
                  onClick={() => setGameMode('LONG')}
                  className={`w-full p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 text-center ${gameMode === 'LONG' ? 'bg-sky-500/20 border-sky-500 shadow-lg' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                >
                  <Trophy className={`w-12 h-12 ${gameMode === 'LONG' ? 'text-sky-400' : 'text-slate-600'}`} />
                  <div>
                    <span className="block font-black text-xl">LONG RUN</span>
                    <span className="text-xs text-slate-400">Endless survival. How far can you go?</span>
                  </div>
                </button>

                <button 
                  onClick={() => setGameMode('SHORT')}
                  className={`w-full p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 text-center ${gameMode === 'SHORT' ? 'bg-sky-500/20 border-sky-500 shadow-lg' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'}`}
                >
                  <Sparkles className={`w-12 h-12 ${gameMode === 'SHORT' ? 'text-sky-400' : 'text-slate-600'}`} />
                  <div>
                    <span className="block font-black text-xl">3 MIN SPRINT</span>
                    <span className="text-xs text-slate-400">High intensity. 3 minutes max.</span>
                  </div>
                </button>
              </div>

              <div className="mt-6 flex gap-3">
                <button 
                  onClick={() => setGameState('WORLD_SELECT')}
                  className="px-6 py-5 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 transition-all"
                >
                  BACK
                </button>
                <button 
                  onClick={startGame}
                  className="flex-1 py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
                >
                  <Play className="w-6 h-6 fill-current" />
                  START RUN
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'LOADING' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center overflow-hidden"
            >
              <div className="relative mb-8 flex flex-col items-center w-full">
                {/* Reusing the same chase animation for seamless transition */}
                <div className="absolute w-full h-full pointer-events-none" style={{ top: '-65px' }}>
                  <motion.div
                    initial={{ x: -250, y: 15 }}
                    animate={{ 
                      x: [ -250, -215, -180, -155, -130, -105, -80, -55, -30, -5, 20, 45, 70, 115, 160, 185, 210, 450 ],
                      y: [ 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 79, 29, 79, 79 ],
                      rotate: [ 0, -10, 0, 10, 0, -10, 0, 10, 0, -10, 0, 10, 0, -10, 0, 10, 0, 0 ],
                      scaleY: [ 1, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1 ] 
                    }}
                    transition={{ 
                      duration: 5, 
                      repeat: Infinity,
                      ease: "linear",
                      times: [ 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9, 1 ]
                    }}
                    className="text-6xl absolute left-1/2 -ml-[30px]"
                  >
                    🚽
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={`sheet-load-${i}`}
                        animate={{ 
                          x: [0, -200 - (i * 20)], 
                          y: [0, 20 + (i * 20)],
                          opacity: [0, 1, 1, 0],
                          rotate: [0, -360 * (i + 1)],
                          scale: [0.5, 1, 1, 0.5]
                        }}
                        transition={{ 
                          duration: 1.5 + (i * 0.2), 
                          repeat: Infinity, 
                          repeatDelay: 0.1 + (i * 0.3),
                          times: [0, 0.2, 0.8, 1]
                        }}
                        className="absolute w-4 h-5 bg-white rounded-sm border border-slate-200 -left-4 top-4"
                      />
                    ))}
                    <motion.span
                      animate={{ 
                        x: [0, -180], 
                        y: [0, 60],
                        opacity: [0, 1, 1, 0],
                        rotate: [0, 360],
                        scale: [0.5, 1, 1, 0.5]
                      }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity, 
                        repeatDelay: 0.8,
                        times: [0, 0.2, 0.8, 1]
                      }}
                      className="absolute text-2xl -left-2 top-8"
                    >
                      💩
                    </motion.span>
                  </motion.div>

                  <motion.div
                    animate={{ 
                      x: [ -310, -275, -240, -215, -190, -165, -140, -115, -90, -65, -40, -15, 10, 55, 100, 125, 150, 390 ],
                      y: [ 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 15, -35, 79, 29, 79, 79 ],
                      rotate: [ 0, -5, 0, 5, 0, -5, 0, 5, 0, -5, 0, 5, 0, -5, 0, 5, 0, 0 ],
                    }}
                    initial={{ scaleX: -1 }}
                    transition={{ 
                      duration: 6, 
                      repeat: Infinity,
                      ease: "linear",
                      times: [ 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.85, 0.9, 1 ]
                    }}
                    className="text-4xl absolute left-1/2 -ml-[20px]"
                  >
                    🏃
                  </motion.div>
                </div>
                
                {/* Spacer to keep layout consistent */}
                <div className="h-24" />
              </div>
              
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-2xl font-black tracking-[0.2em] text-sky-400 mt-12"
              >
                LOADING...
              </motion.div>
              
              <div className="mt-8 w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3 }}
                  className="h-full bg-sky-500"
                />
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-rose-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center overflow-y-auto no-scrollbar"
            >
              <div className="relative mb-4 shrink-0">
                <Trash2 className="w-20 h-20 text-rose-500" />
                <motion.span 
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                  className="absolute -top-2 -right-2 text-3xl"
                >
                  🤢
                </motion.span>
              </div>
              <h2 className="text-4xl font-black mb-1 text-white tracking-tighter italic uppercase">
                {timeLeft === 0 ? "TIME'S UP!" : "WASH NEEDED!"}
              </h2>
              <p className="text-rose-200/50 mb-4 font-medium text-xs">
                {timeLeft === 0 
                  ? `Great sprint! You survived 3 minutes in ${selectedWorld.name}.`
                  : `You've reached critical stink levels in ${selectedWorld.name}.`}
              </p>
              
              <div className="bg-black/40 p-5 rounded-3xl w-full mb-4 border border-white/5 shrink-0">
                <div className="mb-4">
                  <span className="text-rose-200/30 text-[10px] uppercase tracking-[0.3em] font-bold block mb-1">Stink Rating</span>
                  <p className="text-lg font-black text-white italic uppercase tracking-tight">
                    {getFeedback()}
                  </p>
                </div>
                <div className="h-px bg-white/5 mb-4" />
                <div className="flex justify-between items-center mb-3">
                  <span className="text-rose-200/30 text-[10px] uppercase tracking-[0.3em] font-bold">Final Score</span>
                  <span className="text-2xl font-black text-white font-mono">{score}</span>
                </div>
                <div className="h-px bg-white/5 mb-3" />
                <div className="flex justify-between items-center">
                  <span className="text-rose-200/30 text-[10px] uppercase tracking-[0.3em] font-bold">Personal Best</span>
                  <span className="text-xl font-black text-emerald-400 font-mono">{highScore}</span>
                </div>
              </div>

              <div className="flex flex-col w-full gap-2 shrink-0">
                <button 
                  onClick={startGame}
                  className="w-full py-4 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <RotateCcw className="w-5 h-5" />
                  RE-FLUSH
                </button>
                <button 
                  onClick={() => setGameState('WORLD_SELECT')}
                  className="w-full py-3 bg-slate-900 text-slate-400 font-bold rounded-2xl hover:bg-slate-800 transition-all active:scale-95 text-sm"
                >
                  CHANGE WORLD
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

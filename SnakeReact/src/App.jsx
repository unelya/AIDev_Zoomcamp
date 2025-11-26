import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import useInterval from './useInterval.js';
import './App.css';

const GRID_SIZE = 20;
const SPEEDS = {
  easy: 200,
  normal: 120,
  hard: 80,
};

const DIRECTIONS = {
  ArrowUp: { x: 0, y: -1, opposite: 'ArrowDown' },
  ArrowDown: { x: 0, y: 1, opposite: 'ArrowUp' },
  ArrowLeft: { x: -1, y: 0, opposite: 'ArrowRight' },
  ArrowRight: { x: 1, y: 0, opposite: 'ArrowLeft' },
};

const spawnSnake = () => [
  {
    x: Math.floor(GRID_SIZE / 2),
    y: Math.floor(GRID_SIZE / 2),
  },
];

const cellId = ({ x, y }) => `${x}-${y}`;

const randomCell = (blocked = []) => {
  const blockedSet = new Set(blocked.map(cellId));
  let attempts = 0;
  let candidate;

  do {
    candidate = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    attempts += 1;
  } while (blockedSet.has(cellId(candidate)) && attempts < 500);

  return candidate;
};

export default function App() {
  const [snake, setSnake] = useState(() => spawnSnake());
  const [direction, setDirection] = useState('ArrowRight');
  const [food, setFood] = useState(() => randomCell(spawnSnake()));
  const [speed, setSpeed] = useState('normal');
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const board = useMemo(
    () =>
      Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, idx) => ({
        x: idx % GRID_SIZE,
        y: Math.floor(idx / GRID_SIZE),
      })),
    []
  );

  const reset = useCallback(() => {
    const freshSnake = spawnSnake();
    setSnake(freshSnake);
    setDirection('ArrowRight');
    setFood(randomCell(freshSnake));
    setScore(0);
    setRunning(false);
    setGameOver(false);
  }, []);

  const toggleRun = () => {
    if (gameOver) {
      const freshSnake = spawnSnake();
      setSnake(freshSnake);
      setDirection('ArrowRight');
      setFood(randomCell(freshSnake));
      setScore(0);
      setGameOver(false);
      setRunning(true);
      return;
    }

    setRunning(prev => !prev);
  };

  useEffect(() => {
    const handleKey = event => {
      if (!DIRECTIONS[event.key]) {
        return;
      }

      if (DIRECTIONS[event.key].opposite === direction && snake.length > 1) {
        return;
      }

      setDirection(event.key);
      if (!running) {
        setRunning(true);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [direction, running, snake.length]);

  const step = useCallback(() => {
    setSnake(prev => {
      const head = prev[0];
      const move = DIRECTIONS[direction] ?? DIRECTIONS.ArrowRight;
      const next = {
        x: (head.x + move.x + GRID_SIZE) % GRID_SIZE,
        y: (head.y + move.y + GRID_SIZE) % GRID_SIZE,
      };

      const hitsSelf = prev.some(segment => segment.x === next.x && segment.y === next.y);
      if (hitsSelf) {
        setRunning(false);
        setGameOver(true);
        return prev;
      }

      const grownSnake = [next, ...prev];
      const eatsFood = next.x === food.x && next.y === food.y;

      if (eatsFood) {
        setScore(current => current + 1);
        setFood(randomCell(grownSnake));
        return grownSnake;
      }

      grownSnake.pop();
      return grownSnake;
    });
  }, [direction, food]);

  useInterval(() => {
    if (running) {
      step();
    }
  }, running ? SPEEDS[speed] : null);

  const statusText = gameOver ? 'Game over — reset to try again.' : running ? 'Keep going!' : 'Press Start or arrow keys to begin.';

  return (
    <div className="app">
      <header className="panel">
        <h1>Snake</h1>
        <p className="status">{statusText}</p>
        <div className="controls">
          <button onClick={toggleRun}>{running ? 'Pause' : gameOver ? 'Restart' : 'Start'}</button>
          <button onClick={reset}>Reset</button>
          <label>
            Speed
            <select value={speed} onChange={event => setSpeed(event.target.value)} disabled={running}>
              {Object.keys(SPEEDS).map(level => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <span className="score">Score: {score}</span>
        </div>
      </header>
      <div className="board">
        {board.map(cell => {
          const snakeIndex = snake.findIndex(segment => segment.x === cell.x && segment.y === cell.y);
          const isFood = cell.x === food.x && cell.y === food.y;

          return (
            <div
              key={`${cell.x}-${cell.y}`}
              className={clsx('cell', {
                food: isFood,
                snake: snakeIndex !== -1,
                head: snakeIndex === 0,
              })}
            />
          );
        })}
      </div>
    </div>
  );
}

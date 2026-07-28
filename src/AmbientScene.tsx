import type {CSSProperties} from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const AMBIENT_DURATION_IN_FRAMES = 1800;

export interface AmbientSceneProps {
  celebrate: boolean;
}

const dotPositions = [
  [12, 17],
  [90, 12],
  [83, 78],
  [8, 81],
  [72, 35],
  [24, 62],
  [48, 15],
  [56, 88],
];

export const getLoopPhase = (frame: number, durationInFrames: number) =>
  (frame / durationInFrames) * Math.PI * 2;

export const getEdgeFade = (
  frame: number,
  durationInFrames: number,
  fps: number,
  delay: number,
) =>
  interpolate(
    frame,
    [delay, delay + fps * 2, durationInFrames - fps * 5, durationInFrames - 1],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

export const AmbientScene = ({celebrate}: AmbientSceneProps) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const phase = getLoopPhase(frame, durationInFrames);
  const pulse = 1 + Math.sin(phase) * 0.08;

  return (
    <AbsoluteFill className="ambient-scene" aria-hidden="true">
      <div
        className="ambient-blob ambient-blob--yellow"
        style={{
          transform: `translate3d(${Math.sin(phase) * 18}px, ${
            Math.cos(phase) * 12
          }px, 0) scale(${pulse})`,
        }}
      />
      <div
        className="ambient-blob ambient-blob--coral"
        style={{
          transform: `translate3d(${Math.cos(phase) * 16}px, ${
            Math.sin(phase) * 18
          }px, 0) scale(${2 - pulse})`,
        }}
      />
      <div
        className="ambient-blob ambient-blob--teal"
        style={{
          transform: `translate3d(${Math.sin(phase * 2) * 12}px, ${
            Math.cos(phase * 2) * 16
          }px, 0)`,
        }}
      />
      {celebrate &&
        dotPositions.map(([left, top], index) => {
          const delay = index * 3;
          const fade = getEdgeFade(frame, durationInFrames, fps, delay);
          const rotation =
            Math.sin(phase + index) * (index % 2 === 0 ? 18 : -14);
          const drift = Math.sin(phase * 2 + index) * 8;
          const style: CSSProperties = {
            left: `${left}%`,
            top: `${top}%`,
            opacity: fade,
            transform: `translateY(${drift}px) scale(${
              0.75 + fade * 0.25
            }) rotate(${rotation}deg)`,
            background:
              index % 3 === 0
                ? '#ff6b55'
                : index % 3 === 1
                  ? '#f2bd41'
                  : '#2e736d',
          };
          return (
            <span
              className={`confetti confetti--${index % 2 === 0 ? 'round' : 'dash'}`}
              key={`${left}-${top}`}
              style={style}
            />
          );
        })}
    </AbsoluteFill>
  );
};

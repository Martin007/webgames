import type {CSSProperties} from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

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

export const AmbientScene = ({celebrate}: AmbientSceneProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: {damping: 18, mass: 0.8, stiffness: 80},
  });
  const pulse = interpolate(Math.sin((frame / 600) * Math.PI * 2), [-1, 1], [
    0.92, 1.08,
  ]);

  return (
    <AbsoluteFill className="ambient-scene" aria-hidden="true">
      <div
        className="ambient-blob ambient-blob--yellow"
        style={{
          transform: `translate3d(${Math.sin(frame / 55) * 18}px, ${
            Math.cos(frame / 70) * 12
          }px, 0) scale(${pulse})`,
          opacity: entrance,
        }}
      />
      <div
        className="ambient-blob ambient-blob--coral"
        style={{
          transform: `translate3d(${Math.cos(frame / 62) * 16}px, ${
            Math.sin(frame / 82) * 18
          }px, 0) scale(${2 - pulse})`,
          opacity: entrance,
        }}
      />
      <div
        className="ambient-blob ambient-blob--teal"
        style={{
          transform: `translate3d(${Math.sin(frame / 75) * 12}px, ${
            Math.cos(frame / 48) * 16
          }px, 0)`,
          opacity: entrance * 0.85,
        }}
      />
      {celebrate &&
        dotPositions.map(([left, top], index) => {
          const delay = index * 3;
          const pop = spring({
            frame: frame - delay,
            fps,
            config: {damping: 12, stiffness: 120},
          });
          const rotation = frame * (index % 2 === 0 ? 0.5 : -0.35);
          const style: CSSProperties = {
            left: `${left}%`,
            top: `${top}%`,
            opacity: pop,
            transform: `scale(${pop}) rotate(${rotation}deg)`,
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

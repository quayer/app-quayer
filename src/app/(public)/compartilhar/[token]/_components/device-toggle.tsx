'use client';

import { AppleIcon, AndroidIcon } from '../_icons';
import type { DeviceType } from '../_constants';

export function DeviceToggle({ device, onChange }: { device: DeviceType; onChange: (d: DeviceType) => void }) {
  return (
    <fieldset className="flex items-center gap-2 border-0 p-0 m-0">
      <legend className="sr-only">Selecione o tipo do seu celular</legend>
      <button
        type="button"
        role="radio"
        aria-checked={device === 'iphone'}
        onClick={() => onChange('iphone')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: device === 'iphone' ? 'rgba(160,160,180,.15)' : 'transparent',
          borderColor: device === 'iphone' ? 'rgba(160,160,180,.4)' : 'var(--color-border-subtle)',
          color: device === 'iphone' ? '#B0B0C4' : 'var(--color-text-tertiary)',
        }}
      >
        <AppleIcon className="w-3.5 h-3.5" aria-hidden="true" />
        iPhone
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={device === 'android'}
        onClick={() => onChange('android')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: device === 'android' ? 'rgba(61,220,132,.1)' : 'transparent',
          borderColor: device === 'android' ? 'rgba(61,220,132,.35)' : 'var(--color-border-subtle)',
          color: device === 'android' ? '#3DDC84' : 'var(--color-text-tertiary)',
        }}
      >
        <AndroidIcon className="w-3.5 h-3.5" aria-hidden="true" />
        Android
      </button>
    </fieldset>
  );
}

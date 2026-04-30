'use client';

import { useState, useEffect } from 'react';
import type { DeviceType } from '../_constants';

export function useDeviceDetection(): DeviceType {
  const [device, setDevice] = useState<DeviceType>('android');
  useEffect(() => {
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setDevice('iphone');
  }, []);
  return device;
}

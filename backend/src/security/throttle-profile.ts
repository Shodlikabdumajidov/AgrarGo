import { SetMetadata } from '@nestjs/common';

export const THROTTLE_PROFILE_KEY = 'throttle:profile';
export type ThrottleProfileName = 'login' | 'register' | 'upload' | 'booking' | 'payment' | 'forgot' | 'verify' | 'reset' | 'pwchange' | 'location' | 'telegram' | 'review' | 'reviewRead';

/** Marshrutga qaysi qo'shimcha (qattiq) rate-limit profili qo'llanishini belgilaydi. */
export const ThrottleProfile = (name: ThrottleProfileName) => SetMetadata(THROTTLE_PROFILE_KEY, name);

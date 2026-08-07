/**
 * Animation utilities and variants for Framer Motion
 * 
 * Provides consistent, elegant animations across the dashboard
 */

import { Variants, Transition } from 'framer-motion';

// ============================================
// TIMING CONSTANTS
// ============================================

export const DURATIONS = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
  dramatic: 0.8,
} as const;

export const EASINGS = {
  smooth: [0.4, 0, 0.2, 1] as const,
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
} as const;

export const springConfig = {
  stiff: { type: 'spring' as const, stiffness: 400, damping: 30 },
  gentle: { type: 'spring' as const, stiffness: 100, damping: 20 },
  bounce: { type: 'spring' as const, stiffness: 300, damping: 10 },
};

// ============================================
// PAGE TRANSITIONS
// ============================================

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: DURATIONS.slow,
      ease: EASINGS.smooth,
      staggerChildren: 0.1,
    }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: { duration: DURATIONS.fast }
  },
};

// ============================================
// CARD ANIMATIONS
// ============================================

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.smooth,
    }
  },
  hover: {
    y: -4,
    scale: 1.02,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.smooth,
    }
  },
  tap: {
    scale: 0.98,
    transition: { duration: DURATIONS.instant }
  },
};

// ============================================
// LIST STAGGER
// ============================================

export const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: DURATIONS.normal,
      ease: EASINGS.smooth,
    }
  },
};

// ============================================
// ALERT ANIMATIONS
// ============================================

export const alertVariants: Variants = {
  initial: { 
    opacity: 0, 
    x: 100, 
    scale: 0.9 
  },
  animate: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: springConfig.stiff,
  },
  exit: { 
    opacity: 0, 
    x: 100,
    scale: 0.9,
    transition: { duration: DURATIONS.fast }
  },
};

// ============================================
// MODAL/DROPDOWN
// ============================================

export const modalVariants: Variants = {
  initial: { 
    opacity: 0, 
    scale: 0.95,
    y: 10 
  },
  animate: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: springConfig.stiff,
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    y: 10,
    transition: { duration: DURATIONS.fast }
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

export const fadeInUp = (delay: number = 0): Variants => ({
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      delay,
      duration: DURATIONS.normal,
      ease: EASINGS.smooth,
    }
  },
});

export const scaleIn = (delay: number = 0): Variants => ({
  initial: { opacity: 0, scale: 0.9 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      delay,
      duration: DURATIONS.normal,
      ease: EASINGS.smooth,
    }
  },
});

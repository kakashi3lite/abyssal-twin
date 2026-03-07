/**
 * AnimatedAlert - Alert banner with smooth entrance/exit animations
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { alertVariants } from '../../lib/animations';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency' | 'normal';

interface AnimatedAlertProps {
  id: string;
  message: string;
  severity: AlertSeverity;
  icon?: string;
  onDismiss?: (id: string) => void;
}

const severityStyles = {
  info: {
    bg: 'bg-blue-950/80',
    border: 'border-blue-500/50',
    text: 'text-blue-200',
    icon: 'ℹ️',
    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.3)]',
  },
  warning: {
    bg: 'bg-yellow-950/80',
    border: 'border-yellow-500/50',
    text: 'text-yellow-200',
    icon: '⚠️',
    glow: 'shadow-[0_0_20px_rgba(234,179,8,0.3)]',
  },
  critical: {
    bg: 'bg-orange-950/80',
    border: 'border-orange-500/50',
    text: 'text-orange-200',
    icon: '🚨',
    glow: 'shadow-[0_0_30px_rgba(249,115,22,0.4)]',
  },
  emergency: {
    bg: 'bg-red-950/80',
    border: 'border-red-500/50',
    text: 'text-red-200',
    icon: '🔴',
    glow: 'shadow-[0_0_40px_rgba(239,68,68,0.5)]',
  },
  normal: {
    bg: 'bg-green-950/80',
    border: 'border-green-500/50',
    text: 'text-green-200',
    icon: '✓',
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]',
  },
};

export const AnimatedAlert: React.FC<AnimatedAlertProps> = ({
  id,
  message,
  severity,
  icon,
  onDismiss,
}) => {
  const styles = severityStyles[severity];
  
  return (
    <motion.div
      layout
      variants={alertVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`
        ${styles.bg} ${styles.border} ${styles.glow}
        border rounded-lg px-4 py-3
        flex items-center gap-3
        backdrop-blur-sm
      `}
    >
      <motion.span 
        className="text-xl"
        animate={severity === 'emergency' ? {
          scale: [1, 1.2, 1],
          transition: { duration: 1, repeat: Infinity }
        } : {}}
      >
        {icon || styles.icon}
      </motion.span>
      
      <span className={`flex-1 text-sm font-medium ${styles.text}`}>
        {message}
      </span>
      
      {onDismiss && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onDismiss(id)}
          className={`${styles.text} opacity-60 hover:opacity-100 transition-opacity`}
        >
          ✕
        </motion.button>
      )}
    </motion.div>
  );
};

interface AlertContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const AlertContainer: React.FC<AlertContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <AnimatePresence mode="popLayout">
        {children}
      </AnimatePresence>
    </div>
  );
};

export default AnimatedAlert;

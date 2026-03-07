/**
 * AnimatedCard - Enhanced card component with smooth animations
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cardVariants } from '../../lib/animations';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glowColor?: 'none' | 'green' | 'yellow' | 'red' | 'blue';
}

const glowStyles = {
  none: '',
  green: 'hover:shadow-[0_0_30px_rgba(34,197,94,0.3)]',
  yellow: 'hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]',
  red: 'hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]',
  blue: 'hover:shadow-[0_0_30px_rgba(56,189,248,0.3)]',
};

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className = '',
  onClick,
  glowColor = 'none',
}) => {
  return (
    <motion.div
      className={`
        bg-slate-900/80 backdrop-blur-sm 
        border border-slate-700/50 
        rounded-xl 
        transition-shadow duration-300
        ${glowStyles[glowColor]}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      whileHover={onClick ? "hover" : undefined}
      whileTap={onClick ? "tap" : undefined}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedCard;

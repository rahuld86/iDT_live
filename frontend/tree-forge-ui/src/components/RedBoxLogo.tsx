import React from 'react';

interface RedBoxLogoProps {
  className?: string;
  size?: number;
}

export const RedBoxLogo: React.FC<RedBoxLogoProps> = ({ 
  className = "", 
  size = 24 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="0" y="0" width="32" height="32" fill="white"/>
      <rect x="2" y="2" width="28" height="28" stroke="#DC2626" strokeWidth="4" fill="none"/>
      <rect x="6" y="8" width="20" height="3" fill="#DC2626"/>
      <rect x="6" y="14" width="14" height="3" fill="#DC2626"/>
      <rect x="6" y="20" width="8" height="3" fill="#DC2626"/>
    </svg>
  );
};

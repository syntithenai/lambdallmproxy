import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette } from 'lucide-react';

interface ImageEditorNavButtonProps {
  className?: string;
}

export const ImageEditorNavButton: React.FC<ImageEditorNavButtonProps> = ({ className = '' }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/image-editor')}
      className={className}
      title="Image Editor"
    >
      <Palette className="w-6 h-6" />
    </button>
  );
};

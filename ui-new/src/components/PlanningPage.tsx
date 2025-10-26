/**
 * PlanningPage Component
 * Full-page planning interface displaying PlanningDialog content
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlanningDialog } from './PlanningDialog';

export const PlanningPage: React.FC = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/');
  };

  const handleTransferToChat = (query: string) => {
    // Store in sessionStorage instead of router state (more reliable)
    console.log('🚀 PlanningPage - Transferring to chat with query:', query.substring(0, 100));
    sessionStorage.setItem('planning_transfer_data', query);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Planning Dialog Content (always open on this page) */}
      <PlanningDialog 
        isOpen={true}
        onClose={handleClose}
        onTransferToChat={handleTransferToChat}
      />
    </div>
  );
};

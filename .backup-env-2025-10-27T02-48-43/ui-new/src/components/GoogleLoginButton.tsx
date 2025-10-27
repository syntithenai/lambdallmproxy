import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCast } from '../contexts/CastContext';

export const GoogleLoginButton: React.FC = () => {
  const { user, logout } = useAuth();
  const { isAvailable, isConnected, deviceName, requestSession, endSession } = useCast();

  // This component only renders when authenticated (protected by App-level auth gate)
  // So we don't need to handle the not-authenticated case

  if (!user) {
    return null; // Should never happen due to app-level auth gate
  }

  const handleCastClick = () => {
    if (isConnected) {
      endSession();
    } else {
      requestSession();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={logout}
        className="btn-secondary px-3 py-2 flex items-center gap-2"
        title={`Sign out ${user.email}`}
        aria-label="Logout"
      >
        {user.picture && (
          <img 
            src={user.picture} 
            alt={user.name || user.email}
            className="w-6 h-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <span>Logout</span>
      </button>
      
      {/* Chromecast Button */}
      {isAvailable && (
        <button
          onClick={handleCastClick}
          className={`btn-secondary p-2 ${
            isConnected ? 'bg-blue-500 text-white hover:bg-blue-600' : ''
          }`}
          title={isConnected ? `Casting to ${deviceName}` : 'Cast to TV'}
          aria-label={isConnected ? `Casting to ${deviceName}` : 'Cast to TV'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1,18 v3 h3 c0,-1.66 -1.34,-3 -3,-3 z M1,14 v2 c2.76,0 5,2.24 5,5 h2 c0,-3.87 -3.13,-7 -7,-7 z M1,10 v2 c4.97,0 9,4.03 9,9 h2 c0,-6.08 -4.93,-11 -11,-11 z M21,3 H3 C1.9,3 1,3.9 1,5 v3 h2 V5 h18 v14 h-7 v2 h7 c1.1,0 2,-0.9 2,-2 V5 c0,-1.1 -0.9,-2 -2,-2 z"/>
          </svg>
        </button>
      )}
    </div>
  );
};

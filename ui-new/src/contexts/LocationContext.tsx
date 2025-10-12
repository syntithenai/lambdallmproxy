import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    formatted?: string;
  };
  timestamp: number;
}

interface LocationContextType {
  location: LocationData | null;
  isLoading: boolean;
  error: string | null;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown';
  requestLocation: () => Promise<void>;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  // Check permission state on mount
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        
        // Listen for permission changes
        result.addEventListener('change', () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        });
      }).catch(() => {
        setPermissionState('unknown');
      });
    }
  }, []);

  // Reverse geocode coordinates to address using OpenStreetMap Nominatim
  const reverseGeocode = async (lat: number, lon: number): Promise<LocationData['address']> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'LLMProxyChat/1.0' // Required by Nominatim
          }
        }
      );

      if (!response.ok) {
        console.warn('Reverse geocoding failed:', response.statusText);
        return undefined;
      }

      const data = await response.json();
      
      if (data.address) {
        return {
          city: data.address.city || data.address.town || data.address.village,
          state: data.address.state,
          country: data.address.country,
          postalCode: data.address.postcode,
          formatted: data.display_name
        };
      }
    } catch (error) {
      console.warn('Error reverse geocoding:', error);
    }
    return undefined;
  };

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      // Get address from coordinates
      const address = await reverseGeocode(latitude, longitude);

      const locationData: LocationData = {
        latitude,
        longitude,
        accuracy,
        address,
        timestamp: Date.now()
      };

      setLocation(locationData);
      setPermissionState('granted');
      
      // Store in localStorage for persistence
      localStorage.setItem('user_location', JSON.stringify(locationData));
      
      console.log('Location updated:', locationData);
    } catch (err: any) {
      let errorMessage = 'Failed to get location';
      
      if (err.code === 1) {
        errorMessage = 'Location permission denied';
        setPermissionState('denied');
      } else if (err.code === 2) {
        errorMessage = 'Location unavailable';
      } else if (err.code === 3) {
        errorMessage = 'Location request timed out';
      }
      
      setError(errorMessage);
      console.error('Geolocation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setError(null);
    localStorage.removeItem('user_location');
  }, []);

  // Load location from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('user_location');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Check if location is less than 24 hours old
        const age = Date.now() - (parsed.timestamp || 0);
        if (age < 24 * 60 * 60 * 1000) {
          setLocation(parsed);
        } else {
          // Location is stale, remove it
          localStorage.removeItem('user_location');
        }
      } catch (error) {
        console.error('Error loading stored location:', error);
        localStorage.removeItem('user_location');
      }
    }
  }, []);

  const value: LocationContextType = {
    location,
    isLoading,
    error,
    permissionState,
    requestLocation,
    clearLocation
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatBytes, formatPercent } from '../utils/shareUtils';

interface LengthWarningBannerProps {
  compressedSize: number;
  percentOfLimit: number;
  shouldForceGoogleDocs: boolean;
}

/**
 * Warning banner for content that approaches or exceeds URL length limits
 * Shows at 80% threshold, forces Google Docs at 100%
 */
export const LengthWarningBanner: React.FC<LengthWarningBannerProps> = ({
  compressedSize,
  percentOfLimit,
  shouldForceGoogleDocs,
}) => {
  if (percentOfLimit < 0.8) {
    return null; // No warning needed
  }

  const bgColor = shouldForceGoogleDocs ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
  const textColor = shouldForceGoogleDocs ? 'text-red-800' : 'text-yellow-800';
  const iconColor = shouldForceGoogleDocs ? 'text-red-600' : 'text-yellow-600';

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bgColor} ${textColor} mb-4`}>
      <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1">
        <h4 className="font-semibold mb-1">
          {shouldForceGoogleDocs ? 'Content Too Large for URL' : 'Large Content Warning'}
        </h4>
        <p className="text-sm mb-2">
          {shouldForceGoogleDocs ? (
            <>
              This content is too large to share via URL ({formatBytes(compressedSize)}, {formatPercent(percentOfLimit)} of limit).
              {' '}A Google Document will be created instead.
            </>
          ) : (
            <>
              This content is approaching the URL size limit ({formatBytes(compressedSize)}, {formatPercent(percentOfLimit)} of limit).
              {' '}Consider using Google Docs for more reliable sharing.
            </>
          )}
        </p>
        {!shouldForceGoogleDocs && (
          <p className="text-xs opacity-80">
            💡 Both URL and Google Docs sharing options are available below
          </p>
        )}
      </div>
    </div>
  );
};

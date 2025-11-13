'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Construction, 
  ArrowLeft, 
  Clock, 
  Code, 
  Zap,
  Sparkles
} from 'lucide-react';

function DevelopmentPhaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Get parameters from URL
  const featureName = searchParams.get('feature') || 'Feature';
  const previousRoute = searchParams.get('previous') || '/admin';
  const currentRoute = searchParams.get('route') || '';

  useEffect(() => {
    // Mark this route as accessed in development phase
    if (currentRoute) {
      sessionStorage.setItem(`dev-phase-${currentRoute}`, 'true');
    }
    
    // Reset progress when component mounts
    setProgress(0);
    
    // Animate progress bar over 3 seconds
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsRedirecting(true);
          // Redirect after progress completes
          setTimeout(() => {
            router.push(previousRoute);
          }, 500);
          return 100;
        }
        return prev + 2; // Increment by 2 every ~60ms for smooth animation
      });
    }, 60);

    return () => clearInterval(interval);
  }, [previousRoute, router, currentRoute]);

  const handleGoBack = () => {
    setIsRedirecting(true);
    router.push(previousRoute);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      {/* Popup Card */}
      <Card className="w-full max-w-md mx-auto shadow-2xl border-0 bg-gradient-to-br from-orange-50 to-amber-50">
        <CardContent className="p-8 text-center">
          {/* Icon with animation */}
          <div className="relative mb-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg">
              <Construction className="h-10 w-10 text-white animate-pulse" />
            </div>
            {/* Floating sparkles */}
            <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 animate-bounce" />
            <Zap className="absolute -bottom-1 -left-1 h-5 w-5 text-orange-400 animate-pulse" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Development Phase
          </h2>
          
          {/* Feature name */}
          <div className="mb-4">
            <p className="text-lg text-gray-600 mb-1">Feature:</p>
            <p className="text-xl font-semibold text-orange-600 bg-orange-100 px-4 py-2 rounded-lg inline-block">
              {featureName}
            </p>
          </div>

          {/* Message */}
          <div className="mb-6 space-y-3">
            <p className="text-gray-700 leading-relaxed">
              This feature is currently in development. 🚧
            </p>
            <p className="text-sm text-gray-600">
              We’ll be launching it soon. Thank you for your patience! <a href="http://iak.ngo/" target="_blank" className="text-orange-600 hover:text-orange-700">Idara Al-Khair Foundation</a>
            </p>
          </div>

          {/* Progress section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Redirecting...
              </span>
              <span className="text-sm font-medium text-gray-600">
                {progress}%
              </span>
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full transition-all duration-100 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <p className="text-xs text-gray-500 mt-2">
              You will be automatically redirected to the previous page.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleGoBack}
              disabled={isRedirecting}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isRedirecting ? 'Redirecting...' : 'Go Back Now'}
            </Button>
          </div>

          {/* Development status */}
          <div className="mt-6 pt-4 border-t border-orange-200">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Code className="h-4 w-4" />
              <span>Development in progress</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DevelopmentPhasePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <DevelopmentPhaseContent />
    </Suspense>
  )
}

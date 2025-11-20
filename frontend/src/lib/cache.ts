// Cache utility functions for frontend
export class CacheManager {
  private static CACHE_PREFIX = 'sis_cache_';
  private static DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Set cache with TTL
  static set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        ttl
      };
      localStorage.setItem(`${this.CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        // Evict oldest entries
        this.evictOldest();
        try {
          // Retry
          const cacheData = {
            data,
            timestamp: Date.now(),
            ttl
          };
          localStorage.setItem(`${this.CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
        } catch {
          // Fallback to sessionStorage
          try {
            const cacheData = {
              data,
              timestamp: Date.now(),
              ttl
            };
            sessionStorage.setItem(`${this.CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
          } catch {
            console.warn('Failed to cache data - storage full');
          }
        }
      } else {
        console.warn('Failed to set cache:', error);
      }
    }
  }

  // Get cache if not expired
  static get(key: string): any | null {
    try {
      // Try localStorage first
      let cached = localStorage.getItem(`${this.CACHE_PREFIX}${key}`);
      
      // If not found in localStorage, try sessionStorage
      if (!cached) {
        cached = sessionStorage.getItem(`${this.CACHE_PREFIX}${key}`);
      }
      
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const now = Date.now();
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.ttl) {
        this.remove(key);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.warn('Failed to get cache:', error);
      return null;
    }
  }

  // Remove specific cache
  static remove(key: string): void {
    try {
      localStorage.removeItem(`${this.CACHE_PREFIX}${key}`);
      sessionStorage.removeItem(`${this.CACHE_PREFIX}${key}`);
    } catch (error) {
      console.warn('Failed to remove cache:', error);
    }
  }

  // Clear all cache
  static clear(): void {
    try {
      for (const store of [localStorage, sessionStorage]) {
        const keys = Object.keys(store);
        keys.forEach(key => {
          if (key.startsWith(this.CACHE_PREFIX)) {
            store.removeItem(key);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  // Get cache with fallback function
  static async getOrSet<T>(
    key: string, 
    fallbackFn: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, fetch and cache
    try {
      const data = await fallbackFn();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      console.error('Failed to fetch data for cache:', error);
      throw error;
    }
  }

  // Evict oldest cache entries
  private static evictOldest(count: number = 5): void {
    try {
      const entries = Object.keys(localStorage)
        .filter(k => k.startsWith(this.CACHE_PREFIX))
        .map(k => {
          try {
            const data = JSON.parse(localStorage.getItem(k) || '{}');
            return { key: k, timestamp: data.timestamp || 0 };
          } catch {
            return { key: k, timestamp: 0 };
          }
        })
        .sort((a, b) => a.timestamp - b.timestamp);
      
      entries.slice(0, count).forEach(e => localStorage.removeItem(e.key));
    } catch (error) {
      console.warn('Failed to evict oldest cache entries:', error);
    }
  }

  // Cache keys
  static KEYS = {
    STUDENTS: 'students',
    TEACHERS: 'teachers',
    CAMPUSES: 'campuses',
    CAMPUS_STUDENT_COUNTS: 'campus_student_counts',
    CAMPUS_TEACHER_COUNTS: 'campus_teacher_counts',
    CAMPUS_CLASSROOM_COUNTS: 'campus_classroom_counts',
    STUDENT_PROFILE: (id: number) => `student_${id}`,
    TEACHER_PROFILE: (id: number) => `teacher_${id}`,
    COORDINATOR_PROFILE: (id: number) => `coordinator_${id}`,
    USER_PROFILE: 'user_profile',
    DASHBOARD_STATS: 'dashboard_stats'
  };
}

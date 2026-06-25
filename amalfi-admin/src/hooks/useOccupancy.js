import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { subscribeBookingSync } from '../utils/bookingSync';

/**
 * High-Fidelity Occupancy Hook
 * Fetches units, bookings, and day tours for the Sanctuary Map (Timeline).
 */
export function useOccupancy() {
  const [data, setData] = useState({ 
    units: [], 
    bookings: [], 
    dayTours: [],
    groupedAreas: [] 
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [result, specData] = await Promise.all([
        api.get('/api/v1/admin/occupancy'),
        api.get('/api/v1/admin/special-bookings').catch(() => ({ special_bookings: [] })),
      ]);
      
      // Extract only RESERVED day tours
      const allSpecial = specData.special_bookings || [];
      const dayTours   = allSpecial.filter(b => b.booking_type === 'day_tour' && b.status === 'RESERVED');

      // Group units by area for the grid headers
      const grouped = result.units.reduce((acc, unit) => {
        const area = unit.area || 'Sanctuary';
        if (!acc[area]) acc[area] = [];
        acc[area].push(unit);
        return acc;
      }, {});

      setData({ 
        units: result.units || [], 
        bookings: result.bookings || [],
        dayTours,
        groupedAreas: Object.entries(grouped || {}).map(([area, units]) => ({ area, units }))
      });
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Occupancy sync failed:', err);
      setError(err.message);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refresh(true);
    }, 30000);

    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeBookingSync(() => {
      refresh(true);
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  return { ...data, loading, refreshing, error, lastUpdated, refresh };
}

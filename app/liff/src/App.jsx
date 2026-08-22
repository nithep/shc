import React, { useState, useEffect } from 'react';
import CheckIn from './CheckIn';
import { Loader2, AlertCircle } from 'lucide-react';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2010634930-gRJCLqbu";

export default function App() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initLiffLogin = async () => {
      try {
        if (!window.liff) throw new Error("LIFF SDK not loaded");

        if (LIFF_ID && LIFF_ID !== "dummy-liff-id") {
          // Wait for liff to be fully initialized from main.jsx
          await window.liff.ready;

          if (!window.liff.isLoggedIn()) {
            // If we have a real LIFF ID and user is not logged in, force login
            window.liff.login({ redirectUri: window.location.href });
            return; // Stop execution, wait for LINE login redirect
          }

          const p = await window.liff.getProfile();
          setProfile(p);
        } else {
          // Dummy profile for browser testing outside LINE
          setProfile({
            userId: 'U1234567890dummy',
            displayName: 'Guest VIP (Demo)',
            pictureUrl: 'https://ui-avatars.com/api/?name=Guest+VIP&background=random'
          });
        }
      } catch (err) {
        console.error("Profile fetch error", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    initLiffLogin();
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <AlertCircle size={48} color="#ef4444" />
        <div style={{ color: '#ef4444' }}>Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={48} color="#8B5CF6" />
        <h2 className="text-gradient animate-fade-up">Loading Hotel ECS...</h2>
      </div>
    );
  }

  return (
    <div>
      <CheckIn profile={profile} />
    </div>
  );
}
